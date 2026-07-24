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
  deleteDoc,
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
import type { Item, ItemForCreate, ItemImage, WithId } from '../types/models';

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
    image: null,
  };

  const itemRef = await addDoc(collection(db, 'workspaces', workspaceId, 'items'), itemDoc);

  await upsertItemHistory({ uid, workspaceId, text: trimmedText });

  return itemRef.id;
}

/**
 * The placeholder label given to an *un-named* photo item (see `addPhotoItem`).
 * An item always needs *some* text for search and screen readers; when the user
 * chooses not to name the photo, this stands in and the UI hides it on screen.
 * A user who *does* type a name gets an ordinary item (via `addItem`) instead.
 */
export const PHOTO_ITEM_TEXT = 'Photo';

/**
 * Creates an un-named photo item — one added by taking/picking a picture with
 * no caption — and returns its id. The caller then uploads the image and calls
 * `setItemImage`, exactly as an existing row's photo control does.
 *
 * Unlike `addItem` it does *not* bump item history ("Photo" is a placeholder,
 * not a name worth suggesting back) and it marks the doc `photoItem: true` so
 * the row hides the placeholder and lets the picture stand alone. If the image
 * upload fails the caller rolls the item back with `deleteItem`, so an empty
 * "Photo" row is never left behind.
 */
export async function addPhotoItem(
  workspaceId: string,
  listId: string,
  uid: string,
  displayName: string,
  order: number,
): Promise<string> {
  const itemDoc: ItemForCreate = {
    listId,
    order,
    text: PHOTO_ITEM_TEXT,
    normalizedText: normalizeText(PHOTO_ITEM_TEXT),
    checked: false,
    addedBy: uid,
    addedByName: displayName,
    archived: false,
    createdAt: serverTimestamp(),
    checkedAt: null,
    archivedAt: null,
    image: null,
    photoItem: true,
  };

  const itemRef = await addDoc(collection(db, 'workspaces', workspaceId, 'items'), itemDoc);
  return itemRef.id;
}

/**
 * Hard-deletes an item. The rest of the app archives rather than deletes; this
 * is only for rolling back an `addPhotoItem` whose image upload failed — that
 * item never became real, so it's removed outright instead of lingering in the
 * archive.
 */
export function deleteItem(workspaceId: string, itemId: string): Promise<void> {
  return deleteDoc(doc(db, 'workspaces', workspaceId, 'items', itemId));
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
 * Points an item at a stored photo, or clears it (`null`).
 *
 * Only the Firestore side — uploading and deleting the object itself is
 * `images.ts`'s job, and the caller sequences the two. The order matters:
 * point at the new object *before* deleting the old one, so a failure
 * between the two leaves an orphan rather than a broken image.
 */
export function setItemImage(
  workspaceId: string,
  itemId: string,
  image: ItemImage | null,
): Promise<void> {
  return updateDoc(doc(db, 'workspaces', workspaceId, 'items', itemId), { image });
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
