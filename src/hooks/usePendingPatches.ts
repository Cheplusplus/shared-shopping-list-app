/**
 * Holds an optimistic patch over live Firestore data until the write that
 * produced it settles.
 *
 * Without this a dropped row visibly snaps back before jumping to where it
 * was dropped: dnd-kit ends the drag and animates its overlay onto the
 * source element, which is still in the old position because the list only
 * re-renders once `onSnapshot` echoes the write. Patching locally the
 * instant the drop is decided means the element has already moved when the
 * overlay lands on it, so there's nothing to snap back from.
 *
 * The patch is dropped when `commit` settles — by which point the snapshot
 * has long since caught up, since Firestore's local cache applies a write
 * (and fires its listeners) well before the server acknowledges it. On a
 * rejected write the patch goes too, so the row returns to where it was.
 */
import { useCallback, useState, useMemo } from 'react';

export interface PendingPatches<P> {
  /** Patches by document id, to merge over the subscribed data. */
  patches: Record<string, P>;
  /** Patch `id` now, and keep it patched until `commit` settles. */
  apply: (id: string, patch: P, commit: () => Promise<unknown>) => void;
}

export function usePendingPatches<P>(): PendingPatches<P> {
  const [patches, setPatches] = useState<Record<string, P>>({});

  const apply = useCallback((id: string, patch: P, commit: () => Promise<unknown>) => {
    setPatches((current) => ({ ...current, [id]: patch }));
    void commit().finally(() => {
      setPatches((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    });
  }, []);

  return useMemo(() => ({ patches, apply }), [patches, apply]);
}
