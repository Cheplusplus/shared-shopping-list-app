/**
 * Sign-in / sign-up screen. Toggles between the two modes, calls
 * `signIn`/`signUp` from `src/firebase/auth.ts`, and redirects on success.
 *
 * Redirect target: if the router sent the user here with
 * `location.state.from` set (see `routing/AppRoutes.tsx`'s `/join/:code`
 * handling for signed-out visitors), navigate back there after auth
 * succeeds. Otherwise fall back to `/`.
 */
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { signIn, signUp } from '../firebase/auth';
import './auth.css';

type Mode = 'signin' | 'signup';

interface LocationState {
  from?: Location;
}

/** Maps Firebase Auth error codes to short, user-facing messages. */
function friendlyAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'An account with that email already exists. Try signing in instead.';
      case 'auth/invalid-email':
        return 'That email address doesn’t look valid.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/missing-password':
        return 'Enter a password.';
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Incorrect email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'Network error — check your connection and try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function SignInSignUp() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, displayName.trim());
      } else {
        await signIn(email, password);
      }
      const redirectTo = state?.from ? `${state.from.pathname}${state.from.search}` : '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleMode() {
    setMode((current) => (current === 'signin' ? 'signup' : 'signin'));
    setError(null);
  }

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            ✓
          </span>
          <span className="auth-brand-name">Listpad</span>
        </div>
        <p className="auth-tagline">A shared shopping list for your people.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <h1 className="auth-title">{mode === 'signin' ? 'Welcome back' : 'Create an account'}</h1>

        {mode === 'signup' && (
          <label className="auth-field">
            <span>Name</span>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
        )}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

          <button type="button" className="auth-toggle" onClick={toggleMode}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
