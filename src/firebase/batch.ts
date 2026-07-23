/**
 * Chunked batched writes.
 *
 * Firestore caps a `writeBatch` at 500 operations. Every bulk write in this
 * app (archiving a column, normalizing orders, backfilling `listId`) is
 * unbounded in principle, so they all go through here rather than each
 * re-deriving the same chunking.
 */
import { writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from './config';

/** Kept under Firestore's hard limit of 500 with room to spare. */
const MAX_BATCH_SIZE = 400;

/**
 * Applies `write` to every entry, committing in chunks of at most 400.
 * Chunks commit sequentially, so a later failure leaves earlier chunks
 * applied — fine for the idempotent, retry-safe writes this is used for.
 */
export async function commitInChunks<T>(
  entries: readonly T[],
  write: (batch: WriteBatch, entry: T) => void,
): Promise<void> {
  for (let start = 0; start < entries.length; start += MAX_BATCH_SIZE) {
    const chunk = entries.slice(start, start + MAX_BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((entry) => write(batch, entry));
    await batch.commit();
  }
}
