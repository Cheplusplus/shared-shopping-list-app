/**
 * Header button cycling the app's theme through light -> dark -> system
 * (see `useTheme`). A single button rather than a dropdown since there are
 * only three states and the header is already tight on space.
 */
import { useTheme, type ThemeMode } from '../../hooks/useTheme';

const THEME_META: Record<ThemeMode, { icon: string; label: string }> = {
  light: { icon: '☀️', label: 'Light' },
  dark: { icon: '🌙', label: 'Dark' },
  system: { icon: '🖥️', label: 'Auto' },
};

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const { icon, label } = THEME_META[theme];

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={cycleTheme}
      title={`Theme: ${label} — click to switch`}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="visually-hidden">Theme: {label}. Click to switch.</span>
    </button>
  );
}
