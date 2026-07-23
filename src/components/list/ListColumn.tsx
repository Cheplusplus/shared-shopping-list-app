/**
 * One named list, rendered as a ruled notepad: a spiral-bound head strip
 * (title + add box), the ruled paper sheet of items, and a foot strip
 * (summary + "Clear checked"). On a wide screen several of these sit side by
 * side as board columns; on a phone one shows at a time.
 *
 * Unchecked items render first, then checked ones (each with the spec's
 * shifted-right/greyed/struck-through treatment) — all flowing down the same
 * ruled lines, so no divider is needed.
 *
 * Presentational. The `drag` prop carries dnd-kit's wiring in from
 * `SortableListColumn` and is omitted when this renders inside a
 * `DragOverlay`; `renderItem` lets the board supply sortable rows while the
 * overlay supplies plain ones.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AddItemInput } from './AddItemInput';
import { ClearCheckedButton } from './ClearCheckedButton';
import { ORDER_STEP } from '../../lib/ordering';
import type { Item, List, WithId } from '../../types/models';
import type { ColumnDrag } from './drag-types';

export interface ListColumnProps {
  workspaceId: string;
  list: WithId<List>;
  items: WithId<Item>[];
  uid: string;
  displayName: string;
  loading?: boolean;
  /** `false` for a workspace's only list — the board must never be empty. */
  canDelete?: boolean;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  renderItem: (item: WithId<Item>) => ReactNode;
  drag?: ColumnDrag;
  /** Renders the lifted copy shown inside a `DragOverlay`. */
  overlay?: boolean;
}

export function ListColumn({
  workspaceId,
  list,
  items,
  uid,
  displayName,
  loading = false,
  canDelete = true,
  onRename,
  onDelete,
  renderItem,
  drag,
  overlay = false,
}: ListColumnProps) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the options menu the way a menu is expected to dismiss: a click
  // anywhere else, or Escape.
  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const uncheckedItems = items.filter((item) => !item.checked);
  const checkedItems = items.filter((item) => item.checked);
  const hasItems = items.length > 0;

  // Append new items after everything already in the list.
  const nextOrder = items.reduce((max, item) => Math.max(max, item.order), 0) + ORDER_STEP;

  const classNames = ['notepad'];
  if (drag?.isDragging) classNames.push('notepad--dragging');
  if (overlay) classNames.push('notepad--overlay');

  return (
    <section className={classNames.join(' ')} ref={drag?.setNodeRef} style={drag?.style}>
      <div
        className={drag?.handle ? 'notepad__binding notepad__binding--handle' : 'notepad__binding'}
        ref={drag?.handle?.setActivatorNodeRef}
        aria-label={drag?.handle ? `Reorder ${list.name}` : undefined}
        aria-hidden={drag?.handle ? undefined : true}
        {...drag?.handle?.attributes}
        {...drag?.handle?.listeners}
      />

      <div className="notepad__head">
        <div className="notepad__title-row">
          {renaming && onRename ? (
            <RenameForm
              name={list.name}
              onCommit={(name) => {
                setRenaming(false);
                if (name !== list.name) onRename(name);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h2 className="notepad__title">{list.name}</h2>
          )}

          {!loading && !renaming && (
            <span
              className={
                uncheckedItems.length > 0 ? 'notepad__count' : 'notepad__count notepad__count--none'
              }
            >
              {uncheckedItems.length > 0
                ? `${uncheckedItems.length} to buy`
                : hasItems
                  ? 'All done 🎉'
                  : 'Empty'}
            </span>
          )}

          {(onRename || onDelete) && !renaming && (
            <div className="notepad__menu" ref={menuRef}>
              <button
                type="button"
                className="notepad__menu-trigger"
                aria-label={`${list.name} list options`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span aria-hidden="true">⋯</span>
              </button>

              {menuOpen && (
                <ul className="notepad__menu-list" role="menu">
                  {onRename && (
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        className="notepad__menu-item"
                        onClick={() => {
                          setMenuOpen(false);
                          setRenaming(true);
                        }}
                      >
                        Rename list
                      </button>
                    </li>
                  )}
                  {onDelete && (
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        className="notepad__menu-item notepad__menu-item--danger"
                        disabled={!canDelete}
                        title={canDelete ? undefined : 'A workspace needs at least one list'}
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete();
                        }}
                      >
                        Delete list
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <AddItemInput
          workspaceId={workspaceId}
          listId={list.id}
          uid={uid}
          displayName={displayName}
          nextOrder={nextOrder}
        />
      </div>

      <div
        className={
          drag?.isDropTarget ? 'notepad__sheet notepad__sheet--drop-target' : 'notepad__sheet'
        }
        ref={drag?.setSheetRef}
      >
        {loading ? (
          <p className="item-list__empty">Loading your list…</p>
        ) : !hasItems ? (
          <p className="item-list__empty">Nothing here yet — jot something down above ✍️</p>
        ) : (
          <ul className="item-list">
            {uncheckedItems.map(renderItem)}
            {checkedItems.map(renderItem)}
          </ul>
        )}
      </div>

      {checkedItems.length > 0 && (
        <div className="notepad__foot">
          <span className="notepad__summary">{checkedItems.length} in the basket</span>
          <ClearCheckedButton
            workspaceId={workspaceId}
            checkedItemIds={checkedItems.map((item) => item.id)}
          />
        </div>
      )}
    </section>
  );
}

/** Inline list-title editor. Enter or blur commits, Escape abandons. */
function RenameForm({
  name,
  onCommit,
  onCancel,
}: {
  name: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    onCommit(trimmed);
  }

  return (
    <form
      className="notepad__rename"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="notepad__rename-input"
        aria-label="List name"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
    </form>
  );
}
