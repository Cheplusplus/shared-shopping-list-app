/**
 * The board: every named list in the active workspace, as ruled-notepad
 * columns you can rearrange by dragging.
 *
 * Above `--board-breakpoint` the columns sit side by side and scroll
 * horizontally; below it, one list shows at a time with `ListTabs` to switch
 * between them. Three things drag, all through the one `DndContext` here:
 * columns among themselves, items within a column, and items from one column
 * into another (or, on a phone, onto another list's tab).
 *
 * All the drop *math* lives here rather than in the columns because working
 * out where a dropped thing lands needs the target list's items, which the
 * columns don't have for each other — hence `useBoardItems` subscribing to
 * every list at the board level.
 *
 * `workspaceId`/`uid`/`displayName` are threaded in by the integration layer
 * (App.tsx) from `WorkspaceContext`/`AuthContext`.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { moveItem, normalizeItemOrders, toggleChecked } from '../firebase/items';
import {
  createList,
  deleteList,
  normalizeListOrders,
  renameList,
  setListOrder,
} from '../firebase/lists';
import { useSettings } from '../contexts/SettingsContext';
import { useLists } from '../hooks/useLists';
import { useBoardItems } from '../hooks/useBoardItems';
import { useActiveList } from '../hooks/useActiveList';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ItemRow } from '../components/list/ItemRow';
import { ListColumn } from '../components/list/ListColumn';
import { ListTabs } from '../components/list/ListTabs';
import { NewListButton } from '../components/list/NewListButton';
import { SortableListColumn } from '../components/list/SortableListColumn';
import { dragIds, parseDragId } from '../components/list/drag-types';
import { ORDER_STEP, needsNormalize, orderBetween } from '../lib/ordering';
import type { Item, List, WithId } from '../types/models';
import '../components/list/list.css';

/** Kept in sync with the `--board-breakpoint` media queries in `list.css`. */
const BOARD_QUERY = '(min-width: 60rem)';

export interface ListViewProps {
  workspaceId: string;
  uid: string;
  displayName: string;
}

export function ListView({ workspaceId, uid, displayName }: ListViewProps) {
  const { settings } = useSettings();
  const { lists, loading: listsLoading, placeList } = useLists(workspaceId, uid);
  const listIds = useMemo(() => lists.map((list) => list.id), [lists]);
  const { itemsByList, placeItem } = useBoardItems(workspaceId, listIds);

  const isBoard = useMediaQuery(BOARD_QUERY);
  const [activeListId, setActiveListId] = useActiveList(workspaceId, lists);
  const [active, setActive] = useState<Active | null>(null);

  const sensors = useSensors(
    // A row is a button that toggles on click, so a plain press must never
    // become a drag: the mouse needs 6px of travel, and touch a 200ms hold
    // (which also leaves short swipes to scroll the page).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleToggle = useCallback(
    (item: WithId<Item>) => {
      // Optimistic: Firestore's local cache applies this instantly even
      // offline, and the item subscription reconciles with the server's view
      // (including from other users) as it arrives.
      void toggleChecked(workspaceId, item.id, !item.checked);
    },
    [workspaceId],
  );

  const handleCreateList = useCallback(
    (name: string) => {
      const lastOrder = lists.length > 0 ? lists[lists.length - 1].order : 0;
      void createList(workspaceId, uid, name, lastOrder + ORDER_STEP);
    },
    [workspaceId, uid, lists],
  );

  const handleRenameList = useCallback(
    (listId: string, name: string) => {
      void renameList(workspaceId, listId, name);
    },
    [workspaceId],
  );

  const handleDeleteList = useCallback(
    (list: WithId<List>) => {
      const items = itemsByList[list.id] ?? [];
      const warning =
        items.length > 0
          ? `Delete "${list.name}" and clear its ${items.length} item${items.length === 1 ? '' : 's'}?`
          : `Delete "${list.name}"?`;
      if (!window.confirm(warning)) return;
      void deleteList(
        workspaceId,
        list.id,
        items.map((item) => item.id),
      );
    },
    [workspaceId, itemsByList],
  );

  /**
   * Column drags only ever consider other columns as targets, item drags
   * never do. Without that split a column and the rows inside it both match
   * the pointer and the winner depends on rect geometry. Items are then
   * resolved rows-and-tabs first, sheets second, so "drop onto this row"
   * always beats the sheet the row sits on.
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const isColumnDrag = parseDragId(args.active.id, 'list') !== null;
    const candidates = args.droppableContainers.filter(
      (container) => (parseDragId(container.id, 'list') !== null) === isColumnDrag,
    );

    if (isColumnDrag) {
      const hits = pointerWithin({ ...args, droppableContainers: candidates });
      return hits.length > 0 ? hits : rectIntersection({ ...args, droppableContainers: candidates });
    }

    const precise = candidates.filter((container) => parseDragId(container.id, 'column') === null);
    const preciseHits = pointerWithin({ ...args, droppableContainers: precise });
    if (preciseHits.length > 0) return preciseHits;

    const sheets = candidates.filter((container) => parseDragId(container.id, 'column') !== null);
    const sheetHits = pointerWithin({ ...args, droppableContainers: sheets });
    if (sheetHits.length > 0) return sheetHits;

    return rectIntersection({ ...args, droppableContainers: candidates });
  }, []);

  function handleDragStart(event: DragStartEvent) {
    setActive(event.active);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActive(null);
    if (!event.over) return;

    const draggedListId = parseDragId(event.active.id, 'list');
    if (draggedListId) {
      dropColumn(draggedListId, event.over);
      return;
    }

    const draggedItemId = parseDragId(event.active.id, 'item');
    if (draggedItemId) {
      dropItem(draggedItemId, event.active, event.over);
    }
  }

  /**
   * Both drop handlers work out the new position synchronously and hand it
   * to `placeList`/`placeItem` *before* awaiting anything. That's what stops
   * the dropped thing flicking back to where it came from: it has already
   * moved by the time dnd-kit animates its overlay onto it. A drop that
   * resolves to no move at all returns early, leaving dnd-kit's own
   * snap-back to play — which is the right answer for a dead drop.
   *
   * Within a container they commit *exactly* what dnd-kit previewed, which
   * is `arrayMove(items, draggedIndex, overIndex)` — the greyed-out original
   * sits wherever `over` currently points. Deciding the landing spot any
   * other way (say, "has the dragged centre crossed the target's?") makes
   * the release contradict the preview: you see the new arrangement, let go,
   * and it springs back.
   */
  function dropColumn(listId: string, over: Over) {
    const overListId = parseDragId(over.id, 'list');
    if (!overListId || overListId === listId) return;

    const originalIndex = lists.findIndex((list) => list.id === listId);
    // Indices into the full array, matching what `arrayMove` — and so the
    // preview — works from.
    const overIndex = lists.findIndex((list) => list.id === overListId);
    if (originalIndex < 0 || overIndex < 0 || overIndex === originalIndex) return;

    // `arrayMove` removes the dragged column first, then inserts at
    // `overIndex`, so that's the index into the array without it.
    const siblings = lists.filter((list) => list.id !== listId);
    const previous = siblings[overIndex - 1]?.order;
    const next = siblings[overIndex]?.order;
    const order = orderBetween(previous, next);

    placeList(listId, { order }, async () => {
      await setListOrder(workspaceId, listId, order);

      if (needsNormalize(order, previous, next)) {
        const reordered = [...siblings];
        reordered.splice(overIndex, 0, { ...lists[originalIndex], order });
        await normalizeListOrders(workspaceId, reordered);
      }
    });
  }

  function dropItem(itemId: string, activeItem: Active, over: Over) {
    const sourceListId = activeItem.data.current?.listId as string | undefined;
    const item = sourceListId
      ? itemsByList[sourceListId]?.find((candidate) => candidate.id === itemId)
      : undefined;
    if (!sourceListId || !item) return;

    // Every drop target an item can hit — a row, a sheet, a tab — carries the
    // list it belongs to in its `data`.
    const targetListId = over.data.current?.listId as string | undefined;
    if (!targetListId) return;

    const targetItems = itemsByList[targetListId] ?? [];
    const sameList = targetListId === sourceListId;
    const originalIndex = targetItems.findIndex((candidate) => candidate.id === itemId);
    const siblings = targetItems.filter((candidate) => candidate.id !== itemId);

    const overItemId = parseDragId(over.id, 'item');
    const overIndex = overItemId
      ? targetItems.findIndex((candidate) => candidate.id === overItemId)
      : -1;

    let insertIndex: number;
    if (overIndex < 0) {
      // A sheet or a tab, not a row — no position implied, so append.
      insertIndex = siblings.length;
    } else if (sameList) {
      insertIndex = overIndex;
    } else {
      // Crossing columns, where dnd-kit shows no in-place preview to honour
      // (the original stays greyed in its own column) — so here the pointer
      // is the best signal for before-or-after.
      insertIndex = overIndex + (isPast(activeItem, over, 'vertical') ? 1 : 0);
    }

    if (sameList && insertIndex === originalIndex) return;

    // With checked rows sunk to the bottom they render below the unchecked
    // ones regardless of `order`, so an item's neighbours are the nearest
    // siblings in its own half — dropping into the other half lands it at that
    // half's edge. With the setting off, `order` *is* the rendered order and
    // the immediate neighbours are the real ones.
    const previous = settings.sinkChecked
      ? nearestOrder(siblings, insertIndex - 1, -1, item.checked)
      : siblings[insertIndex - 1]?.order;
    const next = settings.sinkChecked
      ? nearestOrder(siblings, insertIndex, 1, item.checked)
      : siblings[insertIndex]?.order;
    const order = orderBetween(previous, next);

    placeItem(itemId, { listId: targetListId, order }, async () => {
      await moveItem(workspaceId, itemId, targetListId, order);

      if (needsNormalize(order, previous, next)) {
        const reordered = [...siblings];
        reordered.splice(insertIndex, 0, { ...item, listId: targetListId, order });
        // Normalizing rewrites `order` down the rendered sequence, so it has
        // to be handed the list as it appears on screen.
        await normalizeItemOrders(
          workspaceId,
          settings.sinkChecked
            ? [
                ...reordered.filter((candidate) => !candidate.checked),
                ...reordered.filter((candidate) => candidate.checked),
              ]
            : reordered,
        );
      }
    });
  }

  if (listsLoading) {
    return <p className="list-board__status">Loading your lists…</p>;
  }
  if (lists.length === 0) {
    return <p className="list-board__status">Setting up your first list…</p>;
  }

  const visibleLists = isBoard ? lists : lists.filter((list) => list.id === activeListId);
  const itemCounts = Object.fromEntries(
    lists.map((list) => [
      list.id,
      (itemsByList[list.id] ?? []).filter((item) => !item.checked).length,
    ]),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {/* The tab row scrolls; the add button never does. */}
      <div className="list-bar">
        {!isBoard && (
          <ListTabs
            lists={lists}
            activeListId={activeListId}
            itemCounts={itemCounts}
            onSelect={setActiveListId}
          />
        )}
        <NewListButton onCreate={handleCreateList} />
      </div>

      <SortableContext
        items={lists.map((list) => dragIds.list(list.id))}
        strategy={horizontalListSortingStrategy}
      >
        <div className="list-board">
          {visibleLists.map((list) => (
            <SortableListColumn
              key={list.id}
              workspaceId={workspaceId}
              list={list}
              items={itemsByList[list.id] ?? []}
              uid={uid}
              displayName={displayName}
              loading={itemsByList[list.id] === undefined}
              canDelete={lists.length > 1}
              reorderable={isBoard}
              onToggleItem={handleToggle}
              onRename={(name) => handleRenameList(list.id, name)}
              onDelete={() => handleDeleteList(list)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        <DragPreview
          active={active}
          lists={lists}
          itemsByList={itemsByList}
          workspaceId={workspaceId}
          uid={uid}
          displayName={displayName}
        />
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Is the dragged thing's centre past the centre of what it's over? Only used
 * where dnd-kit shows no in-place preview to defer to — see `dropItem`.
 */
function isPast(active: Active, over: Over, axis: 'vertical' | 'horizontal'): boolean {
  const dragged = active.rect.current.translated;
  if (!dragged) return false;
  return axis === 'vertical'
    ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2
    : dragged.left + dragged.width / 2 > over.rect.left + over.rect.width / 2;
}

/**
 * Walks out from `start` in `step`'s direction for the first item on the
 * same side of the checked divide, and returns its `order`. Only used while
 * checked items sink to the bottom — see `dropItem`.
 *
 * The list then renders unchecked rows before checked ones whatever their
 * `order` is, so an item dropped in among the checked ones can't take a checked
 * row's order as a neighbour — it would render nowhere near where it landed.
 * Skipping to the nearest same-state sibling puts it at the edge of its own
 * half instead, which is the closest position that actually exists.
 */
function nearestOrder(
  items: readonly WithId<Item>[],
  start: number,
  step: 1 | -1,
  checked: boolean,
): number | undefined {
  for (let index = start; index >= 0 && index < items.length; index += step) {
    if (items[index].checked === checked) return items[index].order;
  }
  return undefined;
}

/**
 * The lifted copy that follows the pointer. Renders the *presentational*
 * `ItemRow`/`ListColumn` (no `drag` prop), so it doesn't register a second
 * draggable under the same id.
 */
function DragPreview({
  active,
  lists,
  itemsByList,
  workspaceId,
  uid,
  displayName,
}: {
  active: Active | null;
  lists: WithId<List>[];
  itemsByList: Record<string, WithId<Item>[]>;
  workspaceId: string;
  uid: string;
  displayName: string;
}) {
  if (!active) return null;

  const listId = parseDragId(active.id, 'list');
  if (listId) {
    const list = lists.find((candidate) => candidate.id === listId);
    if (!list) return null;
    return (
      <ListColumn
        overlay
        workspaceId={workspaceId}
        list={list}
        items={itemsByList[list.id] ?? []}
        uid={uid}
        displayName={displayName}
        renderItem={(item) => <ItemRow key={item.id} item={item} onToggle={noop} />}
      />
    );
  }

  const itemId = parseDragId(active.id, 'item');
  const sourceListId = active.data.current?.listId as string | undefined;
  const item = itemId && sourceListId
    ? itemsByList[sourceListId]?.find((candidate) => candidate.id === itemId)
    : undefined;
  if (!item) return null;

  return (
    <ul className="item-list item-list--overlay">
      <ItemRow item={item} onToggle={noop} overlay />
    </ul>
  );
}

function noop() {}
