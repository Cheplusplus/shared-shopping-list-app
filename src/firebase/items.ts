/**
 * `workspaces/{workspaceId}/items` CRUD + the active-list subscription.
 *
 * Design note: `addItem` writes the item doc, then calls
 * `history.ts`'s `upsertItemHistory` itself (rather than requiring callers
 * to compose both) — callers just call `addItem` and both the item and its
 * history bump happen together. The two writes are not in a single atomic
 * batch (the history upsert reuses `upsertItemHistory`'s own batch of the
 * two history docs); history counts are best-effort/eventually-consistent
 * by nature, so this tradeoff favors not duplicating the doc-ID
 * sanitization/upsert logic here.
 */
import {
  collection,
  doc,
  addDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { normalizeText, upsertItemHistory } from './history';
import type { Item, ItemForCreate, WithId } from '../types/models';

/**
 * Adds an item to a workspace's active list and upserts both history docs
 * for the adding user. Returns the new item's id.
 */
export async function addItem(
  workspaceId: string,
  uid: string,
  displayName: string,
  text: string,
): Promise<string> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('Item text must not be empty.');
  }

  const itemDoc: ItemForCreate = {
    text: trimmedText,
    normalizedText: normalizeText(trimmedText),
    checked: false,
    addedBy: uid,
    addedByName: displayName,
    archived: false,
    createdAt: serverTimestamp(),
    checkedAt: null,
    archivedAt: null,
  };

  const itemRef = await addDoc(collection(db, 'workspaces', workspaceId, 'items'), itemDoc);

  await upsertItemHistory({ uid, workspaceId, text: trimmedText });

  return itemRef.id;
}

/** Toggles an item's `checked` state, stamping/clearing `checkedAt`. */
export function toggleChecked(
  workspaceId: string,
  itemId: string,
  checked: boolean,
): Promise<void> {
  return updateDoc(doc(db, 'workspaces', workspaceId, 'items', itemId), {
    checked,
    checkedAt: checked ? serverTimestamp() : null,
  });
}

/**
 * Archives (soft-deletes) all currently-checked, unarchived items in a
 * workspace in one batched write. History docs are untouched. Returns the
 * number of items archived.
 */
export async function clearChecked(workspaceId: string): Promise<number> {
  const itemsRef = collection(db, 'workspaces', workspaceId, 'items');
  const checkedQuery = query(
    itemsRef,
    where('checked', '==', true),
    where('archived', '==', false),
  );
  const snapshot = await getDocs(checkedQuery);
  if (snapshot.empty) {
    return 0;
  }

  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, { archived: true, archivedAt: serverTimestamp() });
  });
  await batch.commit();

  return snapshot.size;
}

/**
 * Subscribes to a workspace's active (unarchived) items, ordered `checked`
 * ASC (unchecked first) then `createdAt` ASC. Returns an unsubscribe
 * function. Requires the composite index in `firestore.indexes.json`
 * (`archived ASC, checked ASC, createdAt ASC`).
 */
export function subscribeToActiveItems(
  workspaceId: string,
  callback: (items: WithId<Item>[]) => void,
): Unsubscribe {
  const itemsRef = collection(db, 'workspaces', workspaceId, 'items');
  const activeQuery = query(
    itemsRef,
    where('archived', '==', false),
    orderBy('checked', 'asc'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(activeQuery, (snapshot) => {
    callback(
      snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Item) })),
    );
  });
}
