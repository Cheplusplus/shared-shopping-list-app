import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { AppRoutes } from './routing/AppRoutes';
import { AppShell } from './components/layout/AppShell';
import WorkspaceSwitcher from './components/layout/WorkspaceSwitcher';
import { InviteDialog } from './components/workspace/InviteDialog';
import { ListView } from './screens/ListView';
import { signOutUser } from './firebase/auth';

/**
 * Rendered by `AppRoutes` as `appContent` once the user is signed in and has
 * at least one workspace. Threads `activeWorkspaceId` from `WorkspaceContext`
 * into `ListView`'s props per its documented contract. The workspace's name
 * belongs to the header switcher; the board's own titles are its lists'.
 */
function AuthenticatedApp() {
  const { user } = useAuth();
  const { workspaces, activeWorkspaceId, loading } = useWorkspace();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!user) return null;

  if (loading || !activeWorkspaceId) {
    return (
      <AppShell>
        <p>Loading your list…</p>
      </AppShell>
    );
  }

  const activeWorkspaceName =
    workspaces.find((membership) => membership.workspaceId === activeWorkspaceId)?.workspaceName ??
    '';

  return (
    <AppShell
      headerActions={
        <>
          <WorkspaceSwitcher />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setInviteOpen(true)}
          >
            <span aria-hidden="true">＋</span> Invite
          </button>
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

      {inviteOpen && (
        <InviteDialog
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspaceName || 'this workspace'}
          onClose={() => setInviteOpen(false)}
        />
      )}
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
