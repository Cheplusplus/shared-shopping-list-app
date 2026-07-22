/**
 * A single shopping-list row. Tapping anywhere on the row toggles `checked`
 * (optimistic — no confirmation dialog).
 *
 * Per the spec, checked rows get a distinct visual treatment: shifted right,
 * reduced opacity, strikethrough, muted color. That treatment lives in
 * `list.css` under `.item-row--checked` (imported once by `ListView`).
 */
import type { Item, WithId } from '../../types/models';

export interface ItemRowProps {
  item: WithId<Item>;
  onToggle: (item: WithId<Item>) => void;
}

export function ItemRow({ item, onToggle }: ItemRowProps) {
  const rowClassName = item.checked ? 'item-row item-row--checked' : 'item-row';

  return (
    <li className={rowClassName}>
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
    </li>
  );
}
