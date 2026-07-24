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
import { getMessaging } from 'firebase-admin/messaging';
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

/**
 * `sendPing` — deliver a push "ping" to a workspace's members.
 *
 * Runs Admin-side for two reasons the client can't: it reads *other* members'
 * FCM tokens (each stored on their own `users/{uid}` doc, which security rules
 * keep private to its owner), and it prunes tokens FCM reports as dead.
 *
 * Contract: `{ workspaceId, targetUid?, message? }`.
 *   - `targetUid` omitted -> ping every *other* member of the workspace.
 *   - `targetUid` given    -> ping just that member (must be in the workspace).
 * The caller must be a member. Pings are sent DATA-ONLY so the recipient's
 * service worker renders exactly one notification (see
 * `public/firebase-messaging-sw.js`).
 */
export interface SendPingRequest {
  workspaceId: string;
  targetUid?: string;
  message?: string;
}

export interface SendPingResponse {
  recipients: number;
  delivered: number;
}

// FCM error codes that mean "this token is dead, stop sending to it".
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export const sendPing = onCall(
  async (request: CallableRequest<SendPingRequest>): Promise<SendPingResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to send a ping.');
    }

    const uid = request.auth.uid;
    const workspaceId = request.data?.workspaceId;
    const targetUid = request.data?.targetUid;
    const rawMessage = request.data?.message;

    if (typeof workspaceId !== 'string' || workspaceId.trim() === '') {
      throw new HttpsError('invalid-argument', 'A workspaceId is required.');
    }

    // Caller must be a member of the workspace.
    const callerSnap = await db.doc(`workspaceMembers/${workspaceId}_${uid}`).get();
    if (!callerSnap.exists) {
      throw new HttpsError('permission-denied', 'You are not a member of this workspace.');
    }
    const callerName = (callerSnap.data()?.displayName as string | undefined) ?? 'Someone';
    const workspaceName = (callerSnap.data()?.workspaceName as string | undefined) ?? 'your list';

    // Resolve who gets pinged.
    let targetUids: string[];
    if (typeof targetUid === 'string' && targetUid.trim() !== '') {
      if (targetUid === uid) {
        throw new HttpsError('invalid-argument', 'You cannot ping yourself.');
      }
      const targetSnap = await db.doc(`workspaceMembers/${workspaceId}_${targetUid}`).get();
      if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'That person is not a member of this workspace.');
      }
      targetUids = [targetUid];
    } else {
      const membersSnap = await db
        .collection('workspaceMembers')
        .where('workspaceId', '==', workspaceId)
        .get();
      targetUids = membersSnap.docs
        .map((doc) => doc.data().uid as string)
        .filter((memberUid) => memberUid && memberUid !== uid);
    }

    if (targetUids.length === 0) {
      return { recipients: 0, delivered: 0 };
    }

    // Collect each target's tokens, remembering which uid owns each token so a
    // dead one can be pruned from the right user doc.
    const userSnaps = await db.getAll(...targetUids.map((u) => db.doc(`users/${u}`)));
    const tokenOwners: { uid: string; token: string }[] = [];
    for (const snap of userSnaps) {
      const tokens = snap.data()?.fcmTokens;
      if (Array.isArray(tokens)) {
        for (const token of tokens) {
          if (typeof token === 'string' && token) tokenOwners.push({ uid: snap.id, token });
        }
      }
    }

    if (tokenOwners.length === 0) {
      return { recipients: targetUids.length, delivered: 0 };
    }

    const trimmed = typeof rawMessage === 'string' ? rawMessage.trim().slice(0, 140) : '';
    const body = trimmed !== '' ? `${callerName}: ${trimmed}` : `${callerName} is looking at the list`;

    const response = await getMessaging().sendEachForMulticast({
      tokens: tokenOwners.map((owner) => owner.token),
      // Data-only: the recipient SW builds the single notification itself.
      data: {
        type: 'ping',
        workspaceId,
        title: `Listpad · ${workspaceName}`,
        body,
        link: '/',
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: '/' },
      },
    });

    // Prune any tokens FCM rejected as permanently dead, grouped by owner.
    const deadByUid = new Map<string, string[]>();
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (code && DEAD_TOKEN_CODES.has(code)) {
        const owner = tokenOwners[index];
        const existing = deadByUid.get(owner.uid) ?? [];
        existing.push(owner.token);
        deadByUid.set(owner.uid, existing);
      }
    });

    await Promise.all(
      Array.from(deadByUid.entries()).map(([ownerUid, tokens]) =>
        db
          .doc(`users/${ownerUid}`)
          .update({ fcmTokens: FieldValue.arrayRemove(...tokens) })
          .catch(() => {
            /* best-effort cleanup — a failure here doesn't fail the ping */
          }),
      ),
    );

    return { recipients: targetUids.length, delivered: response.successCount };
  },
);
