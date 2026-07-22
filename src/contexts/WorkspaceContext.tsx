/**
 * Exposes the signed-in user's workspace memberships and the currently
 * active workspace.
 *
 * ============================================================================
 * CROSS-AGENT CONTRACT — `useWorkspace()`
 * ============================================================================
 * This is the hook Agent 3 (shopping list UI) consumes for `activeWorkspaceId`.
 * Its exact return shape:
 *
 *   {
 *     workspaces: WithId<WorkspaceMember>[]   // the user's memberships,
 *                                              // denormalized workspaceName
 *                                              // included — good enough for
 *                                              // a switcher UI with no extra
 *                                              // reads
 *     activeWorkspaceId: string | null        // currently active workspace,
 *                                              // or null if none selected /
 *                                              // signed out / no memberships
 *     setActiveWorkspaceId: (id: string | null) => Promise<void>
 *                                              // updates local state
 *                                              // optimistically AND persists
 *                                              // to users/{uid}.activeWorkspaceId
 *                                              // via setActiveWorkspace()
 *     loading: boolean                        // true until the initial
 *                                              // memberships + active-id
 *                                              // reads have resolved
 *   }
 * ============================================================================
 *
 * Notes:
 * - `activeWorkspaceId` is persisted server-side on the `users/{uid}` doc
 *   (`activeWorkspaceId` field per `src/types/models.ts`). There's no
 *   exported getter for that field in `src/firebase/*`, so this context
 *   subscribes to the doc directly via Firestore's `onSnapshot`/`doc` using
 *   the `db` instance exported from `src/firebase/config.ts`.
 * - If the persisted `activeWorkspaceId` doesn't match any of the user's
 *   current memberships (e.g. they left that workspace on another device),
 *   this context falls back to the first available membership and persists
 *   that as the new active workspace, so consumers never have to special-case
 *   a "dangling" id.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  setActiveWorkspace,
  subscribeToUserWorkspaceMemberships,
} from '../firebase/workspaces';
import type { User, WorkspaceMember, WithId } from '../types/models';
import { useAuth } from './AuthContext';

export interface WorkspaceContextValue {
  /** The signed-in user's workspace memberships (denormalized, one query). */
  workspaces: WithId<WorkspaceMember>[];
  /** The currently active workspace id, or `null` if none is selected. */
  activeWorkspaceId: string | null;
  /** Sets (and persists) the active workspace. */
  setActiveWorkspaceId: (workspaceId: string | null) => Promise<void>;
  /** `true` until the initial memberships + active-id reads have resolved. */
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [workspaces, setWorkspaces] = useState<WithId<WorkspaceMember>[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [activeIdLoaded, setActiveIdLoaded] = useState(false);

  // Tracks whether we've already issued a fallback correction for the
  // current uid, so we don't loop if the write races the snapshot.
  const fallbackAppliedRef = useRef(false);

  useEffect(() => {
    fallbackAppliedRef.current = false;
    setWorkspaces([]);
    setActiveWorkspaceIdState(null);
    setMembershipsLoaded(false);
    setActiveIdLoaded(false);

    if (!uid) {
      // Signed out: nothing to load, and there's nothing to be "loading".
      setMembershipsLoaded(true);
      setActiveIdLoaded(true);
      return;
    }

    const unsubscribeMemberships = subscribeToUserWorkspaceMemberships(uid, (memberships) => {
      setWorkspaces(memberships);
      setMembershipsLoaded(true);
    });

    const unsubscribeUserDoc = onSnapshot(doc(db, 'users', uid), (snapshot) => {
      const data = snapshot.data() as User | undefined;
      setActiveWorkspaceIdState(data?.activeWorkspaceId ?? null);
      setActiveIdLoaded(true);
    });

    return () => {
      unsubscribeMemberships();
      unsubscribeUserDoc();
    };
  }, [uid]);

  // Fallback: if the persisted active id doesn't match any current
  // membership (dangling reference), switch to the first membership.
  useEffect(() => {
    if (!uid || !membershipsLoaded || !activeIdLoaded || fallbackAppliedRef.current) return;
    if (workspaces.length === 0) return;
    const isValid = workspaces.some((membership) => membership.workspaceId === activeWorkspaceId);
    if (activeWorkspaceId !== null && isValid) return;

    fallbackAppliedRef.current = true;
    const fallbackId = workspaces[0].workspaceId;
    setActiveWorkspaceIdState(fallbackId);
    void setActiveWorkspace(uid, fallbackId);
  }, [uid, workspaces, activeWorkspaceId, membershipsLoaded, activeIdLoaded]);

  const setActiveWorkspaceId = useMemo(
    () => async (workspaceId: string | null) => {
      if (!uid) return;
      setActiveWorkspaceIdState(workspaceId);
      await setActiveWorkspace(uid, workspaceId);
    },
    [uid],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspaceId,
      setActiveWorkspaceId,
      loading: !(membershipsLoaded && activeIdLoaded),
    }),
    [workspaces, activeWorkspaceId, setActiveWorkspaceId, membershipsLoaded, activeIdLoaded],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * Reads the current user's workspace memberships + active workspace.
 * Must be used within a `<WorkspaceProvider>` (which itself must be nested
 * inside an `<AuthProvider>` — see doc comment in `routing/AppRoutes.tsx`).
 */
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
