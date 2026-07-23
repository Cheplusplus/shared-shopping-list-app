/**
 * Client-side image compression for item photos.
 *
 * A phone camera produces 3–12 MB JPEGs; a shopping-list photo needs a tiny
 * fraction of that. Shrinking in the browser before upload is the only place
 * it *can* happen — there's no server in the upload path — and it pays off
 * three times over: the uploader's data bill, Storage cost, and every other
 * member's download when the row scrolls into view.
 *
 * The strategy is a short ladder of (max edge, quality) attempts tried in
 * order until one lands under `TARGET_BYTES`. Each attempt re-encodes from the
 * decoded original rather than recompressing the previous result, so quality
 * is only ever lost once.
 */

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Matches `blob.type` — the upload path needs a file extension. */
  extension: 'webp' | 'jpg';
}

/**
 * Roughly what a 1280px photo costs at good quality. Small enough that a row
 * with a photo loads as fast as one without on a phone connection.
 */
const TARGET_BYTES = 160 * 1024;

/** Beyond this, decoding risks running the tab out of memory on a phone. */
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;

/**
 * Tried in order, first result under `TARGET_BYTES` wins. Quality drops
 * before resolution does: a slightly soft 1280px photo of a shelf label reads
 * better than a crisp 800px one.
 */
const ATTEMPTS = [
  { maxEdge: 1280, quality: 0.8 },
  { maxEdge: 1280, quality: 0.62 },
  { maxEdge: 1024, quality: 0.55 },
  { maxEdge: 800, quality: 0.45 },
] as const;

/**
 * Decodes, downscales and re-encodes `file`. Throws with a message fit to
 * show the user if the file isn't a usable image.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file isn’t an image.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is too big to process — try a smaller one.');
  }

  const decoded = await decode(file);
  const webp = supportsWebp();
  const type = webp ? 'image/webp' : 'image/jpeg';
  const extension: CompressedImage['extension'] = webp ? 'webp' : 'jpg';
  let smallest: CompressedImage | null = null;

  try {
    for (const attempt of ATTEMPTS) {
      const canvas = drawScaled(decoded, attempt.maxEdge);
      const blob = await encode(canvas, type, attempt.quality);
      const candidate = { blob, width: canvas.width, height: canvas.height, extension };

      if (blob.size <= TARGET_BYTES) return candidate;
      if (!smallest || blob.size < smallest.blob.size) smallest = candidate;
    }
  } finally {
    decoded.release();
  }

  // Every attempt overshot — a big, noisy photo that just doesn't compress.
  // The smallest one is still an order of magnitude under the original, so
  // upload that rather than refusing a photo the user meant to attach.
  if (!smallest) throw new Error('That image couldn’t be compressed.');
  return smallest;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * `createImageBitmap` is the cheap path (decodes off the main thread), but its
 * `imageOrientation` option — without which a portrait phone photo uploads
 * sideways — is newer than the function itself, so a browser that rejects the
 * option falls back to an `<img>`, which applies EXIF orientation on its own.
 */
async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the element path.
    }
  }
  return decodeViaElement(file);
}

function decodeViaElement(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image couldn’t be read.'));
    };
    image.src = url;
  });
}

function drawScaled(image: DecodedImage, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser can’t process images.');
  }

  // Only ever downscaling, where the default sampling aliases visibly.
  context.imageSmoothingQuality = 'high';
  // JPEG has no alpha channel, so a transparent PNG would come out with black
  // where the transparency was unless something is painted underneath.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);

  return canvas;
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('That image couldn’t be compressed.'))),
      type,
      quality,
    );
  });
}

let webpSupport: boolean | null = null;

/**
 * WebP runs 25–35% smaller than JPEG at matching quality. `toBlob` silently
 * falls back to PNG for a type it can't encode — which would be *larger* than
 * the original — so this checks properly rather than assuming.
 */
function supportsWebp(): boolean {
  if (webpSupport === null) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupport;
}
