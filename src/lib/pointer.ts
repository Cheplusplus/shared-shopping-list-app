/**
 * Tiny input-capability check used to decide when to offer a camera choice.
 *
 * `(pointer: coarse)` is true on touch devices, where a file input's `capture`
 * attribute actually opens the camera. On a mouse-and-keyboard machine the hint
 * is ignored — the camera and gallery paths would open the same file dialog —
 * so callers skip the "Take photo / Choose from library" sheet there.
 */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}
