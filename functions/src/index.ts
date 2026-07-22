/**
 * Cloud Functions for Listpad.
 *
 * `redeemInviteCode` is the one piece of the stack that must run with
 * Admin SDK privileges (bypassing Firestore security rules) — see
 * docs/spec.md ("Cloud Function: invite redemption"). Everything else in
 * the app is client + rules only.
 *
 * Implementation note: this uses the firebase-functions v2 callable API
 * (`onCall` / `HttpsError` from `firebase-functions/v2/https`) rather than
 * the v1-namespaced `functions.https.onCall` / `functions.https.HttpsError`
 * shown in the plan's pseudocode — the currently-installed firebase-functions
 * major version is v2-first. Behavior (including throwing `HttpsError`
 * with code `'not-found'` on an invalid/inactive code) is identical.
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();

export interface RedeemInviteCodeRequest {
  code: string;
}

export interface RedeemInviteCodeResponse {
  workspaceId: string;
  workspaceName: string;
}

export const redeemInviteCode = onCall(
  async (request: CallableRequest<RedeemInviteCodeRequest>): Promise<RedeemInviteCodeResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to redeem an invite code.');
    }

    const code = request.data?.code;
    if (typeof code !== 'string' || code.trim() === '') {
      throw new HttpsError('invalid-argument', 'An invite code is required.');
    }

    const uid = request.auth.uid;

    const workspacesSnapshot = await db
      .collection('workspaces')
      .where('inviteCode', '==', code)
      .where('inviteCodeActive', '==', true)
      .limit(1)
      .get();

    if (workspacesSnapshot.empty) {
      throw new HttpsError('not-found', 'This invite code is invalid or no longer active.');
    }

    const workspaceDoc = workspacesSnapshot.docs[0];
    const workspaceId = workspaceDoc.id;
    const workspaceName = (workspaceDoc.data().name as string | undefined) ?? '';

    // Prefer the caller's stored profile displayName; fall back to the
    // Auth token's name claim, then a generic label.
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const displayName =
      (userSnapshot.data()?.displayName as string | undefined) ??
      (request.auth.token.name as string | undefined) ??
      'Member';

    await db.doc(`workspaceMembers/${workspaceId}_${uid}`).set({
      workspaceId,
      uid,
      displayName,
      workspaceName,
      role: 'member',
      joinedAt: FieldValue.serverTimestamp(),
    });

    return { workspaceId, workspaceName };
  },
);
