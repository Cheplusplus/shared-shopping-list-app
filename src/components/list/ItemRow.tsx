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
 *
 * `workspaceId` is threaded through purely for `ItemPhoto`, which does its own
 * writes (as `ListColumn` does for `AddItemInput`); leaving it off gives a
 * read-only row, which is what the drag overlay wants.
 */
import { ItemPhoto } from './ItemPhoto';
import { keyboardActivator } from './drag-types';
import type { Item, WithId } from '../../types/models';
import type { ItemDrag } from './drag-types';

export interface ItemRowProps {
  item: WithId<Item>;
  onToggle: (item: WithId<Item>) => void;
  /** Omit to render the row's photo without its attach/replace controls. */
  workspaceId?: string;
  drag?: ItemDrag;
  /** Renders the lifted copy shown inside a `DragOverlay`. */
  overlay?: boolean;
}

export function ItemRow({ item, onToggle, workspaceId, drag, overlay = false }: ItemRowProps) {
  // A photo-only item (added by picture, left unnamed) keeps its placeholder
  // text for screen readers but hides it on screen, letting the thumbnail be
  // the row. Only once the image has landed — before that the label still shows
  // so the row isn't a mystery blank line mid-upload.
  const photoOnly = Boolean(item.photoItem && item.image);

  const classNames = ['item-row'];
  if (item.checked) classNames.push('item-row--checked');
  if (drag?.isDragging) classNames.push('item-row--dragging');
  if (overlay) classNames.push('item-row--overlay');
  if (photoOnly) classNames.push('item-row--photo');

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
        <span className={photoOnly ? 'item-row__text item-row__text--hidden' : 'item-row__text'}>
          {item.text}
        </span>
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

      <ItemPhoto item={item} workspaceId={workspaceId} />
    </li>
  );
}
