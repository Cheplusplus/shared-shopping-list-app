/**
 * Device-local app preferences.
 *
 * These are *display* preferences rather than shared data, so they live in
 * `localStorage` per device rather than on the workspace — two people sharing
 * a list can each have their own view of it, and the setting applies the
 * instant it's toggled with no write in flight.
 *
 * Unknown/corrupt stored values fall back to the defaults field by field, so
 * adding a setting here never has to migrate what's already on disk.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface Settings {
  /**
   * Checked items sink to the bottom of their list. When off, an item stays
   * exactly where it is when you tick it off.
   */
  sinkChecked: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  sinkChecked: true,
};

const STORAGE_KEY = 'listpad-settings';

function readStoredSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    return {
      sinkChecked:
        typeof parsed.sinkChecked === 'boolean'
          ? parsed.sinkChecked
          : DEFAULT_SETTINGS.sinkChecked,
    };
  } catch {
    // Unparseable or storage unavailable (private mode, blocked cookies).
    return DEFAULT_SETTINGS;
  }
}

interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => readStoredSettings());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable — the setting still applies for this session.
    }
  }, [settings]);

  const setSetting = useCallback<SettingsContextValue['setSetting']>((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const value = useMemo(() => ({ settings, setSetting }), [settings, setSetting]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
