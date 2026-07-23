/**
 * App chrome wrapper: sticky header (brand mark + a slot for the
 * WorkspaceSwitcher another agent owns) plus the dismissible install
 * banner, wrapping whatever screen content is passed as `children`.
 *
 * Deliberately presentational/generic — it doesn't know about auth or
 * workspace state, just renders whatever `headerActions` it's given.
 */
import type { ReactNode } from 'react';
import { InstallPrompt } from './InstallPrompt';

export interface AppShellProps {
  children: ReactNode;
  /** e.g. the WorkspaceSwitcher, a sign-out button, etc. */
  headerActions?: ReactNode;
}

export function AppShell({ children, headerActions }: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="app-banner-slot">
        <InstallPrompt />
      </div>

      <header className="app-header">
        <span className="app-header-brand">
          <img
            className="app-header-brand-mark"
            src="/favicon.svg"
            alt=""
            aria-hidden="true"
            width={30}
            height={30}
          />
          <span className="app-header-brand-name">Listpad</span>
        </span>

        {headerActions && (
          <div className="app-header-actions">{headerActions}</div>
        )}
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}
