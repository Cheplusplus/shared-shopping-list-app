/**
 * Debounced wrapper around `getSuggestions` from `src/firebase/history.ts`.
 *
 * Debounces the Firestore query by `debounceMs` (default 200ms) so typing
 * doesn't fire a query per keystroke. Returns `{ suggestions: [], loading:
 * false }` whenever `uid`/`workspaceId` is `null` or `prefix` is blank.
 */
import { useEffect, useRef, useState } from 'react';
import { getSuggestions, type Suggestion } from '../firebase/history';

export interface UseSuggestionsResult {
  suggestions: Suggestion[];
  loading: boolean;
}

const DEFAULT_DEBOUNCE_MS = 200;

export function useSuggestions(
  uid: string | null,
  workspaceId: string | null,
  prefix: string,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): UseSuggestionsResult {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedPrefix = prefix.trim();

    if (!uid || !workspaceId || !trimmedPrefix) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const thisRequestId = ++requestIdRef.current;

    const timeoutId = setTimeout(() => {
      getSuggestions(uid, workspaceId, trimmedPrefix)
        .then((results) => {
          if (requestIdRef.current === thisRequestId) {
            setSuggestions(results);
            setLoading(false);
          }
        })
        .catch(() => {
          if (requestIdRef.current === thisRequestId) {
            setSuggestions([]);
            setLoading(false);
          }
        });
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [uid, workspaceId, prefix, debounceMs]);

  return { suggestions, loading };
}
