/**
 * Binds a `ListColumn` to dnd-kit three ways:
 *
 * - `useSortable` on the column itself, so it can be dragged among its
 *   siblings (board only — below the breakpoint there's one column on screen
 *   and nothing to reorder it against, so the handle is left off).
 * - `useDroppable` on the ruled sheet, so an item can be dropped onto a list
 *   that is empty or whose rows the pointer never reaches.
 * - A vertical `SortableContext` around its rows. Each list being its own
 *   sortable container is what lets an item cross from one into another.
 */
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ListColumn } from './ListColumn';
import { SortableItemRow } from './SortableItemRow';
import { dragIds } from './drag-types';
import type { Item, List, WithId } from '../../types/models';

export interface SortableListColumnProps {
  workspaceId: string;
  list: WithId<List>;
  items: WithId<Item>[];
  uid: string;
  displayName: string;
  loading?: boolean;
  canDelete?: boolean;
  /** `false` on narrow screens, where there's only ever one column on show. */
  reorderable?: boolean;
  onToggleItem: (item: WithId<Item>) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function SortableListColumn({
  workspaceId,
  list,
  items,
  uid,
  displayName,
  loading,
  canDelete,
  reorderable = true,
  onToggleItem,
  onRename,
  onDelete,
}: SortableListColumnProps) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dragIds.list(list.id), disabled: !reorderable });

  const { setNodeRef: setSheetRef, isOver } = useDroppable({
    id: dragIds.column(list.id),
    data: { listId: list.id },
  });

  return (
    <SortableContext
      items={items.map((item) => dragIds.item(item.id))}
      strategy={verticalListSortingStrategy}
    >
      <ListColumn
        workspaceId={workspaceId}
        list={list}
        items={items}
        uid={uid}
        displayName={displayName}
        loading={loading}
        canDelete={canDelete}
        onRename={onRename}
        onDelete={onDelete}
        drag={{
          setNodeRef,
          isDragging,
          style: { transform: CSS.Translate.toString(transform), transition },
          setSheetRef,
          isDropTarget: isOver,
          handle: reorderable ? { setActivatorNodeRef, attributes, listeners } : undefined,
        }}
        renderItem={(item) => (
          <SortableItemRow
            key={item.id}
            item={item}
            workspaceId={workspaceId}
            listId={list.id}
            onToggle={onToggleItem}
          />
        )}
      />
    </SortableContext>
  );
}
