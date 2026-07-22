/**
 * `userItemHistory` / `workspaceItemHistory` upserts + the blended
 * autocomplete suggestion query.
 *
 * Note on `normalizedText` vs. doc-ID sanitization: `normalizedText` (the
 * *field*, used for prefix range queries) is just trim+lowercase. The doc ID
 * segment derived from it must additionally be a valid Firestore document ID
 * (no `/`, not reserved `__...__`, not empty/`.`/`..`) - see
 * `sanitizeForDocId`. Never use raw user input directly as an ID segment.
 */
import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './config';

/** Lowercases + trims + collapses whitespace. Used for prefix range queries. */
export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

const RESERVED_ID_PATTERN = /^__.*__$/;
const MAX_ID_SEGMENT_LENGTH = 300;

/**
 * Turns a `normalizedText` value into a safe Firestore document-ID segment:
 * strips `/` (disallowed in doc IDs) and control characters, avoids the
 * reserved `__...__` pattern and the empty/`.`/`..` forms, and caps length
 * well under Firestore's 1,500-byte doc ID limit.
 */
export function sanitizeForDocId(normalizedText: string): string {
  let sanitized = normalizedText
    .replace(/\//g, '-')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join('')
    .trim();

  if (sanitized === '' || sanitized === '.' || sanitized === '..') {
    sanitized = 'item';
  }
  if (RESERVED_ID_PATTERN.test(sanitized)) {
    sanitized = `x${sanitized}`;
  }
  if (sanitized.length > MAX_ID_SEGMENT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_ID_SEGMENT_LENGTH);
  }
  return sanitized;
}

export interface UpsertItemHistoryParams {
  uid: string;
  workspaceId: string;
  text: string;
}

/**
 * Upserts both the adding user's personal history doc
 * (`userItemHistory/{uid}_{sanitized}`) and the workspace's shared history
 * doc (`workspaceItemHistory/{workspaceId}_{sanitized}`) in one batch,
 * incrementing `useCount` and bumping `lastUsedAt`. Called from
 * `items.ts`'s `addItem` - callers adding an item should not need to call
 * this separately.
 */
export async function upsertItemHistory({
  uid,
  workspaceId,
  text,
}: UpsertItemHistoryParams): Promise<void> {
  const normalizedText = normalizeText(text);
  const idSegment = sanitizeForDocId(normalizedText);

  const userHistoryRef = doc(db, 'userItemHistory', `${uid}_${idSegment}`);
  const workspaceHistoryRef = doc(db, 'workspaceItemHistory', `${workspaceId}_${idSegment}`);

  const batch = writeBatch(db);
  batch.set(
    userHistoryRef,
    {
      uid,
      text,
      normalizedText,
      useCount: increment(1),
      lastUsedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(
    workspaceHistoryRef,
    {
      workspaceId,
      text,
      normalizedText,
      useCount: increment(1),
      lastUsedAt: serverTimestamp(),
      lastAddedBy: uid,
    },
    { merge: true },
  );
  await batch.commit();
}

export type SuggestionSource = 'personal' | 'workspace' | 'both';

export interface Suggestion {
  text: string;
  normalizedText: string;
  useCount: number;
  lastUsedAt: Timestamp;
  source: SuggestionSource;
}

interface HistoryLike {
  text: string;
  normalizedText: string;
  useCount: number;
  lastUsedAt: Timestamp;
}

const DEFAULT_SUGGESTION_LIMIT = 8;
const PER_QUERY_LIMIT = 10;

// Standard Firestore prefix-range trick: appending the last Unicode code
// point in the Basic Multilingual Private Use Area sorts after any
// realistic input character, so `[prefix, prefix + PREFIX_RANGE_CEILING)`
// matches every string that starts with `prefix`. (The plan's pseudocode
// wrote `prefix + ''`, which is what that same escape sequence renders as
// once markdown swallows the non-printable character - this constant is
// the working equivalent, spelled out as an explicit escape.)
const PREFIX_RANGE_CEILING = '';

/**
 * Runs the two parallel prefix queries described in the plan (personal
 * history scoped by `uid`, workspace history scoped by `workspaceId`),
 * merges them, dedupes by `normalizedText`, ranks by useCount desc then
 * recency desc, and caps to `max` (default 8).
 */
export async function getSuggestions(
  uid: string,
  workspaceId: string,
  prefix: string,
  max: number = DEFAULT_SUGGESTION_LIMIT,
): Promise<Suggestion[]> {
  const normalizedPrefix = normalizeText(prefix);
  if (!normalizedPrefix) {
    return [];
  }
  const upperBound = normalizedPrefix + PREFIX_RANGE_CEILING;

  const userHistoryQuery = query(
    collection(db, 'userItemHistory'),
    where('uid', '==', uid),
    where('normalizedText', '>=', normalizedPrefix),
    where('normalizedText', '<', upperBound),
    orderBy('normalizedText'),
    limit(PER_QUERY_LIMIT),
  );

  const workspaceHistoryQuery = query(
    collection(db, 'workspaceItemHistory'),
    where('workspaceId', '==', workspaceId),
    where('normalizedText', '>=', normalizedPrefix),
    where('normalizedText', '<', upperBound),
    orderBy('normalizedText'),
    limit(PER_QUERY_LIMIT),
  );

  const [personalSnapshot, workspaceSnapshot] = await Promise.all([
    getDocs(userHistoryQuery),
    getDocs(workspaceHistoryQuery),
  ]);

  const personal = personalSnapshot.docs.map((docSnap) => docSnap.data() as HistoryLike);
  const shared = workspaceSnapshot.docs.map((docSnap) => docSnap.data() as HistoryLike);

  return mergeAndRankSuggestions(personal, shared, max);
}

function mergeAndRankSuggestions(
  personal: HistoryLike[],
  shared: HistoryLike[],
  max: number,
): Suggestion[] {
  const byNormalizedText = new Map<string, Suggestion>();

  for (const entry of personal) {
    byNormalizedText.set(entry.normalizedText, {
      text: entry.text,
      normalizedText: entry.normalizedText,
      useCount: entry.useCount,
      lastUsedAt: entry.lastUsedAt,
      source: 'personal',
    });
  }

  for (const entry of shared) {
    const existing = byNormalizedText.get(entry.normalizedText);
    if (existing) {
      byNormalizedText.set(entry.normalizedText, {
        text: existing.text,
        normalizedText: existing.normalizedText,
        useCount: existing.useCount + entry.useCount,
        lastUsedAt:
          existing.lastUsedAt.toMillis() >= entry.lastUsedAt.toMillis()
            ? existing.lastUsedAt
            : entry.lastUsedAt,
        source: 'both',
      });
    } else {
      byNormalizedText.set(entry.normalizedText, {
        text: entry.text,
        normalizedText: entry.normalizedText,
        useCount: entry.useCount,
        lastUsedAt: entry.lastUsedAt,
        source: 'workspace',
      });
    }
  }

  return Array.from(byNormalizedText.values())
    .sort((a, b) => {
      if (b.useCount !== a.useCount) {
        return b.useCount - a.useCount;
      }
      return b.lastUsedAt.toMillis() - a.lastUsedAt.toMillis();
    })
    .slice(0, max);
}
