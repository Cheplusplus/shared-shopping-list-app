/**
 * An item's photo: the thumbnail clipped under the row, the control that
 * attaches one, and the tap-to-enlarge viewer.
 *
 * Self-contained like `AddItemInput` — it takes the workspace id and runs its
 * own compress-then-upload rather than routing through the board, because
 * upload progress and failure are per-row concerns nothing else needs to
 * know about.
 *
 * Omitting `workspaceId` renders the thumbnail alone, with no controls: the
 * read-only mode the `DragOverlay` copy uses, mirroring how `ItemRow` omits
 * `drag` there. A row being dragged still shows its photo, it just can't be
 * edited mid-flight.
 *
 * The viewer goes through a portal rather than rendering in place. The row's
 * `<li>` carries dnd-kit's pointer listeners and gets a `transform` while its
 * column is dragged — which would turn the overlay's `position: fixed` into
 * something positioned against the column instead of the screen.
 */
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { deleteItemImage, uploadItemImage } from '../../firebase/images';
import { setItemImage } from '../../firebase/items';
import { compressImage } from '../../lib/image';
import { isCoarsePointer } from '../../lib/pointer';
import { PhotoSourceSheet, type PhotoSource } from './PhotoSourceSheet';
import type { Item, ItemImage as ItemImageModel, WithId } from '../../types/models';

/** How long a failure message hangs around before clearing itself. */
const ERROR_TIMEOUT_MS = 6000;

export interface ItemPhotoProps {
  item: WithId<Item>;
  /** Omit for a read-only thumbnail — see the file comment. */
  workspaceId?: string;
}

export function ItemPhoto({ item, workspaceId }: ItemPhotoProps) {
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const image = item.image ?? null;

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [error]);

  if (!workspaceId) {
    return image ? <img className="item-photo__thumb" src={image.url} alt="" /> : null;
  }

  async function attach(file: File) {
    if (!workspaceId) return;
    // Captured before the upload so the replaced object can be cleaned up
    // once — and only once — the item points somewhere else.
    const replaced = image?.path;

    setBusy(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const uploaded = await uploadItemImage(workspaceId, item.id, compressed);
      await setItemImage(workspaceId, item.id, uploaded);
      if (replaced) void deleteItemImage(replaced);
      setViewing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t attach that photo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!workspaceId || !image) return;

    setBusy(true);
    setError(null);
    try {
      await setItemImage(workspaceId, item.id, null);
      setViewing(false);
      void deleteItemImage(image.path);
    } catch {
      setError('Couldn’t remove that photo.');
    } finally {
      setBusy(false);
    }
  }

  // On a phone, let the user pick the camera or the gallery; on a desktop the
  // camera hint is meaningless, so just open the file dialog.
  function openPicker() {
    if (isCoarsePointer()) setChoosing(true);
    else libraryInputRef.current?.click();
  }

  function pickSource(source: PhotoSource) {
    // Click the input while still inside the sheet button's user gesture —
    // browsers only open a file dialog from one — then dismiss the sheet.
    (source === 'camera' ? cameraInputRef : libraryInputRef).current?.click();
    setChoosing(false);
  }

  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared before handling, so picking the *same* file again after a
    // failure still fires `change`.
    event.target.value = '';
    if (file) void attach(file);
  }

  return (
    <>
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="item-photo__input"
        tabIndex={-1}
        onChange={onPicked}
      />
      {/* Same picker, but `capture` asks a phone to open the camera. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="item-photo__input"
        tabIndex={-1}
        onChange={onPicked}
      />

      {image ? (
        <button
          type="button"
          className="item-photo__thumb-button"
          onClick={() => setViewing(true)}
          onPointerDown={stopDrag}
          aria-label={`Photo of ${item.text} — tap to enlarge`}
        >
          <img className="item-photo__thumb" src={image.url} alt="" loading="lazy" />
        </button>
      ) : (
        <button
          type="button"
          className="item-photo__attach"
          onClick={openPicker}
          onPointerDown={stopDrag}
          disabled={busy}
          aria-label={busy ? 'Attaching photo…' : `Attach a photo to ${item.text}`}
          title="Attach a photo"
        >
          <span aria-hidden="true">{busy ? '⋯' : '📷'}</span>
        </button>
      )}

      {error && (
        <span className="item-photo__error" role="alert">
          {error}
        </span>
      )}

      {viewing &&
        image &&
        createPortal(
          <PhotoViewer
            image={image}
            text={item.text}
            busy={busy}
            onReplace={openPicker}
            onRemove={() => void remove()}
            onClose={() => setViewing(false)}
          />,
          document.body,
        )}

      {choosing && (
        <PhotoSourceSheet
          title={image ? 'Replace photo' : 'Add a photo'}
          onPick={pickSource}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  );
}

/**
 * Full-size photo over a dimmed backdrop, with the replace/remove actions
 * that would clutter the ruled sheet if they lived on the row.
 */
function PhotoViewer({
  image,
  text,
  busy,
  onReplace,
  onRemove,
  onClose,
}: {
  image: ItemImageModel;
  text: string;
  busy: boolean;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="photo-viewer" onClick={onClose}>
      <div
        className="photo-viewer__frame"
        role="dialog"
        aria-modal="true"
        aria-label={`Photo of ${text}`}
        onClick={(event) => event.stopPropagation()}
      >
        <img
          className="photo-viewer__image"
          src={image.url}
          alt={`Photo of ${text}`}
          width={image.width}
          height={image.height}
        />

        <div className="photo-viewer__bar">
          <span className="photo-viewer__caption">{text}</span>
          <div className="photo-viewer__actions">
            <button type="button" className="photo-viewer__action" disabled={busy} onClick={onReplace}>
              Replace
            </button>
            <button
              type="button"
              className="photo-viewer__action photo-viewer__action--danger"
              disabled={busy}
              onClick={onRemove}
            >
              Remove
            </button>
          </div>
        </div>

        <button type="button" className="photo-viewer__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * The row's `<li>` starts a drag from a press anywhere on it, so without this
 * a long-press on a photo control would lift the row instead of opening the
 * picker. The drag grip deliberately does the opposite.
 */
function stopDrag(event: PointerEvent) {
  event.stopPropagation();
}
