/**
 * Cloud Storage side of item photos: putting a compressed image in the bucket
 * and taking one back out again.
 *
 * Objects live at `workspaces/{workspaceId}/items/{itemId}/{nanoid}.{ext}`.
 * The workspace prefix is what `storage.rules` matches on; the random
 * filename (rather than a fixed `photo.webp`) means replacing a photo writes
 * a *new* object, so no viewer is ever left staring at a cached copy of the
 * one it replaced.
 *
 * Deletion is deliberately not paired with archiving. Nothing in this app is
 * hard-deleted — "Clear checked" and "Delete list" both archive — so an
 * archived item still points at a live object, and the only things that
 * orphan one are replacing a photo or removing it outright.
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { nanoid } from 'nanoid';
import { storage } from './config';
import type { CompressedImage } from '../lib/image';
import type { ItemImage } from '../types/models';

/**
 * Uploads an already-compressed image and returns the descriptor to store on
 * the item doc. Callers compress first (`compressImage`) — this never uploads
 * a raw camera file.
 */
export async function uploadItemImage(
  workspaceId: string,
  itemId: string,
  image: CompressedImage,
): Promise<ItemImage> {
  const path = `workspaces/${workspaceId}/items/${itemId}/${nanoid(12)}.${image.extension}`;
  const objectRef = ref(storage, path);

  await uploadBytes(objectRef, image.blob, {
    contentType: image.blob.type,
    // The filename is random and its bytes never change, so this object can
    // be cached for as long as the browser likes.
    cacheControl: 'public, max-age=31536000, immutable',
  });

  return {
    path,
    url: await getDownloadURL(objectRef),
    width: image.width,
    height: image.height,
  };
}

/**
 * Deletes a stored object by path. An already-missing object is treated as
 * success: callers only ever reach here to clean up something the item doc
 * has already stopped pointing at, and a second attempt (a retry, or two
 * members removing the same photo at once) shouldn't surface an error.
 */
export async function deleteItemImage(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    if ((error as { code?: string }).code !== 'storage/object-not-found') throw error;
  }
}
