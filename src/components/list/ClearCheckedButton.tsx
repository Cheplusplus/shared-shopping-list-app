/**
 * Shows a count of currently-checked items; on click, confirms then archives
 * all checked items via `clearChecked`.
 */
import { useState } from 'react';
import { clearChecked } from '../../firebase/items';

export interface ClearCheckedButtonProps {
  workspaceId: string;
  checkedCount: number;
}

export function ClearCheckedButton({ workspaceId, checkedCount }: ClearCheckedButtonProps) {
  const [clearing, setClearing] = useState(false);

  async function handleClick() {
    if (checkedCount === 0 || clearing) {
      return;
    }
    const confirmed = window.confirm(
      `Clear ${checkedCount} checked item${checkedCount === 1 ? '' : 's'}?`,
    );
    if (!confirmed) {
      return;
    }
    setClearing(true);
    try {
      await clearChecked(workspaceId);
    } finally {
      setClearing(false);
    }
  }

  return (
    <button
      type="button"
      className="clear-checked"
      onClick={handleClick}
      disabled={checkedCount === 0 || clearing}
    >
      Clear checked ({checkedCount})
    </button>
  );
}
