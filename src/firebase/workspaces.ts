/**
 * Workspace creation/membership. Invite *redemption* is deliberately not done
 * client-side (see plan's "Security rules approach") — it goes through the
 * `redeemInviteCode` Cloud Function, which runs with Admin SDK privileges.
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { nanoid } from 'nanoid';
import { db, functions } from './config';
import type {
  WorkspaceForCreate,
  WorkspaceMember,
  WorkspaceMemberForCreate,
  WithId,
} from '../types/models';

export interface CreateWorkspaceResult {
  workspaceId: string;
  inviteCode: string;
}

/**
 * Creates a new workspace and the creator's `owner` membership doc in one
 * batched write: `workspaces/{autoId}` (with a fresh `nanoid(8)` invite code)
 * plus `workspaceMembers/{workspaceId}_{uid}`.
 */
export async function createWorkspace(
  name: string,
  uid: string,
  displayName: string,
): Promise<CreateWorkspaceResult> {
  const workspaceRef = doc(collection(db, 'workspaces'));
  const workspaceId = workspaceRef.id;
  const inviteCode = nanoid(8);

  const workspaceDoc: WorkspaceForCreate = {
    name,
    createdBy: uid,
    inviteCode,
    inviteCodeActive: true,
    createdAt: serverTimestamp(),
  };

  const memberDoc: WorkspaceMemberForCreate = {
    workspaceId,
    uid,
    displayName,
    workspaceName: name,
    role: 'owner',
    joinedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(workspaceRef, workspaceDoc);
  batch.set(doc(db, 'workspaceMembers', `${workspaceId}_${uid}`), memberDoc);
  await batch.commit();

  return { workspaceId, inviteCode };
}

export interface RedeemInviteCodeResult {
  workspaceId: string;
  workspaceName: string;
}

/**
 * Calls the `redeemInviteCode` Cloud Function. Resolves with the joined
 * workspace's id/name, or throws (with `error.code === 'not-found'` for an
 * invalid/inactive code — see `functions/src/index.ts`).
 */
export async function redeemInviteCode(code: string): Promise<RedeemInviteCodeResult> {
  const callable = httpsCallable<{ code: string }, RedeemInviteCodeResult>(
    functions,
    'redeemInviteCode',
  );
  const result = await callable({ code });
  return result.data;
}

/**
 * Subscribes to the current user's workspace memberships
 * (`workspaceMembers where uid == uid`) — powers the workspace switcher.
 * Returns an unsubscribe function.
 */
export function subscribeToUserWorkspaceMemberships(
  uid: string,
  callback: (memberships: WithId<WorkspaceMember>[]) => void,
): Unsubscribe {
  const membershipsQuery = query(collection(db, 'workspaceMembers'), where('uid', '==', uid));
  return onSnapshot(membershipsQuery, (snapshot) => {
    callback(
      snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as WorkspaceMember) })),
    );
  });
}

/** Updates `users/{uid}.activeWorkspaceId` — call after creating/switching/redeeming. */
export function setActiveWorkspace(uid: string, workspaceId: string | null): Promise<void> {
  return updateDoc(doc(db, 'users', uid), { activeWorkspaceId: workspaceId });
}

/** Leaves a workspace by deleting the caller's own `workspaceMembers` doc. */
export function leaveWorkspace(workspaceId: string, uid: string): Promise<void> {
  return deleteDoc(doc(db, 'workspaceMembers', `${workspaceId}_${uid}`));
}
