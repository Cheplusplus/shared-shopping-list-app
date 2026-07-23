/**
 * `workspaces/{workspaceId}/lists` CRUD — the named lists that render as
 * board columns.
 *
 * `order` is shared by all members (it lives on the list doc, not per-user),
 * so everyone in a workspace sees the same column arrangement.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { commitInChunks } from './batch';
import { archiveItems } from './items';
import { ORDER_STEP, sequentialOrders } from '../lib/ordering';
import type { Item, List, ListForCreate, WithId } from '../types/models';

/**
 * Doc id of the list every workspace starts with. Deterministic on purpose:
 * if two clients bootstrap the same workspace at once they converge on one
 * list instead of racing to create two. See `ensureDefaultList`.
 */
export const DEFAULT_LIST_ID = 'default';

const DEFAULT_LIST_NAME = 'Shopping list';

/** Subscribes to a workspace's lists, ordered by `order` ASC. */
export function subscribeToLists(
  workspaceId: string,
  callback: (lists: WithId<List>[], fromCache: boolean) => void,
): Unsubscribe {
  const listsQuery = query(
    collection(db, 'workspaces', workspaceId, 'lists'),
    orderBy('order', 'asc'),
  );
  return onSnapshot(listsQuery, (snapshot) => {
    callback(
      snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as List) })),
      snapshot.metadata.fromCache,
    );
  });
}

/** Creates a list. Returns its new id. */
export async function createList(
  workspaceId: string,
  uid: string,
  name: string,
  order: number,
): Promise<string> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('List name must not be empty.');
  }

  const listRef = doc(collection(db, 'workspaces', workspaceId, 'lists'));
  const listDoc: ListForCreate = {
    name: trimmedName,
    order,
    createdBy: uid,
    createdAt: serverTimestamp(),
  };
  await setDoc(listRef, listDoc);
  return listRef.id;
}

/** Renames a list. */
export function renameList(workspaceId: string, listId: string, name: string): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('List name must not be empty.');
  }
  return updateDoc(doc(db, 'workspaces', workspaceId, 'lists', listId), { name: trimmedName });
}

/** Repositions a list among its siblings. */
export function setListOrder(workspaceId: string, listId: string, order: number): Promise<void> {
  return updateDoc(doc(db, 'workspaces', workspaceId, 'lists', listId), { order });
}

/**
 * Deletes a list, archiving whatever it still holds first — consistent with
 * "Clear checked", nothing is ever hard-deleted. `itemIds` are the list's
 * active items, which the caller already has from its subscription.
 *
 * Callers must not delete a workspace's only list; the board would have
 * nowhere to add items.
 */
export async function deleteList(
  workspaceId: string,
  listId: string,
  itemIds: readonly string[],
): Promise<void> {
  await archiveItems(workspaceId, itemIds);
  await deleteDoc(doc(db, 'workspaces', workspaceId, 'lists', listId));
}

/** Rewrites column orders as clean, evenly-spaced numbers. */
export function normalizeListOrders(
  workspaceId: string,
  lists: readonly WithId<List>[],
): Promise<void> {
  const orders = sequentialOrders(lists.length);
  return commitInChunks(
    lists.map((list, index) => ({ id: list.id, order: orders[index] })),
    (batch, entry) => {
      batch.update(doc(db, 'workspaces', workspaceId, 'lists', entry.id), { order: entry.order });
    },
  );
}

/**
 * Gives a workspace with no lists its first one, and adopts any pre-existing
 * items into it.
 *
 * Items predating named lists have no `listId`, which means they match no
 * list query and would silently vanish from the UI. So the bootstrap also
 * backfills `listId` + spaced `order` values (oldest first, preserving the
 * order they used to render in) on every item missing them.
 *
 * Reads the items collection unfiltered so no composite index is involved —
 * this runs once per workspace, before any index for the new schema is
 * guaranteed to exist.
 */
export async function ensureDefaultList(workspaceId: string, uid: string): Promise<void> {
  const listRef = doc(db, 'workspaces', workspaceId, 'lists', DEFAULT_LIST_ID);
  const listDoc: ListForCreate = {
    name: DEFAULT_LIST_NAME,
    order: ORDER_STEP,
    createdBy: uid,
    createdAt: serverTimestamp(),
  };
  await setDoc(listRef, listDoc, { merge: true });

  const itemsSnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'items'));
  const orphans = itemsSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Partial<Item>) }))
    .filter((item) => typeof item.listId !== 'string')
    .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));

  if (orphans.length === 0) return;

  const orders = sequentialOrders(orphans.length);
  await commitInChunks(
    orphans.map((item, index) => ({ id: item.id, order: orders[index] })),
    (batch, entry) => {
      batch.update(doc(db, 'workspaces', workspaceId, 'items', entry.id), {
        listId: DEFAULT_LIST_ID,
        order: entry.order,
      });
    },
  );
}
