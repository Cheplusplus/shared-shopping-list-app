/**
 * Encapsulates the auth + workspace routing surface owned by Agent 2:
 * `/signin`, `/join/:code`, `/onboarding`, and a catch-all that gates the
 * rest of the app behind sign-in + having at least one workspace.
 *
 * ============================================================================
 * HOW THE INTEGRATION PASS SHOULD MOUNT THIS
 * ============================================================================
 * This file does not own `App.tsx`. Mount it like so:
 *
 *   <BrowserRouter>
 *     <AuthProvider>
 *       <WorkspaceProvider>
 *         <AppRoutes appContent={<AppShell><ListView /></AppShell>} />
 *       </WorkspaceProvider>
 *     </AuthProvider>
 *   </BrowserRouter>
 *
 * `AppRoutes` must be inside both `AuthProvider` (`contexts/AuthContext.tsx`)
 * and `WorkspaceProvider` (`contexts/WorkspaceContext.tsx`) since its routes
 * read `useAuth()`/`useWorkspace()`.
 *
 * `appContent` is whatever the authenticated, workspace-having app should
 * render for any path not otherwise matched below (`/`, and any future
 * in-app routes like `/settings` — this catch-all is intentionally broad).
 * It's optional so this file runs standalone before that content exists;
 * omitting it renders a minimal placeholder instead. It's expected to
 * internally use `useWorkspace().activeWorkspaceId` and typically also
 * renders `WorkspaceSwitcher` somewhere in its header/shell.
 * ============================================================================
 *
 * Route behavior:
 * - `/signin` — sign-in/sign-up form. If already signed in, redirects to
 *   `location.state.from` (if set) or `/`.
 * - `/join/:code` — redeems the invite code. If signed out, redirects to
 *   `/signin` first with `state: { from: location }` so `/signin` can send
 *   the user back here after auth; redemption then proceeds automatically.
 *   On success, sets the joined workspace active and navigates to `/`. On
 *   failure, routes to `/onboarding?code=<code>` with the code prefilled so
 *   the user can retry/edit it.
 * - `/onboarding` — shown explicitly (e.g. via `WorkspaceSwitcher`'s
 *   "+ Add workspace") or automatically by the catch-all when a signed-in
 *   user has zero workspace memberships.
 * - `*` (catch-all) — signed out → redirect to `/signin`; signed in with no
 *   workspaces → render `WorkspaceOnboarding`; signed in with a workspace →
 *   render `appContent`.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  type Location,
} from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { redeemInviteCode } from '../firebase/workspaces';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import SignInSignUp from '../screens/SignInSignUp';
import WorkspaceOnboarding from '../screens/WorkspaceOnboarding';

interface FromState {
  from?: Location;
}

function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="route-loading-screen">
      <p>{message}</p>
    </div>
  );
}

function friendlyRedeemError(error: unknown): string {
  if (error instanceof FirebaseError && error.code === 'functions/not-found') {
    return 'That invite code is invalid or no longer active.';
  }
  return 'Could not join that workspace.';
}

/** `/signin` — redirects away if already signed in. */
function SignInRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (user) {
    const state = location.state as FromState | null;
    const redirectTo = state?.from ? `${state.from.pathname}${state.from.search}` : '/';
    return <Navigate to={redirectTo} replace />;
  }
  return <SignInSignUp />;
}

/** `/join/:code` — auth-gates, then redeems the code and redirects. */
function JoinRoute() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const { setActiveWorkspaceId } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'redeeming' | 'error'>('idle');

  useEffect(() => {
    if (authLoading || !user || !code || status !== 'idle') return;
    setStatus('redeeming');
    redeemInviteCode(code)
      .then(async (result) => {
        await setActiveWorkspaceId(result.workspaceId);
        navigate('/', { replace: true });
      })
      .catch((err: unknown) => {
        setStatus('error');
        navigate(`/onboarding?code=${encodeURIComponent(code)}&joinError=${encodeURIComponent(friendlyRedeemError(err))}`, {
          replace: true,
        });
      });
    // `status` intentionally omitted so this only ever fires once per code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, code]);

  if (authLoading) return <LoadingScreen />;
  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location } satisfies FromState} />;
  }
  return <LoadingScreen message="Joining workspace…" />;
}

/** Gate for routes that require sign-in (currently just `/onboarding`). */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location } satisfies FromState} />;
  }
  return <>{children}</>;
}

/** Minimal stand-in for the authenticated app shell until it's wired in. */
function DefaultAppPlaceholder() {
  return (
    <div className="app-content-placeholder">
      <p>Signed in. Main app content mounts here once integrated.</p>
    </div>
  );
}

/** Catch-all: sign-in gate → workspace gate → `appContent`. */
function CatchAllRoute({ appContent }: { appContent?: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { workspaces, loading: workspaceLoading } = useWorkspace();
  const location = useLocation();

  if (authLoading) return <LoadingScreen />;
  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location } satisfies FromState} />;
  }
  if (workspaceLoading) return <LoadingScreen />;
  if (workspaces.length === 0) {
    return <WorkspaceOnboarding />;
  }
  return <>{appContent ?? <DefaultAppPlaceholder />}</>;
}

export interface AppRoutesProps {
  /**
   * The authenticated, workspace-having app (shell + list view, owned by
   * other agents). Rendered for any path not otherwise matched. See the
   * module doc comment above for the expected mount shape.
   */
  appContent?: ReactNode;
}

export function AppRoutes({ appContent }: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/signin" element={<SignInRoute />} />
      <Route path="/join/:code" element={<JoinRoute />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <WorkspaceOnboarding />
          </RequireAuth>
        }
      />
      <Route path="*" element={<CatchAllRoute appContent={appContent} />} />
    </Routes>
  );
}

export default AppRoutes;
