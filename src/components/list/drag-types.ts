/**
 * Shared shapes for threading dnd-kit's wiring into presentational
 * components.
 *
 * `ItemRow` and `ListColumn` stay presentational so a `DragOverlay` can
 * render a second, non-interactive copy of them without registering a
 * duplicate draggable/droppable id. Their sortable wrappers
 * (`SortableItemRow`, `SortableListColumn`) call the hooks and pass the
 * result down through the optional `drag` prop below; the overlay just
 * omits it.
 *
 * The listener/attribute types are derived from `useSortable` itself —
 * dnd-kit doesn't export `SyntheticListenerMap` from its public entrypoint.
 */
import type { CSSProperties, KeyboardEventHandler } from 'react';
import type { useSortable } from '@dnd-kit/sortable';

type Sortable = ReturnType<typeof useSortable>;
export type DragAttributes = Sortable['attributes'];
export type DragListeners = Sortable['listeners'];

/**
 * The keyboard activator on its own, for when a dedicated drag handle sits
 * *inside* an element that already carries the pointer listeners — binding
 * the whole map to both would try to start the same drag twice.
 *
 * dnd-kit types its listener map as `Record<string, Function>`, so the React
 * handler type has to be reasserted here.
 */
export function keyboardActivator(
  listeners: DragListeners,
): KeyboardEventHandler<HTMLElement> | undefined {
  return listeners?.onKeyDown as KeyboardEventHandler<HTMLElement> | undefined;
}

/** dnd-kit wiring for one draggable shopping-list row. */
export interface ItemDrag {
  setNodeRef: (node: HTMLElement | null) => void;
  /** The explicit grip — the keyboard drag activator. */
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: DragAttributes;
  listeners: DragListeners;
  isDragging: boolean;
}

/** dnd-kit wiring for one board column. */
export interface ColumnDrag {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
  /** The ruled sheet, registered as a drop target for items. */
  setSheetRef: (node: HTMLElement | null) => void;
  /** `true` while an item is hovering over this column. */
  isDropTarget: boolean;
  /**
   * The binding strip, as the column's drag handle. Absent below the board
   * breakpoint, where only one column is ever on screen and there is nothing
   * to reorder it against.
   */
  handle?: {
    setActivatorNodeRef: (node: HTMLElement | null) => void;
    attributes: DragAttributes;
    listeners: DragListeners;
  };
}

/** dnd-kit id namespaces. One `DndContext` hosts all four. */
export const dragIds = {
  item: (itemId: string) => `item:${itemId}`,
  list: (listId: string) => `list:${listId}`,
  /** A column's sheet — "drop at the end of this list". */
  column: (listId: string) => `column:${listId}`,
  /** A narrow-screen list tab — the mobile stand-in for a neighbouring column. */
  tab: (listId: string) => `tab:${listId}`,
} as const;

/** Strips a `prefix:` namespace off a dnd-kit id, or `null` if it doesn't match. */
export function parseDragId(id: string | number, prefix: string): string | null {
  const value = String(id);
  return value.startsWith(`${prefix}:`) ? value.slice(prefix.length + 1) : null;
}
