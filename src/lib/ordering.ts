/**
 * Fractional indexing for drag-and-drop ordering.
 *
 * Both list columns and the items inside them carry a numeric `order`. To
 * move one thing between two others we only ever write *that one doc*: its
 * new order is the midpoint of its neighbours'. No sibling rewrites, so a
 * drop is a single-doc update that Firestore's offline cache applies
 * instantly.
 *
 * Midpoints halve the gap each time, and a double survives roughly 50
 * halvings of `ORDER_STEP` before it can no longer represent the midpoint.
 * `needsNormalize` fires well before that, at which point the caller
 * rewrites the whole column with `sequentialOrders` to restore clean gaps.
 */

/** Gap between freshly-assigned orders. */
export const ORDER_STEP = 1024;

/**
 * Smallest gap we tolerate before rewriting a column. Comfortably above the
 * point where midpoints stop being representable, so normalization is a
 * rare housekeeping write rather than a correctness fix.
 */
const MIN_GAP = 1e-4;

/**
 * The order for something dropped between `prev` and `next`. Pass `undefined`
 * for a missing neighbour: no `prev` means "first", no `next` means "last",
 * neither means the collection is empty.
 */
export function orderBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return ORDER_STEP;
  if (prev === undefined) return next! - ORDER_STEP;
  if (next === undefined) return prev + ORDER_STEP;
  return (prev + next) / 2;
}

/**
 * `true` when the gap around a freshly-computed `order` has collapsed far
 * enough that its column should be rewritten with `sequentialOrders`.
 */
export function needsNormalize(
  order: number,
  prev: number | undefined,
  next: number | undefined,
): boolean {
  if (prev !== undefined && Math.abs(order - prev) < MIN_GAP) return true;
  if (next !== undefined && Math.abs(next - order) < MIN_GAP) return true;
  return false;
}

/** `[ORDER_STEP, 2 * ORDER_STEP, …]` — clean orders for a whole column. */
export function sequentialOrders(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * ORDER_STEP);
}
