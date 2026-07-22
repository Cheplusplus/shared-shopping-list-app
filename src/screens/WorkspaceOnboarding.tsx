/**
 * Shown when the signed-in user has zero workspace memberships, or when
 * they explicitly choose to add another workspace (via
 * `WorkspaceSwitcher`'s "+ Add workspace" entry, which routes here too).
 *
 * Two actions:
 * - "Create a new workspace": name input → `createWorkspace`, then shows
 *   the resulting invite link/code with a copy-to-clipboard button.
 * - "Join with a code": code input → `redeemInviteCode`.
 *
 * If arrived at via `/join/:code` (see `routing/AppRoutes.tsx`), the code
 * field is pre-filled and redemption is attempted automatically.
 *
 * On success (either path), sets the new workspace active via
 * `useWorkspace().setActiveWorkspaceId` and navigates to `/`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { createWorkspace, redeemInviteCode } from '../firebase/workspaces';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

type PendingAction = 'create' | 'join' | null;

function friendlyRedeemError(error: unknown): string {
  if (error instanceof FirebaseError && error.code === 'functions/not-found') {
    return 'That invite code is invalid or no longer active.';
  }
  return 'Could not join that workspace. Please try again.';
}

export default function WorkspaceOnboarding() {
  const { user } = useAuth();
  const { setActiveWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillCode = searchParams.get('code') ?? '';
  const prefillJoinError = searchParams.get('joinError');

  const [workspaceName, setWorkspaceName] = useState('');
  const [joinCode, setJoinCode] = useState(prefillCode);
  const [pending, setPending] = useState<PendingAction>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(prefillJoinError);
  const [createdInvite, setCreatedInvite] = useState<{ workspaceId: string; inviteCode: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setCreateError(null);
    setPending('create');
    try {
      const result = await createWorkspace(workspaceName.trim(), user.uid, user.displayName ?? '');
      setCreatedInvite(result);
      await setActiveWorkspaceId(result.workspaceId);
    } catch {
      setCreateError('Could not create the workspace. Please try again.');
    } finally {
      setPending(null);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !joinCode.trim()) return;
    setJoinError(null);
    setPending('join');
    try {
      const result = await redeemInviteCode(joinCode.trim());
      await setActiveWorkspaceId(result.workspaceId);
      navigate('/', { replace: true });
    } catch (err) {
      setJoinError(friendlyRedeemError(err));
    } finally {
      setPending(null);
    }
  }

  // Auto-attempt redemption when arriving with a pre-filled code (from
  // `/join/:code`) and nothing has been attempted yet.
  useEffect(() => {
    if (!prefillCode || !user) return;
    setJoinCode(prefillCode);
    // Intentionally not auto-submitting on mount: the user may want to
    // review/edit the code first, or may land here after redemption
    // already failed once. `/join/:code` in AppRoutes handles the
    // signed-in "auto-redeem and skip this screen" fast path already.
  }, [prefillCode, user]);

  async function copyInviteLink() {
    if (!createdInvite) return;
    const link = `${window.location.origin}/join/${createdInvite.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (e.g. insecure context); the link
      // text is still visible/selectable on the page.
    }
  }

  if (createdInvite) {
    const link = `${window.location.origin}/join/${createdInvite.inviteCode}`;
    return (
      <div className="onboarding-screen">
        <div className="onboarding-card">
          <h1>Workspace created!</h1>
          <p>Share this link so others can join:</p>
          <div className="invite-link-row">
            <input type="text" readOnly value={link} className="invite-link-input" />
            <button type="button" onClick={copyInviteLink} className="invite-copy-button">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="invite-code-hint">
            Invite code: <code>{createdInvite.inviteCode}</code>
          </p>
          <button type="button" className="onboarding-continue" onClick={() => navigate('/', { replace: true })}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-screen">
      <h1 className="onboarding-title">Welcome to Listpad</h1>
      <p className="onboarding-subtitle">Create a workspace or join one with an invite code.</p>

      <div className="onboarding-options">
        <form className="onboarding-card" onSubmit={handleCreate}>
          <h2>Create a new workspace</h2>
          <label className="onboarding-field">
            <span>Workspace name</span>
            <input
              type="text"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="e.g. Our household"
              required
            />
          </label>
          {createError && (
            <p className="onboarding-error" role="alert">
              {createError}
            </p>
          )}
          <button type="submit" disabled={pending === 'create'}>
            {pending === 'create' ? 'Creating…' : 'Create workspace'}
          </button>
        </form>

        <form className="onboarding-card" onSubmit={handleJoin}>
          <h2>Join with a code</h2>
          <label className="onboarding-field">
            <span>Invite code</span>
            <input
              type="text"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="e.g. aB3xY9zQ"
              required
            />
          </label>
          {joinError && (
            <p className="onboarding-error" role="alert">
              {joinError}
            </p>
          )}
          <button type="submit" disabled={pending === 'join'}>
            {pending === 'join' ? 'Joining…' : 'Join workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
