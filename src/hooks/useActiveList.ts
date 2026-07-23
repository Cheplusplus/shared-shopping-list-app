/**
 * Tracks which list the narrow-screen (one-list-at-a-time) view is showing.
 *
 * Persisted to `localStorage` per workspace rather than to Firestore: it's a
 * per-device viewport concern, not shared state — the board on a desktop
 * shows every list at once and ignores this entirely.
 *
 * Falls back to the first list whenever the remembered one is gone (deleted,
 * or belonging to a workspace the user has switched away from).
 */
import { useCallback, useEffect, useState } from 'react';
import type { List, WithId } from '../types/models';

const STORAGE_PREFIX = 'listpad:activeList:';

function readStored(workspaceId: string | null): string | null {
  if (!workspaceId) return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + workspaceId);
  } catch {
    // Private-mode/quota failures shouldn't take the list view down.
    return null;
  }
}

function writeStored(workspaceId: string, listId: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + workspaceId, listId);
  } catch {
    // Ignore — the choice just won't survive a reload.
  }
}

export function useActiveList(
  workspaceId: string | null,
  lists: readonly WithId<List>[],
): [string | null, (listId: string) => void] {
  const [activeListId, setActiveListIdState] = useState<string | null>(() =>
    readStored(workspaceId),
  );

  const setActiveListId = useCallback(
    (listId: string) => {
      setActiveListIdState(listId);
      if (workspaceId) writeStored(workspaceId, listId);
    },
    [workspaceId],
  );

  // Re-read on workspace change, then correct a dangling/absent selection
  // once the lists themselves have loaded.
  useEffect(() => {
    setActiveListIdState(readStored(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (lists.length === 0) return;
    if (activeListId && lists.some((list) => list.id === activeListId)) return;
    setActiveListIdState(lists[0].id);
  }, [lists, activeListId]);

  return [activeListId, setActiveListId];
}
