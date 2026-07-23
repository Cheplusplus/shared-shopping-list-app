import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'listpad-theme';
const ORDER: ThemeMode[] = ['light', 'dark', 'system'];

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', mode);
  }
}

/**
 * Cycles light -> dark -> system, persisting the choice and setting
 * `data-theme` on <html> — tokens.css keys its light/dark palettes off that
 * attribute, falling back to the `prefers-color-scheme` media query when
 * it's absent (i.e. 'system').
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
  }, []);

  return { theme, setTheme, cycleTheme };
}
