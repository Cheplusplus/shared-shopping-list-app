/**
 * Subscribes to a workspace's named lists (the board's columns) in real time,
 * and bootstraps the workspace's first list if it has none.
 *
 * The bootstrap only fires on a *server*-backed empty snapshot. Firestore
 * serves an empty result from cache before the server responds on a cold
 * load, and treating that as "this workspace has no lists" would create a
 * duplicate default list on every fresh device. A ref also guards against
 * re-running while the create is in flight.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureDefaultList, subscribeToLists } from '../firebase/lists';
import { usePendingPatches } from './usePendingPatches';
import type { List, WithId } from '../types/models';

/** Where a column sits among its siblings. */
export interface ListPlacement {
  order: number;
}

export interface UseListsResult {
  lists: WithId<List>[];
  loading: boolean;
  /**
   * Moves a column on screen immediately and holds it there until `commit`
   * settles, so a dropped column never snaps back mid-write. See
   * `usePendingPatches`.
   */
  placeList: (listId: string, placement: ListPlacement, commit: () => Promise<unknown>) => void;
}

export function useLists(workspaceId: string | null, uid: string | null): UseListsResult {
  const [lists, setLists] = useState<WithId<List>[]>([]);
  const [loading, setLoading] = useState<boolean>(workspaceId !== null);
  const bootstrappedRef = useRef<string | null>(null);
  const { patches, apply } = usePendingPatches<ListPlacement>();

  useEffect(() => {
    if (!workspaceId) {
      setLists([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToLists(workspaceId, (nextLists, fromCache) => {
      setLists(nextLists);
      setLoading(false);

      if (nextLists.length === 0 && !fromCache && uid && bootstrappedRef.current !== workspaceId) {
        bootstrappedRef.current = workspaceId;
        void ensureDefaultList(workspaceId, uid);
      }
    });

    return unsubscribe;
  }, [workspaceId, uid]);

  const patched = useMemo(() => {
    if (Object.keys(patches).length === 0) return lists;
    return lists
      .map((list) => (patches[list.id] ? { ...list, ...patches[list.id] } : list))
      .sort((a, b) => a.order - b.order);
  }, [lists, patches]);

  return { lists: patched, loading, placeList: apply };
}
