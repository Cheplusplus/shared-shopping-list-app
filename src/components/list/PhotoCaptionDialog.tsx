/**
 * The step between picking a photo and adding it as its own list item: a
 * preview and an *optional* name field, so the person adding decides whether
 * the row carries text or is just the picture.
 *
 * Leaving the field blank adds a photo-only row (label hidden — see
 * `addPhotoItem`); typing a name adds an ordinary named item that happens to
 * have a photo. The dialog stays up while the upload runs so failures show
 * in place and the picture isn't lost to a half-created row.
 *
 * Rendered through a portal, like the other list overlays, so a dragged row's
 * `transform` can't anchor its `position: fixed` backdrop to the column.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

export function PhotoCaptionDialog({
  previewUrl,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  previewUrl: string;
  busy: boolean;
  error: string | null;
  onConfirm: (caption: string) => void;
  onCancel: () => void;
}) {
  const [caption, setCaption] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy) onConfirm(caption);
  }

  return createPortal(
    <div className="photo-caption" onClick={busy ? undefined : onCancel}>
      <form
        className="photo-caption__frame"
        role="dialog"
        aria-modal="true"
        aria-label="Add a photo item"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <img className="photo-caption__preview" src={previewUrl} alt="Selected photo" />

        <input
          ref={inputRef}
          type="text"
          className="photo-caption__input"
          value={caption}
          placeholder="Add a name (optional)"
          onChange={(event) => setCaption(event.target.value)}
          disabled={busy}
        />

        {error && (
          <p className="photo-caption__error" role="alert">
            {error}
          </p>
        )}

        <div className="photo-caption__actions">
          <button
            type="button"
            className="photo-caption__cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="photo-caption__submit" disabled={busy}>
            {busy ? 'Adding…' : caption.trim() ? 'Add to list' : 'Add photo'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
