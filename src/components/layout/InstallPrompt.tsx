/**
 * Custom "install this app" affordance.
 *
 * Chrome/Edge/Android: captures the `beforeinstallprompt` event, suppresses
 * the browser's own mini-infobar (`preventDefault()`), and instead shows a
 * small dismissible banner with an "Install app" button that replays the
 * stored event on click.
 *
 * iOS Safari never fires `beforeinstallprompt`, so there's nothing to
 * capture there — instead, when we detect iOS and the app isn't already
 * running standalone, we show a one-time instructional tip ("Tap Share,
 * then Add to Home Screen"). Both the iOS tip and the install banner
 * remember dismissal in `localStorage` so they don't nag on every visit.
 */
import { useEffect, useState } from 'react';

const IOS_TIP_DISMISSED_KEY = 'listpad:ios-install-tip-dismissed';
const INSTALL_BANNER_DISMISSED_KEY = 'listpad:install-banner-dismissed';

/** Minimal typing for the non-standard `beforeinstallprompt` event. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isRunningStandalone(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // localStorage unavailable (private browsing, etc.) — dismissal just
    // won't be remembered next visit, which is an acceptable degradation.
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    readDismissed(INSTALL_BANNER_DISMISSED_KEY),
  );
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt,
    );
    return () =>
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
  }, []);

  useEffect(() => {
    if (
      isIosDevice() &&
      !isRunningStandalone() &&
      !readDismissed(IOS_TIP_DISMISSED_KEY)
    ) {
      setShowIosTip(true);
    }
  }, []);

  useEffect(() => {
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowIosTip(false);
    };
    window.addEventListener('appinstalled', handleAppInstalled);
    return () =>
      window.removeEventListener('appinstalled', handleAppInstalled);
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // The prompt can only be used once; clear it either way.
    setDeferredPrompt(null);
  }

  function handleDismissBanner() {
    setBannerDismissed(true);
    writeDismissed(INSTALL_BANNER_DISMISSED_KEY);
  }

  function handleDismissIosTip() {
    setShowIosTip(false);
    writeDismissed(IOS_TIP_DISMISSED_KEY);
  }

  if (deferredPrompt && !bannerDismissed) {
    return (
      <div className="banner install-prompt" role="region" aria-label="Install Listpad">
        <div className="install-prompt-text">
          <span className="install-prompt-title">Install Listpad</span>
          <span className="field-hint">
            Add it to your home screen for quick, full-screen access.
          </span>
        </div>
        <div className="install-prompt-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleInstallClick()}
          >
            Install app
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleDismissBanner}
            aria-label="Dismiss install prompt"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (showIosTip) {
    return (
      <div className="banner install-prompt" role="region" aria-label="Install Listpad">
        <div className="install-prompt-text">
          <span className="install-prompt-title">Install Listpad</span>
          <span className="field-hint">
            Tap the Share icon, then “Add to Home Screen”.
          </span>
        </div>
        <div className="install-prompt-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleDismissIosTip}
            aria-label="Dismiss install tip"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return null;
}
