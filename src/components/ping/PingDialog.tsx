/**
 * "Ping" modal: nudge everyone in the workspace, or one person, with an
 * optional short note — delivered as a push notification via the `sendPing`
 * Cloud Function.
 *
 * The dialog handles both sides of the feature the user touches here:
 *  - choosing the target + message and sending, and
 *  - opting *this* device in to receive pings (permission + FCM token), since
 *    that's the natural place to notice you're not set up to be pinged back.
 *
 * Sending never requires the sender to have notifications enabled; only
 * receiving does — hence the separate, dismissible "enable on this device"
 * affordance rather than a hard gate.
 */
import { useEffect, useState } from 'react';
import { getWorkspaceMembers } from '../../firebase/workspaces';
import { sendPing } from '../../firebase/messaging';
import { usePush } from '../../contexts/PushContext';
import type { WorkspaceMember, WithId } from '../../types/models';
import './ping-dialog.css';

export interface PingDialogProps {
  workspaceId: string;
  workspaceName: string;
  uid: string;
  onClose: () => void;
}

type LoadStatus = 'loading' | 'ready' | 'error';
const EVERYONE = '__everyone__';

export function PingDialog({ workspaceId, workspaceName, uid, onClose }: PingDialogProps) {
  const push = usePush();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [members, setMembers] = useState<WithId<WorkspaceMember>[]>([]);
  const [target, setTarget] = useState<string>(EVERYONE);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enableNote, setEnableNote] = useState<string | null>(null);

  // Load the roster (minus yourself) so you can pick one person to ping.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getWorkspaceMembers(workspaceId)
      .then((all) => {
        if (cancelled) return;
        setMembers(all.filter((member) => member.uid !== uid));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, uid]);

  // Close on Escape.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSend() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const { recipients, delivered } = await sendPing({
        workspaceId,
        targetUid: target === EVERYONE ? undefined : target,
        message: message.trim() || undefined,
      });

      if (recipients === 0) {
        setResult("There's no one else here to ping yet.");
      } else if (delivered === 0) {
        setResult(
          target === EVERYONE
            ? 'Sent — but no one has notifications turned on yet.'
            : "Sent — but they haven't turned on notifications yet.",
        );
      } else {
        const who =
          target === EVERYONE
            ? `${delivered} device${delivered === 1 ? '' : 's'}`
            : members.find((member) => member.uid === target)?.displayName ?? 'them';
        setResult(`Pinged ${who}. 🔔`);
      }
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      setError(
        code === 'functions/permission-denied'
          ? "You're not a member of this workspace."
          : 'Could not send the ping. Please try again.',
      );
    } finally {
      setSending(false);
    }
  }

  async function handleEnable() {
    setEnableNote(null);
    const outcome = await push.enable();
    if (outcome === 'denied') {
      setEnableNote('Notifications are blocked — turn them on in your browser settings.');
    } else if (outcome === 'default') {
      setEnableNote('Permission wasn’t granted, so you won’t receive pings on this device yet.');
    } else if (outcome === 'unsupported') {
      setEnableNote('This browser can’t receive push notifications.');
    }
  }

  return (
    <div className="ping-overlay" onClick={onClose}>
      <div
        className="ping-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ping-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="ping-dialog__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h2 id="ping-dialog-title" className="ping-dialog__title">
          <span aria-hidden="true">🔔</span> Ping the list
        </h2>
        <p className="ping-dialog__subtitle">
          Nudge people on <strong>{workspaceName}</strong> — “come look at the list”.
        </p>

        {status === 'loading' && <p className="ping-dialog__muted">Loading members…</p>}
        {status === 'error' && (
          <p className="ping-dialog__error" role="alert">
            Couldn’t load this workspace’s members. Please try again.
          </p>
        )}

        {status === 'ready' && (
          <>
            <fieldset className="ping-dialog__targets">
              <legend className="ping-dialog__field-label">Who to ping</legend>

              <label className="ping-dialog__target">
                <input
                  type="radio"
                  name="ping-target"
                  value={EVERYONE}
                  checked={target === EVERYONE}
                  onChange={() => setTarget(EVERYONE)}
                />
                <span>Everyone else</span>
              </label>

              {members.map((member) => (
                <label className="ping-dialog__target" key={member.uid}>
                  <input
                    type="radio"
                    name="ping-target"
                    value={member.uid}
                    checked={target === member.uid}
                    onChange={() => setTarget(member.uid)}
                  />
                  <span>{member.displayName}</span>
                </label>
              ))}

              {members.length === 0 && (
                <p className="ping-dialog__muted">
                  You’re the only one here so far. Invite someone to ping them.
                </p>
              )}
            </fieldset>

            <label className="ping-dialog__field-label" htmlFor="ping-message">
              Message <span className="ping-dialog__optional">(optional)</span>
            </label>
            <input
              id="ping-message"
              className="ping-dialog__input"
              type="text"
              maxLength={140}
              placeholder="We need milk 🥛"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />

            {error && (
              <p className="ping-dialog__error" role="alert">
                {error}
              </p>
            )}
            {result && (
              <p className="ping-dialog__result" role="status">
                {result}
              </p>
            )}

            <button
              type="button"
              className="ping-dialog__send"
              onClick={handleSend}
              disabled={sending || members.length === 0}
            >
              {sending ? 'Sending…' : 'Send ping'}
            </button>

            <PushStatus
              supported={push.supported}
              deviceRegistered={push.deviceRegistered}
              busy={push.busy}
              note={enableNote}
              onEnable={handleEnable}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The "can I be pinged on this device?" footer. Collapses to a quiet
 * confirmation once you're registered, and always spells out the iOS caveat
 * (web push only reaches an installed home-screen PWA there).
 */
function PushStatus({
  supported,
  deviceRegistered,
  busy,
  note,
  onEnable,
}: {
  supported: boolean;
  deviceRegistered: boolean;
  busy: boolean;
  note: string | null;
  onEnable: () => void;
}) {
  if (!supported) {
    return (
      <p className="ping-dialog__push-hint">
        This device can’t receive pings. On iPhone/iPad, add Listpad to your Home Screen first —
        web notifications only work from an installed app there.
      </p>
    );
  }

  if (deviceRegistered) {
    return (
      <p className="ping-dialog__push-ok">✓ You’ll get pings on this device.</p>
    );
  }

  return (
    <div className="ping-dialog__push">
      <button
        type="button"
        className="ping-dialog__push-enable"
        onClick={onEnable}
        disabled={busy}
      >
        {busy ? 'Enabling…' : 'Turn on notifications for this device'}
      </button>
      <p className="ping-dialog__push-hint">
        {note ?? 'So others can ping you too. On iPhone/iPad, add Listpad to your Home Screen first.'}
      </p>
    </div>
  );
}
