/**
 * Text input for adding a new item, backed by `useSuggestions` for a
 * blended personal+workspace autocomplete dropdown.
 *
 * Enter (with no suggestion highlighted) submits the typed text as-is.
 * Arrow keys move a highlighted suggestion; Enter while one is highlighted
 * submits that suggestion's text instead. Clicking a suggestion submits it
 * directly. Either path calls `addItem` and clears the input.
 */
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { addItem } from '../../firebase/items';
import { useSuggestions } from '../../hooks/useSuggestions';

export interface AddItemInputProps {
  workspaceId: string;
  uid: string;
  displayName: string;
}

export function AddItemInput({ workspaceId, uid, displayName }: AddItemInputProps) {
  const [text, setText] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const { suggestions } = useSuggestions(uid, workspaceId, text);

  const showSuggestions = suggestions.length > 0 && text.trim().length > 0;

  async function submitText(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await addItem(workspaceId, uid, displayName, trimmed);
      setText('');
      setActiveIndex(-1);
    } finally {
      setSubmitting(false);
    }
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
        <button type="submit" className="add-item__submit" disabled={submitting || !text.trim()}>
          Add
        </button>
      </form>

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
