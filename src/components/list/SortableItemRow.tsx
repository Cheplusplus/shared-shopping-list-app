/**
 * Binds `useSortable` to an `ItemRow`.
 *
 * `data.listId` is what the board's drop handler reads to work out which
 * column an item was dropped onto when the drop target is another *item*
 * rather than a column's sheet.
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ItemRow } from './ItemRow';
import { dragIds } from './drag-types';
import type { Item, WithId } from '../../types/models';

export interface SortableItemRowProps {
  item: WithId<Item>;
  listId: string;
  onToggle: (item: WithId<Item>) => void;
}

export function SortableItemRow({ item, listId, onToggle }: SortableItemRowProps) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dragIds.item(item.id), data: { listId } });

  return (
    <ItemRow
      item={item}
      onToggle={onToggle}
      drag={{
        setNodeRef,
        setActivatorNodeRef,
        attributes,
        listeners,
        isDragging,
        style: { transform: CSS.Translate.toString(transform), transition },
      }}
    />
  );
}
