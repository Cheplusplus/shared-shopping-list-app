/**
 * Firebase Authentication (email/password) + the `users/{uid}` profile doc.
 *
 * This module is framework-agnostic (no React) so it can be wrapped by
 * `contexts/AuthContext.tsx` / `hooks/useAuth.ts` (Agent 2) however they see
 * fit — `subscribeToAuthState` below is the raw subscription primitive for
 * that context to build on.
 */
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Unsubscribe,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './config';
import type { UserForCreate } from '../types/models';

/**
 * Creates a Firebase Auth account, sets the Auth profile `displayName`, and
 * writes the corresponding `users/{uid}` Firestore doc.
 */
export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });

  const userDoc: UserForCreate = {
    displayName,
    email,
    activeWorkspaceId: null,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'users', credential.user.uid), userDoc);

  return credential.user;
}

/** Signs an existing user in with email/password. */
export async function signIn(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Signs the current user out. */
export function signOutUser(): Promise<void> {
  return signOut(auth);
}

/**
 * Subscribes to Firebase Auth state changes. Returns an unsubscribe
 * function — call it on cleanup (e.g. from a `useEffect`).
 */
export function subscribeToAuthState(
  callback: (user: FirebaseUser | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}
