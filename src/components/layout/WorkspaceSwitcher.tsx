/**
 * Header dropdown listing the signed-in user's workspaces (from
 * `useWorkspace()`), with the active one highlighted. Selecting an entry
 * updates the active workspace; a trailing "+ Add workspace" entry
 * navigates to `WorkspaceOnboarding`.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './workspace-switcher.css';

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const activeWorkspace = workspaces.find((membership) => membership.workspaceId === activeWorkspaceId);

  async function handleSelect(workspaceId: string) {
    setOpen(false);
    if (workspaceId === activeWorkspaceId) return;
    await setActiveWorkspaceId(workspaceId);
  }

  function handleAddWorkspace() {
    setOpen(false);
    navigate('/onboarding');
  }

  return (
    <div className="workspace-switcher">
      <button
        type="button"
        className="workspace-switcher-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {activeWorkspace?.workspaceName ?? 'Select workspace'}
        <span className="workspace-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="workspace-switcher-menu" role="listbox">
          {workspaces.map((membership) => (
            <li key={membership.workspaceId}>
              <button
                type="button"
                role="option"
                aria-selected={membership.workspaceId === activeWorkspaceId}
                className={
                  membership.workspaceId === activeWorkspaceId
                    ? 'workspace-switcher-item workspace-switcher-item-active'
                    : 'workspace-switcher-item'
                }
                onClick={() => handleSelect(membership.workspaceId)}
              >
                {membership.workspaceName}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="workspace-switcher-add" onClick={handleAddWorkspace}>
              + Add workspace
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
