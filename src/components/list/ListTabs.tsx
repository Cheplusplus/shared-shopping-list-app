/**
 * Narrow-screen list switcher: one chip per list.
 *
 * Each chip is also a drop target. Dragging a row onto a tab moves it to that
 * list — the phone's stand-in for dragging it into a neighbouring column,
 * since only one column is ever on screen.
 *
 * This row scrolls sideways, so "new list" deliberately isn't in it — see
 * `NewListButton`, which the board keeps pinned outside the scroll.
 */
import { useDroppable } from '@dnd-kit/core';
import { dragIds } from './drag-types';
import type { List, WithId } from '../../types/models';

export interface ListTabsProps {
  lists: WithId<List>[];
  activeListId: string | null;
  itemCounts: Record<string, number>;
  onSelect: (listId: string) => void;
}

export function ListTabs({ lists, activeListId, itemCounts, onSelect }: ListTabsProps) {
  return (
    <div className="list-tabs" role="tablist" aria-label="Lists">
      {lists.map((list) => (
        <ListTab
          key={list.id}
          list={list}
          active={list.id === activeListId}
          count={itemCounts[list.id] ?? 0}
          onSelect={() => onSelect(list.id)}
        />
      ))}
    </div>
  );
}

function ListTab({
  list,
  active,
  count,
  onSelect,
}: {
  list: WithId<List>;
  active: boolean;
  count: number;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dragIds.tab(list.id),
    data: { listId: list.id },
  });

  const classNames = ['list-tab'];
  if (active) classNames.push('list-tab--active');
  if (isOver) classNames.push('list-tab--drop-target');

  return (
    <button
      type="button"
      ref={setNodeRef}
      role="tab"
      aria-selected={active}
      className={classNames.join(' ')}
      onClick={onSelect}
    >
      {list.name}
      {count > 0 && <span className="list-tab__count">{count}</span>}
    </button>
  );
}
