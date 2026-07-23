/**
 * A modal that re-surfaces a workspace's invite link + code at any time (not
 * just right after creation). Fetches the workspace doc on open to read its
 * `inviteCode` — members are permitted to read it by the security rules — and
 * offers copy-to-clipboard plus the native share sheet where available.
 */
import { useEffect, useState } from 'react';
import { getWorkspace } from '../../firebase/workspaces';
import './invite-dialog.css';

export interface InviteDialogProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

type Status = 'loading' | 'ready' | 'error';

export function InviteDialog({ workspaceId, workspaceName, onClose }: InviteDialogProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  const inviteLink = inviteCode ? `${window.location.origin}/join/${inviteCode}` : '';

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getWorkspace(workspaceId)
      .then((workspace) => {
        if (cancelled) return;
        if (workspace?.inviteCode) {
          setInviteCode(workspace.inviteCode);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Close on Escape.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy(value: string, which: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied((current) => (current === which ? null : current)), 1800);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — the value is still
      // selectable on screen.
    }
  }

  async function share() {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: `Join "${workspaceName}" on Listpad`,
        text: `Join my shopping list "${workspaceName}" on Listpad:`,
        url: inviteLink,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div className="invite-overlay" onClick={onClose}>
      <div
        className="invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="invite-dialog__tape" aria-hidden="true" />
        <button type="button" className="invite-dialog__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h2 id="invite-dialog-title" className="invite-dialog__title">
          Invite people
        </h2>
        <p className="invite-dialog__subtitle">
          Share this with anyone you want on <strong>{workspaceName}</strong>. They can add and
          check off items with you in real time.
        </p>

        {status === 'loading' && <p className="invite-dialog__muted">Fetching your invite…</p>}

        {status === 'error' && (
          <p className="invite-dialog__error" role="alert">
            Couldn’t load the invite for this workspace. Please try again.
          </p>
        )}

        {status === 'ready' && (
          <>
            <label className="invite-dialog__field-label" htmlFor="invite-link">
              Invite link
            </label>
            <div className="invite-dialog__row">
              <input
                id="invite-link"
                className="invite-dialog__input"
                type="text"
                readOnly
                value={inviteLink}
                onFocus={(event) => event.target.select()}
              />
              <button
                type="button"
                className="invite-dialog__copy"
                onClick={() => copy(inviteLink, 'link')}
              >
                {copied === 'link' ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="invite-dialog__code-block">
              <span className="invite-dialog__field-label">Or share the code</span>
              <button
                type="button"
                className="invite-dialog__code"
                onClick={() => copy(inviteCode ?? '', 'code')}
                title="Copy code"
              >
                <span className="invite-dialog__code-value">{inviteCode}</span>
                <span className="invite-dialog__code-hint">
                  {copied === 'code' ? 'Copied!' : 'Tap to copy'}
                </span>
              </button>
            </div>

            {canShare && (
              <button type="button" className="invite-dialog__share" onClick={share}>
                Share…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
