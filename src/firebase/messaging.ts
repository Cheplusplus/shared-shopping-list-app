/**
 * Firebase Cloud Messaging (push "ping") client layer.
 *
 * Two halves live here:
 *  - *Receiving*: registering this device for push (permission + FCM token,
 *    stored on the user's `fcmTokens` array) and a foreground-message
 *    subscription so a ping that lands while the app is open shows an in-app
 *    toast instead of a duplicate OS notification.
 *  - *Sending*: the `sendPing` callable wrapper, which hands off to the
 *    Cloud Function that actually fans the push out to a workspace's members.
 *
 * Everything guards on `isPushSupported()` first — plenty of browsers (and any
 * insecure context, and iOS Safari outside an installed PWA) simply can't do
 * web push, and the UI needs to say so rather than throw.
 */
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging,
} from 'firebase/messaging';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { app, db, firebaseConfig, functions } from './config';

/**
 * The Web Push VAPID public key from the Firebase console (Project settings ->
 * Cloud Messaging -> Web configuration -> "Web Push certificates"). Required
 * for `getToken` on the web; without it, receiving push is simply unavailable.
 */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/**
 * The FCM service worker is registered at its own scope so it never collides
 * with vite-plugin-pwa's app-shell worker (which owns the root `/` scope).
 */
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';

/**
 * Remembers this device's current token so we can prune it from the user doc
 * on disable / sign-out (Firestore's `arrayRemove` needs the exact value, and
 * `getToken` isn't guaranteed to return the same string after `deleteToken`).
 */
const DEVICE_TOKEN_KEY = 'listpad-fcm-token';

/** Outcome of a device push-enable attempt, for the UI to react to. */
export type EnablePushResult = 'granted' | 'denied' | 'default' | 'unsupported';

let messagingInstance: Messaging | null = null;
let supportedCache: boolean | null = null;

/**
 * Whether this browser can do web push at all. Memoized — `isSupported()` does
 * real feature detection (service workers, Notifications, Push API, IndexedDB)
 * that won't change within a session.
 */
export async function isPushSupported(): Promise<boolean> {
  if (supportedCache !== null) return supportedCache;
  try {
    supportedCache =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      Boolean(VAPID_KEY) &&
      (await isSupported());
  } catch {
    supportedCache = false;
  }
  return supportedCache;
}

/** The current browser Notification permission, or `'unsupported'`. */
export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Has this device already registered a token (so it's set up to receive)? */
export function isDeviceRegistered(): boolean {
  try {
    return notificationPermission() === 'granted' && Boolean(localStorage.getItem(DEVICE_TOKEN_KEY));
  } catch {
    return false;
  }
}

function getMessagingInstance(): Messaging {
  if (!messagingInstance) messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * Registers the FCM background service worker at its dedicated scope, passing
 * the Firebase config through the URL — a service worker can't read Vite env
 * vars, so `firebase-messaging-sw.js` reads them from `location.search`.
 */
async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
  const params = new URLSearchParams(
    Object.entries(firebaseConfig).filter(([, value]) => Boolean(value)) as [string, string][],
  );
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`, {
    scope: SW_SCOPE,
  });
}

/**
 * Requests notification permission, obtains an FCM token for this device, and
 * appends it to `users/{uid}.fcmTokens`. Idempotent: re-enabling an already
 * granted device just refreshes the same token via `arrayUnion`.
 */
export async function enablePushForDevice(uid: string): Promise<EnablePushResult> {
  if (!(await isPushSupported())) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission; // 'denied' | 'default'

  const registration = await registerMessagingServiceWorker();
  const token = await getToken(getMessagingInstance(), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return 'denied';

  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    // Storage blocked — we can still receive this session; we just can't prune
    // as cleanly on sign-out. The server prunes dead tokens anyway.
  }
  return 'granted';
}

/**
 * Removes this device's token from the user doc and revokes it with FCM.
 * Best-effort and safe to call when nothing is registered (no-op then).
 * Used by the per-device toggle and on sign-out.
 */
export async function disablePushForDevice(uid: string): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    token = null;
  }

  try {
    if (await isPushSupported()) await deleteToken(getMessagingInstance());
  } catch {
    // Token already gone / SW unavailable — carry on and clear our records.
  }

  if (token) {
    try {
      await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
    } catch {
      // Signed out mid-flight or offline — the server prunes dead tokens on
      // the next send anyway.
    }
  }
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** A ping as surfaced to the foreground toast. */
export interface ForegroundPing {
  title: string;
  body: string;
}

/**
 * Subscribes to messages that arrive while the app is foregrounded (the
 * background SW handler doesn't fire then). Returns an unsubscribe, or a no-op
 * if push isn't supported. The callback gets the ping's title/body so the app
 * can show its own toast rather than a second OS notification.
 */
export function onForegroundPing(callback: (ping: ForegroundPing) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  void isPushSupported().then((supported) => {
    if (!supported || cancelled) return;
    unsubscribe = onMessage(getMessagingInstance(), (payload: MessagePayload) => {
      const data = payload.data ?? {};
      callback({
        title: data.title ?? 'Listpad',
        body: data.body ?? 'Someone pinged your list',
      });
    });
  });

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export interface SendPingInput {
  workspaceId: string;
  /** Omit to ping every other member of the workspace. */
  targetUid?: string;
  /** Optional short note shown in the notification body. */
  message?: string;
}

export interface SendPingResult {
  /** How many people were targeted (regardless of whether they had devices). */
  recipients: number;
  /** How many device pushes FCM accepted for delivery. */
  delivered: number;
}

/**
 * Calls the `sendPing` Cloud Function (see `functions/src/index.ts`), which
 * verifies membership server-side and fans the push out. The *sender* doesn't
 * need notifications enabled — only receivers do.
 */
export async function sendPing(input: SendPingInput): Promise<SendPingResult> {
  const callable = httpsCallable<SendPingInput, SendPingResult>(functions, 'sendPing');
  const result = await callable(input);
  return result.data;
}
