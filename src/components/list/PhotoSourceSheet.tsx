/**
 * The little "Take photo / Choose from library" chooser that lets a phone user
 * opt into the camera rather than the gallery.
 *
 * A plain `<input type="file" accept="image/*">` already offers both on some
 * platforms, but not reliably — Android in particular often drops straight into
 * the file browser — so the two paths are made explicit here and backed by two
 * separate inputs in the caller (the camera one carries `capture`). It's only
 * worth showing on a touch device (see `isCoarsePointer` in `lib/pointer`): on
 * a desktop the camera capture hint is ignored and both options would just open
 * the same file dialog, so callers skip the sheet there.
 *
 * Rendered through a portal for the same reason `PhotoViewer` is — a row being
 * dragged carries a `transform` that would otherwise anchor a `position: fixed`
 * overlay to the column instead of the screen.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type PhotoSource = 'camera' | 'library';

export function PhotoSourceSheet({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (source: PhotoSource) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="photo-source" onClick={onClose}>
      <div
        className="photo-source__sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="photo-source__title">{title}</p>
        <button
          type="button"
          className="photo-source__option"
          onClick={() => onPick('camera')}
        >
          <span className="photo-source__icon" aria-hidden="true">
            📷
          </span>
          Take photo
        </button>
        <button
          type="button"
          className="photo-source__option"
          onClick={() => onPick('library')}
        >
          <span className="photo-source__icon" aria-hidden="true">
            🖼️
          </span>
          Choose from library
        </button>
        <button type="button" className="photo-source__cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
