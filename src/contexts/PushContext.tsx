/**
 * Push-notification ("ping") state for the signed-in user.
 *
 * Owns the *receiving* side of pings:
 *  - whether this browser can do web push at all (`supported`),
 *  - the current OS permission and whether this device has registered a token
 *    (`permission` / `deviceRegistered`),
 *  - `enable()` / `disable()` to opt this device in or out, and
 *  - a foreground listener that turns a ping arriving while the app is open
 *    into an in-app toast (rendered here) instead of a duplicate OS banner.
 *
 * The *sending* side (`sendPing`) is a plain call from the PingDialog and
 * doesn't need this context.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  disablePushForDevice,
  enablePushForDevice,
  isDeviceRegistered,
  isPushSupported,
  notificationPermission,
  onForegroundPing,
  type EnablePushResult,
} from '../firebase/messaging';
import './push-toast.css';

interface PushContextValue {
  /** Web push works in this browser/context (false on iOS Safari tabs, etc.). */
  supported: boolean;
  /** Current OS notification permission, or `'unsupported'`. */
  permission: NotificationPermission | 'unsupported';
  /** This device has an active FCM token (opted in to receive). */
  deviceRegistered: boolean;
  /** An enable/disable call is in flight. */
  busy: boolean;
  /** Opt this device in. Returns the outcome so callers can message the user. */
  enable: () => Promise<EnablePushResult>;
  /** Opt this device out (also used on sign-out). */
  disable: () => Promise<void>;
}

const PushContext = createContext<PushContextValue | null>(null);

interface Toast {
  id: number;
  title: string;
  body: string;
}

export function PushProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationPermission(),
  );
  const [deviceRegistered, setDeviceRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Resolve capability once.
  useEffect(() => {
    let active = true;
    void isPushSupported().then((value) => {
      if (!active) return;
      setSupported(value);
      setDeviceRegistered(isDeviceRegistered());
    });
    return () => {
      active = false;
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // Foreground pings -> in-app toast (auto-dismissing). Only worth listening
  // once this device is actually registered to receive.
  useEffect(() => {
    if (!supported || !deviceRegistered) return;
    const unsubscribe = onForegroundPing(({ title, body }) => {
      const id = ++toastId.current;
      setToasts((current) => [...current, { id, title, body }]);
      setTimeout(() => dismissToast(id), 6000);
    });
    return unsubscribe;
  }, [supported, deviceRegistered, dismissToast]);

  const enable = useCallback(async (): Promise<EnablePushResult> => {
    if (!uid) return 'unsupported';
    setBusy(true);
    try {
      const result = await enablePushForDevice(uid);
      setPermission(notificationPermission());
      setDeviceRegistered(result === 'granted');
      return result;
    } finally {
      setBusy(false);
    }
  }, [uid]);

  const disable = useCallback(async (): Promise<void> => {
    if (!uid) return;
    setBusy(true);
    try {
      await disablePushForDevice(uid);
      setDeviceRegistered(false);
    } finally {
      setBusy(false);
    }
  }, [uid]);

  const value = useMemo<PushContextValue>(
    () => ({ supported, permission, deviceRegistered, busy, enable, disable }),
    [supported, permission, deviceRegistered, busy, enable, disable],
  );

  return (
    <PushContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="push-toasts" role="region" aria-live="polite" aria-label="Notifications">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              type="button"
              className="push-toast"
              onClick={() => dismissToast(toast.id)}
            >
              <span className="push-toast__icon" aria-hidden="true">
                🔔
              </span>
              <span className="push-toast__text">
                <span className="push-toast__title">{toast.title}</span>
                <span className="push-toast__body">{toast.body}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </PushContext.Provider>
  );
}

export function usePush(): PushContextValue {
  const context = useContext(PushContext);
  if (!context) {
    throw new Error('usePush must be used within a PushProvider');
  }
  return context;
}
