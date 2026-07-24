/**
 * Text input for adding a new item, backed by `useSuggestions` for a
 * blended personal+workspace autocomplete dropdown.
 *
 * Enter (with no suggestion highlighted) submits the typed text as-is.
 * Arrow keys move a highlighted suggestion; Enter while one is highlighted
 * submits that suggestion's text instead. Clicking a suggestion submits it
 * directly. Either path calls `addItem` and clears the input.
 *
 * Alongside the text field is a camera button: on a phone it opens the camera
 * (or the gallery), then a `PhotoCaptionDialog` lets the person adding *decide*
 * whether the picture gets a name. A blank name adds a photo-only row
 * (`addPhotoItem`); a typed name adds an ordinary item (`addItem`) that happens
 * to have a photo. Either way the item is created first, then the compressed
 * image is uploaded and attached, mirroring how a row's `ItemPhoto` works.
 */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { addItem, addPhotoItem, deleteItem, setItemImage } from '../../firebase/items';
import { uploadItemImage } from '../../firebase/images';
import { compressImage } from '../../lib/image';
import { isCoarsePointer } from '../../lib/pointer';
import { useSuggestions } from '../../hooks/useSuggestions';
import { PhotoSourceSheet, type PhotoSource } from './PhotoSourceSheet';
import { PhotoCaptionDialog } from './PhotoCaptionDialog';

export interface AddItemInputProps {
  workspaceId: string;
  listId: string;
  uid: string;
  displayName: string;
  /**
   * The `order` to give the new item — the owning column already has its
   * items subscribed, so it knows where the end of the list is and `addItem`
   * doesn't have to spend a read finding out.
   */
  nextOrder: number;
}

export function AddItemInput({
  workspaceId,
  listId,
  uid,
  displayName,
  nextOrder,
}: AddItemInputProps) {
  const [text, setText] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const { suggestions } = useSuggestions(uid, workspaceId, text);

  const showSuggestions = suggestions.length > 0 && text.trim().length > 0;

  // Free the preview's object URL when it's replaced or the dialog closes.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function submitText(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await addItem(workspaceId, listId, uid, displayName, trimmed, nextOrder);
      setText('');
      setActiveIndex(-1);
    } finally {
      setSubmitting(false);
    }
  }

  // Adds the staged photo, with `caption` deciding its kind: a name makes an
  // ordinary item (worth remembering in history), a blank one a photo-only row.
  async function addPhoto(caption: string) {
    if (!pendingPhoto || photoBusy) return;
    const name = caption.trim();
    setPhotoBusy(true);
    setPhotoError(null);
    // Compress before creating the item so a bad file fails without leaving a
    // stray row; once the item exists, a later failure gets rolled back.
    let itemId: string | null = null;
    try {
      const compressed = await compressImage(pendingPhoto);
      itemId = name
        ? await addItem(workspaceId, listId, uid, displayName, name, nextOrder)
        : await addPhotoItem(workspaceId, listId, uid, displayName, nextOrder);
      const uploaded = await uploadItemImage(workspaceId, itemId, compressed);
      await setItemImage(workspaceId, itemId, uploaded);
      closePhotoDialog();
    } catch (cause) {
      if (itemId) void deleteItem(workspaceId, itemId);
      setPhotoError(cause instanceof Error ? cause.message : 'Couldn’t add that photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function closePhotoDialog() {
    setPendingPhoto(null);
    setPreviewUrl(null);
    setPhotoError(null);
  }

  // On a phone, let the user pick the camera or the gallery; on a desktop the
  // camera hint is meaningless, so just open the file dialog.
  function openPhotoPicker() {
    if (isCoarsePointer()) setChoosing(true);
    else libraryInputRef.current?.click();
  }

  function pickSource(source: PhotoSource) {
    // Click the input while still inside the sheet button's user gesture —
    // browsers only open a file dialog from one — then dismiss the sheet.
    (source === 'camera' ? cameraInputRef : libraryInputRef).current?.click();
    setChoosing(false);
  }

  function onPhotoPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared before handling, so picking the *same* file again after cancelling
    // still fires `change`.
    event.target.value = '';
    if (!file) return;
    // Stage it and open the caption dialog rather than adding straight away, so
    // the person adding chooses whether the row gets a name.
    setPendingPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhotoError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeIndex >= 0 && activeIndex < suggestions.length) {
      void submitText(suggestions[activeIndex].text);
    } else {
      void submitText(text);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (event.key === 'Escape') {
      setActiveIndex(-1);
    }
  }

  return (
    <div className="add-item">
      <form className="add-item__form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="add-item__input"
          value={text}
          placeholder="Add an item…"
          onChange={(event) => {
            setText(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
        />
        <button
          type="button"
          className="add-item__camera"
          onClick={openPhotoPicker}
          disabled={pendingPhoto !== null}
          aria-label="Add an item from a photo"
          title="Add a photo"
        >
          <span aria-hidden="true">📷</span>
        </button>
        <button type="submit" className="add-item__submit" disabled={submitting || !text.trim()}>
          Add
        </button>
      </form>

      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="add-item__photo-input"
        tabIndex={-1}
        onChange={onPhotoPicked}
      />
      {/* Same picker, but `capture` asks a phone to open the camera. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="add-item__photo-input"
        tabIndex={-1}
        onChange={onPhotoPicked}
      />

      {choosing && (
        <PhotoSourceSheet
          title="Add a photo item"
          onPick={pickSource}
          onClose={() => setChoosing(false)}
        />
      )}

      {pendingPhoto && previewUrl && (
        <PhotoCaptionDialog
          previewUrl={previewUrl}
          busy={photoBusy}
          error={photoError}
          onConfirm={(caption) => void addPhoto(caption)}
          onCancel={closePhotoDialog}
        />
      )}

      {showSuggestions && (
        <ul className="add-item__suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.normalizedText}
              className={
                index === activeIndex
                  ? 'add-item__suggestion add-item__suggestion--active'
                  : 'add-item__suggestion'
              }
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                // Prevent the input from losing focus before we handle the click.
                event.preventDefault();
              }}
              onClick={() => void submitText(suggestion.text)}
            >
              {suggestion.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
