/**
 * Subscribes to the active items of *every* list on the board at once,
 * keyed by list id.
 *
 * The board owns these subscriptions rather than each column owning its own
 * because drag-and-drop needs them at the top: when an item is dropped, the
 * handler has to read the *target* column's items to work out which two
 * neighbours the dropped item lands between. It also means switching lists
 * on a phone is instant, and dropping onto a list tab works without that
 * list being on screen.
 *
 * A list with no entry in the returned map hasn't had its first snapshot
 * yet — which is how a column tells "still loading" from "genuinely empty".
 */
import { useEffect, useMemo, useState } from 'react';
import { subscribeToActiveItems } from '../firebase/items';
import { usePendingPatches } from './usePendingPatches';
import type { Item, WithId } from '../types/models';

export type ItemsByList = Record<string, WithId<Item>[]>;

/** Where an item sits: which list, and where within it. */
export interface ItemPlacement {
  listId: string;
  order: number;
}

export interface UseBoardItemsResult {
  itemsByList: ItemsByList;
  /**
   * Moves an item on screen immediately and holds it there until `commit`
   * settles, so a dropped row never snaps back to where it came from while
   * the Firestore write is in flight. See `usePendingPatches`.
   */
  placeItem: (itemId: string, placement: ItemPlacement, commit: () => Promise<unknown>) => void;
}

export function useBoardItems(
  workspaceId: string | null,
  listIds: readonly string[],
): UseBoardItemsResult {
  const [itemsByList, setItemsByList] = useState<ItemsByList>({});
  const { patches, apply } = usePendingPatches<ItemPlacement>();

  // List ids are Firestore document ids, so they never contain '|'. Joining
  // them gives the effect a stable primitive dependency — `listIds` itself is
  // a fresh array on every render of the board.
  const listKey = listIds.join('|');

  useEffect(() => {
    const ids = listKey ? listKey.split('|') : [];

    if (!workspaceId || ids.length === 0) {
      setItemsByList({});
      return;
    }

    // Drop entries for lists that no longer exist, but keep the ones that do
    // so adding a list doesn't blank out the whole board for a frame.
    setItemsByList((previous) =>
      Object.fromEntries(ids.filter((id) => id in previous).map((id) => [id, previous[id]])),
    );

    const unsubscribes = ids.map((listId) =>
      subscribeToActiveItems(workspaceId, listId, (items) => {
        setItemsByList((previous) => ({ ...previous, [listId]: items }));
      }),
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [workspaceId, listKey]);

  const patched = useMemo(() => applyPlacements(itemsByList, patches), [itemsByList, patches]);

  return { itemsByList: patched, placeItem: apply };
}

/**
 * Re-buckets and re-sorts the subscribed items with any pending placements
 * merged in, matching the order `subscribeToActiveItems` queries in:
 * unchecked before checked, then by `order`.
 */
function applyPlacements(
  itemsByList: ItemsByList,
  placements: Record<string, ItemPlacement>,
): ItemsByList {
  if (Object.keys(placements).length === 0) return itemsByList;

  // Seed from the subscribed keys so "no entry yet" still means "loading".
  const result: ItemsByList = Object.fromEntries(
    Object.keys(itemsByList).map((listId) => [listId, [] as WithId<Item>[]]),
  );

  for (const items of Object.values(itemsByList)) {
    for (const item of items) {
      const placement = placements[item.id];
      const placed = placement ? { ...item, ...placement } : item;
      result[placed.listId]?.push(placed);
    }
  }

  for (const items of Object.values(result)) {
    items.sort((a, b) => Number(a.checked) - Number(b.checked) || a.order - b.order);
  }

  return result;
}
