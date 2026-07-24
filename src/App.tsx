import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { PushProvider, usePush } from './contexts/PushContext';
import { AppRoutes } from './routing/AppRoutes';
import { AppShell } from './components/layout/AppShell';
import { HeaderActions } from './components/layout/HeaderActions';
import { InviteDialog } from './components/workspace/InviteDialog';
import { PingDialog } from './components/ping/PingDialog';
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
  const { disable: disablePush } = usePush();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pingOpen, setPingOpen] = useState(false);

  // Drop this device's push registration before signing out, so a later user
  // on the same browser doesn't inherit pings meant for the previous one.
  async function handleSignOut() {
    await disablePush().catch(() => undefined);
    await signOutUser();
  }

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
        <HeaderActions
          onOpenPing={() => setPingOpen(true)}
          onOpenInvite={() => setInviteOpen(true)}
          onSignOut={() => void handleSignOut()}
        />
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

      {pingOpen && (
        <PingDialog
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspaceName || 'this workspace'}
          uid={user.uid}
          onClose={() => setPingOpen(false)}
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
          <SettingsProvider>
            <PushProvider>
              <AppRoutes appContent={<AuthenticatedApp />} />
            </PushProvider>
          </SettingsProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
