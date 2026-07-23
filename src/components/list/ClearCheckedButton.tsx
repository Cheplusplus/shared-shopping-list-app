/**
 * Shows a count of currently-checked items; on click, confirms then archives
 * them via `archiveItems`.
 *
 * The ids come from the caller's live subscription rather than being
 * re-queried here, so clearing costs no reads.
 */
import { useState } from 'react';
import { archiveItems } from '../../firebase/items';

export interface ClearCheckedButtonProps {
  workspaceId: string;
  checkedItemIds: readonly string[];
}

export function ClearCheckedButton({ workspaceId, checkedItemIds }: ClearCheckedButtonProps) {
  const [clearing, setClearing] = useState(false);
  const checkedCount = checkedItemIds.length;

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
      await archiveItems(workspaceId, checkedItemIds);
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
