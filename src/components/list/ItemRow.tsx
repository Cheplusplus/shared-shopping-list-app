/**
 * A single shopping-list row. Tapping anywhere on the row toggles `checked`
 * (optimistic — no confirmation dialog); dragging it reorders it, or moves it
 * to another list.
 *
 * Per the spec, checked rows get a distinct visual treatment: shifted right,
 * reduced opacity, strikethrough, muted color. That treatment lives in
 * `list.css` under `.item-row--checked` (imported once by `ListView`).
 *
 * Presentational: the `drag` prop carries dnd-kit's wiring in from
 * `SortableItemRow`, and is omitted when this renders inside a `DragOverlay`
 * (see `drag-types.ts`). Pointer listeners sit on the `<li>` so a drag can
 * start anywhere on the row, while the grip is the *keyboard* activator —
 * that keeps Enter/Space on the toggle button meaning "toggle".
 */
import { keyboardActivator } from './drag-types';
import type { Item, WithId } from '../../types/models';
import type { ItemDrag } from './drag-types';

export interface ItemRowProps {
  item: WithId<Item>;
  onToggle: (item: WithId<Item>) => void;
  drag?: ItemDrag;
  /** Renders the lifted copy shown inside a `DragOverlay`. */
  overlay?: boolean;
}

export function ItemRow({ item, onToggle, drag, overlay = false }: ItemRowProps) {
  const classNames = ['item-row'];
  if (item.checked) classNames.push('item-row--checked');
  if (drag?.isDragging) classNames.push('item-row--dragging');
  if (overlay) classNames.push('item-row--overlay');

  return (
    <li
      className={classNames.join(' ')}
      ref={drag?.setNodeRef}
      style={drag?.style}
      {...drag?.listeners}
    >
      <button
        type="button"
        className="item-row__button"
        onClick={() => onToggle(item)}
        aria-pressed={item.checked}
      >
        <span className="item-row__checkbox" aria-hidden="true">
          {item.checked ? '✓' : ''}
        </span>
        <span className="item-row__text">{item.text}</span>
      </button>

      {drag && (
        <button
          type="button"
          className="item-row__grip"
          ref={drag.setActivatorNodeRef}
          aria-label={`Reorder ${item.text}`}
          {...drag.attributes}
          // Only the keyboard activator: the pointer listeners already sit on
          // the <li> and bubble up from here, so re-binding them would try to
          // start the same drag twice.
          onKeyDown={keyboardActivator(drag.listeners)}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
    </li>
  );
}
