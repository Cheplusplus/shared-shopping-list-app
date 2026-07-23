/**
 * `workspaces/{workspaceId}/items` CRUD + the active-list subscription.
 *
 * Items live flat under the workspace and carry a `listId` (see the `Item`
 * doc comment in `src/types/models.ts`), so every read here is scoped to a
 * single list and moving an item between lists is one field update.
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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { commitInChunks } from './batch';
import { normalizeText, upsertItemHistory } from './history';
import { sequentialOrders } from '../lib/ordering';
import type { Item, ItemForCreate, WithId } from '../types/models';

/**
 * Adds an item to a list and upserts both history docs for the adding user.
 * Returns the new item's id.
 *
 * `order` is supplied by the caller — the column that renders the add box is
 * already subscribed to its items, so it knows where "the end of the list"
 * is without this function spending a read to find out.
 */
export async function addItem(
  workspaceId: string,
  listId: string,
  uid: string,
  displayName: string,
  text: string,
  order: number,
): Promise<string> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('Item text must not be empty.');
  }

  const itemDoc: ItemForCreate = {
    listId,
    order,
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
 * Repositions an item: within its own list (pass its current `listId`) or
 * into another one. A single-doc update, so Firestore's offline cache
 * applies it instantly and the open subscriptions re-sort themselves.
 */
export function moveItem(
  workspaceId: string,
  itemId: string,
  listId: string,
  order: number,
): Promise<void> {
  return updateDoc(doc(db, 'workspaces', workspaceId, 'items', itemId), { listId, order });
}

/**
 * Archives (soft-deletes) the given items. Callers pass ids they already
 * hold from their live subscription, so this costs no reads — and needs no
 * composite index for a checked/archived/listId query.
 */
export function archiveItems(workspaceId: string, itemIds: readonly string[]): Promise<void> {
  return commitInChunks(itemIds, (batch, itemId) => {
    batch.update(doc(db, 'workspaces', workspaceId, 'items', itemId), {
      archived: true,
      archivedAt: serverTimestamp(),
    });
  });
}

/**
 * Rewrites a column's `order` values as clean, evenly-spaced numbers.
 * Called after a drop collapses the gap between neighbours too far (see
 * `needsNormalize` in `src/lib/ordering.ts`). `items` must already be in
 * the order they should end up in.
 */
export function normalizeItemOrders(
  workspaceId: string,
  items: readonly WithId<Item>[],
): Promise<void> {
  const orders = sequentialOrders(items.length);
  return commitInChunks(
    items.map((item, index) => ({ id: item.id, order: orders[index] })),
    (batch, entry) => {
      batch.update(doc(db, 'workspaces', workspaceId, 'items', entry.id), { order: entry.order });
    },
  );
}

/**
 * Subscribes to one list's active (unarchived) items, ordered `checked`
 * ASC (unchecked first) then `order` ASC. Returns an unsubscribe function.
 * Requires the composite index in `firestore.indexes.json`
 * (`archived ASC, listId ASC, checked ASC, order ASC`).
 */
export function subscribeToActiveItems(
  workspaceId: string,
  listId: string,
  callback: (items: WithId<Item>[]) => void,
): Unsubscribe {
  const itemsRef = collection(db, 'workspaces', workspaceId, 'items');
  const activeQuery = query(
    itemsRef,
    where('archived', '==', false),
    where('listId', '==', listId),
    orderBy('checked', 'asc'),
    orderBy('order', 'asc'),
  );
  return onSnapshot(activeQuery, (snapshot) => {
    callback(
      snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Item) })),
    );
  });
}
