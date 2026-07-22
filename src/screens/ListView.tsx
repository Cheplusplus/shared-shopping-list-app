/**
 * Top-level shopping-list screen. Framework-agnostic about where
 * `workspaceId`/`uid`/`displayName` come from — the integration pass wires
 * these in from `WorkspaceContext`/`AuthContext`.
 *
 * Renders `AddItemInput` + the item list (unchecked items first, checked
 * items in their own visually distinct block below, per spec) +
 * `ClearCheckedButton`. Tapping a row toggles `checked` optimistically via
 * `toggleChecked`.
 */
import { useCallback } from 'react';
import { toggleChecked } from '../firebase/items';
import { useListItems } from '../hooks/useListItems';
import { AddItemInput } from '../components/list/AddItemInput';
import { ItemRow } from '../components/list/ItemRow';
import { ClearCheckedButton } from '../components/list/ClearCheckedButton';
import type { Item, WithId } from '../types/models';
import '../components/list/list.css';

export interface ListViewProps {
  workspaceId: string;
  uid: string;
  displayName: string;
}

export function ListView({ workspaceId, uid, displayName }: ListViewProps) {
  const { items, loading } = useListItems(workspaceId);

  const handleToggle = useCallback(
    (item: WithId<Item>) => {
      // Optimistic: Firestore's local cache applies this instantly even
      // offline, and `useListItems`'s onSnapshot will reconcile with the
      // server's view (including from other users) as it arrives.
      void toggleChecked(workspaceId, item.id, !item.checked);
    },
    [workspaceId],
  );

  const uncheckedItems = items.filter((item) => !item.checked);
  const checkedItems = items.filter((item) => item.checked);

  return (
    <div className="list-view">
      <AddItemInput workspaceId={workspaceId} uid={uid} displayName={displayName} />

      {loading ? (
        <p className="item-list__empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="item-list__empty">No items yet — add something above.</p>
      ) : (
        <>
          <ul className="item-list">
            {uncheckedItems.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={handleToggle} />
            ))}
          </ul>

          {checkedItems.length > 0 && (
            <>
              <hr className="item-list__divider" />
              <ul className="item-list item-list--checked">
                {checkedItems.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={handleToggle} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <ClearCheckedButton workspaceId={workspaceId} checkedCount={checkedItems.length} />
    </div>
  );
}
