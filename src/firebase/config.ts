/**
 * Firebase app initialization. All other `src/firebase/*` modules import
 * `auth` / `db` / `functions` from here rather than re-initializing.
 *
 * Reads config from `VITE_FIREBASE_*` env vars (see `.env.example`) — copy
 * `.env.example` to `.env` and fill in real values from the Firebase console
 * (see `SETUP.md`) before running the app.
 */
import { initializeApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

/**
 * The public Firebase web config. Exported so the messaging layer can forward
 * it to the FCM service worker (which can't read Vite env vars) as query
 * params — see `src/firebase/messaging.ts`. These values are not secret; access
 * control lives in the security rules, not here.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// App Check. This project has App Check *enforcement* turned on for Cloud
// Storage (but not Firestore), so every Storage request must carry a valid
// App Check token or it's rejected with a 401 — which the Storage SDK reports
// confusingly as `storage/unauthenticated` even when Firebase Auth is fine.
// Must be initialized before any service makes a request.
//
// Dev uses a debug token instead of solving a real reCAPTCHA on localhost:
// with `FIREBASE_APPCHECK_DEBUG_TOKEN` set, the SDK prints a token to the
// console on first load — register it once under Firebase console -> App Check
// -> Apps -> (this web app) -> Manage debug tokens. Set VITE_APPCHECK_DEBUG_TOKEN
// to that value to reuse a fixed token across machines, or leave it to `true`
// to have a fresh one generated (and printed) per browser.
if (import.meta.env.DEV) {
  (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
}

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

// TEMP DIAGNOSTIC — remove once App Check uploads work.
if (import.meta.env.DEV) {
  const key = import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY;
  console.log('[appcheck-debug] siteKey loaded:', typeof key === 'string' && key.length > 0,
    'len:', key ? key.length : 0,
    '| debugTokenFlag:', (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN);
  getToken(appCheck, /* forceRefresh */ true)
    .then((t) => console.log('[appcheck-debug] getToken OK, token length:', t.token.length))
    .catch((e) => console.log('[appcheck-debug] getToken FAILED:', (e as { code?: string }).code, (e as Error).message));
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
