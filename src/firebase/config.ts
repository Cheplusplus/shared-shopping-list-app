/**
 * Firebase app initialization. All other `src/firebase/*` modules import
 * `auth` / `db` / `functions` from here rather than re-initializing.
 *
 * Reads config from `VITE_FIREBASE_*` env vars (see `.env.example`) — copy
 * `.env.example` to `.env` and fill in real values from the Firebase console
 * (see `SETUP.md`) before running the app.
 */
import { initializeApp } from 'firebase/app';
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

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
