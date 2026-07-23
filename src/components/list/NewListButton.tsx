/**
 * "+" button that adds a list, expanding into a one-field form in place.
 *
 * Deliberately lives *outside* the horizontally-scrolling tab row: as a chip
 * at the end of that row it scrolled off the right edge as soon as a
 * workspace had a few lists, which made adding one look impossible.
 */
import { useEffect, useRef, useState } from 'react';

export interface NewListButtonProps {
  onCreate: (name: string) => void;
}

export function NewListButton({ onCreate }: NewListButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setName('');
  }

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      close();
      return;
    }
    onCreate(trimmed);
    close();
  }

  if (!open) {
    return (
      <button type="button" className="new-list-button" onClick={() => setOpen(true)}>
        <span className="new-list-button__plus" aria-hidden="true">
          +
        </span>
        <span className="new-list-button__label">New list</span>
      </button>
    );
  }

  return (
    <form
      className="new-list-button new-list-button--open"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="new-list-button__input"
        aria-label="New list name"
        placeholder="List name…"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={handleSubmit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      />
    </form>
  );
}
