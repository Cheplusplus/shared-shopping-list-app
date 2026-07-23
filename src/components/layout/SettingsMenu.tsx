/**
 * Header gear button with a small dropdown of device-local preferences (see
 * `SettingsContext`). A dropdown rather than a dialog: these are one-tap
 * switches you flip while looking at the board, not a screen to visit.
 *
 * Each row is a real `<input type="checkbox">` wearing a switch, so keyboard
 * and screen-reader behaviour come for free; the label description doubles as
 * the row's own hit target.
 */
import { useEffect, useRef, useState } from 'react';
import { useSettings, type Settings } from '../../contexts/SettingsContext';
import './settings-menu.css';

export function SettingsMenu() {
  const { settings, setSetting } = useSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Same dismissal contract as the list options menu: a click anywhere else,
  // or Escape (which returns focus to the gear it came from).
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

  return (
    <div className="settings-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-sm"
        aria-haspopup="true"
        aria-expanded={open}
        title="Settings"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⚙️</span>
        <span className="visually-hidden">Settings</span>
      </button>

      {open && (
        <div className="settings-menu__panel" role="group" aria-label="Settings">
          <p className="settings-menu__heading">Settings</p>

          <SettingToggle
            setting="sinkChecked"
            label="Move checked items to the bottom"
            hint="Off keeps each item where it is when you tick it off."
            checked={settings.sinkChecked}
            onChange={setSetting}
          />
        </div>
      )}
    </div>
  );
}

function SettingToggle({
  setting,
  label,
  hint,
  checked,
  onChange,
}: {
  setting: keyof Settings;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (key: keyof Settings, value: boolean) => void;
}) {
  return (
    <label className="settings-menu__row">
      <input
        type="checkbox"
        className="settings-menu__input"
        checked={checked}
        onChange={(event) => onChange(setting, event.target.checked)}
      />
      <span className="settings-menu__switch" aria-hidden="true" />
      <span className="settings-menu__text">
        <span className="settings-menu__label">{label}</span>
        <span className="settings-menu__hint">{hint}</span>
      </span>
    </label>
  );
}
