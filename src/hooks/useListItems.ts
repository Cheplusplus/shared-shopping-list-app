/**
 * Subscribes to a workspace's active (unarchived) items in real time.
 *
 * Wraps `subscribeToActiveItems` from `src/firebase/items.ts`. When
 * `workspaceId` is `null` (e.g. no workspace selected yet), returns an empty
 * list with `loading: false` rather than subscribing to anything.
 */
import { useEffect, useState } from 'react';
import { subscribeToActiveItems } from '../firebase/items';
import type { Item, WithId } from '../types/models';

export interface UseListItemsResult {
  items: WithId<Item>[];
  loading: boolean;
}

export function useListItems(workspaceId: string | null): UseListItemsResult {
  const [items, setItems] = useState<WithId<Item>[]>([]);
  const [loading, setLoading] = useState<boolean>(workspaceId !== null);

  useEffect(() => {
    if (!workspaceId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToActiveItems(workspaceId, (nextItems) => {
      setItems(nextItems);
      setLoading(false);
    });

    return unsubscribe;
  }, [workspaceId]);

  return { items, loading };
}
