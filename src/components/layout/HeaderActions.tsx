/**
 * The header's right-hand controls.
 *
 * On a wide screen there is room to lay every control out inline (the original
 * header). On a phone six separate buttons overflow the viewport width — so
 * below `WIDE_QUERY` everything except the workspace switcher collapses behind
 * a single "⋯" overflow menu. The switcher stays out in the open because it is
 * the primary bit of context ("which list am I in").
 *
 * The workspace switcher is always visible; only the secondary actions move.
 */
import { useEffect, useRef, useState } from 'react';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { SettingsMenu } from './SettingsMenu';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTheme } from '../../hooks/useTheme';
import { useSettings } from '../../contexts/SettingsContext';
import './settings-menu.css';
import './header-actions.css';

/** Above this the inline row fits comfortably; below it we collapse to a menu. */
const WIDE_QUERY = '(min-width: 40rem)';

export interface HeaderActionsProps {
  onOpenPing: () => void;
  onOpenInvite: () => void;
  onSignOut: () => void;
}

export function HeaderActions({ onOpenPing, onOpenInvite, onSignOut }: HeaderActionsProps) {
  const wide = useMediaQuery(WIDE_QUERY);

  if (wide) {
    return (
      <>
        <WorkspaceSwitcher />
        <ThemeToggle />
        <SettingsMenu />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onOpenPing}
          title="Ping the list"
        >
          <span aria-hidden="true">🔔</span>
          <span className="visually-hidden">Ping</span>
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenInvite}>
          <span aria-hidden="true">＋</span> Invite
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
          Sign out
        </button>
      </>
    );
  }

  return (
    <>
      <WorkspaceSwitcher />
      <OverflowMenu onOpenPing={onOpenPing} onOpenInvite={onOpenInvite} onSignOut={onSignOut} />
    </>
  );
}

/**
 * The phone-only "⋯" menu. Same dismissal contract as the other header
 * dropdowns: a pointer-down anywhere outside, or Escape (which returns focus to
 * the trigger). Actions close the menu; the theme cycle and settings switch are
 * things you flip in place, so they leave it open.
 */
function OverflowMenu({ onOpenPing, onOpenInvite, onSignOut }: HeaderActionsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { theme, cycleTheme } = useTheme();
  const { settings, setSetting } = useSettings();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const themeLabel = { light: 'Light', dark: 'Dark', system: 'Auto' }[theme];
  const themeIcon = { light: '☀️', dark: '🌙', system: '🖥️' }[theme];

  function runAndClose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-sm"
        aria-haspopup="true"
        aria-expanded={open}
        title="More"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⋯</span>
        <span className="visually-hidden">More actions</span>
      </button>

      {open && (
        <div className="header-menu__panel" role="menu" aria-label="More actions">
          <button
            type="button"
            role="menuitem"
            className="header-menu__item"
            onClick={() => runAndClose(onOpenPing)}
          >
            <span aria-hidden="true">🔔</span> Ping the list
          </button>
          <button
            type="button"
            role="menuitem"
            className="header-menu__item"
            onClick={() => runAndClose(onOpenInvite)}
          >
            <span aria-hidden="true">＋</span> Invite people
          </button>

          <button
            type="button"
            role="menuitem"
            className="header-menu__item"
            onClick={cycleTheme}
          >
            <span aria-hidden="true">{themeIcon}</span> Theme: {themeLabel}
          </button>

          <div className="header-menu__divider" role="separator" />

          <label className="settings-menu__row header-menu__toggle">
            <input
              type="checkbox"
              className="settings-menu__input"
              checked={settings.sinkChecked}
              onChange={(event) => setSetting('sinkChecked', event.target.checked)}
            />
            <span className="settings-menu__switch" aria-hidden="true" />
            <span className="settings-menu__text">
              <span className="settings-menu__label">Move checked items to the bottom</span>
            </span>
          </label>

          <div className="header-menu__divider" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="header-menu__item header-menu__item--danger"
            onClick={() => runAndClose(onSignOut)}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
