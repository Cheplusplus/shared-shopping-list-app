import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { AppRoutes } from './routing/AppRoutes';
import { AppShell } from './components/layout/AppShell';
import WorkspaceSwitcher from './components/layout/WorkspaceSwitcher';
import { ListView } from './screens/ListView';
import { signOutUser } from './firebase/auth';

/**
 * Rendered by `AppRoutes` as `appContent` once the user is signed in and has
 * at least one workspace. Threads `activeWorkspaceId` from `WorkspaceContext`
 * into `ListView`'s props per its documented contract.
 */
function AuthenticatedApp() {
  const { user } = useAuth();
  const { activeWorkspaceId, loading } = useWorkspace();

  if (!user) return null;

  if (loading || !activeWorkspaceId) {
    return (
      <AppShell>
        <p>Loading your list…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      headerActions={
        <>
          <WorkspaceSwitcher />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOutUser()}>
            Sign out
          </button>
        </>
      }
    >
      <ListView
        workspaceId={activeWorkspaceId}
        uid={user.uid}
        displayName={user.displayName ?? user.email ?? 'Someone'}
      />
    </AppShell>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <AppRoutes appContent={<AuthenticatedApp />} />
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
