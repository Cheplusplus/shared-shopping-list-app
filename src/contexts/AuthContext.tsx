/**
 * Wraps `subscribeToAuthState` (see `src/firebase/auth.ts`) in a React
 * context so any component can read the signed-in Firebase user via
 * `useAuth()`.
 *
 * Cross-agent contract: `useAuth()` returns `{ user, loading }` where
 * `user` is the raw Firebase Auth `User | null` and `loading` is `true`
 * only until the first auth-state callback fires (i.e. "do we know yet
 * whether someone is signed in").
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuthState } from '../firebase/auth';

export interface AuthContextValue {
  /** The signed-in Firebase user, or `null` if signed out. */
  user: FirebaseUser | null;
  /** `true` until the initial auth state has been resolved. */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the current auth state. Must be used within an `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
