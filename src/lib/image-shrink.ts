/**
 * Shrinking a picture in the browser, before it is uploaded as a text message.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A FORMAT RULE ──────────────────────────
 * The report was "jpeg arrives late, so allow only png". Nothing in the code treats the
 * two differently: `fitForMms` passes ANY image through untouched when it is under the
 * per-file budget, and re-encodes to JPEG when it is over — so a PNG-only rule would not
 * change what the carrier receives, and a PNG photo is larger, so it would hit the
 * re-encode more often, not less.
 *
 * The actual cause is SIZE. A phone photo is 3-8 MB; all of it is uploaded, and only then
 * does the server walk its ladder re-encoding up to three times. Shrinking here turns
 * that into a ~300 KB upload and, usually, no server-side re-encode at all.
 *
 * ⚠️ THE SERVER REMAINS THE AUTHORITY. `fitForMms` still runs and still enforces the
 * budget. This only makes the upload small; it must never be treated as a replacement,
 * and `MMS_IMAGE_LADDER` must not be weakened because this exists.
 */

/**
 * A deliberate COPY of the server's first ladder rung (`MMS_IMAGE_LADDER[0]`), not a
 * shared constant.
 *
 * Mirroring the first rung exactly is what makes `source.length <= budget` true on the
 * server for a normal photo, so it passes the file through rather than re-encoding an
 * already-re-encoded JPEG — which is where visible generation loss would come from.
 *
 * Its own name because it is its own knob: this codebase has three separate scars from
 * sharing a tuned encoder constant across consumers (`MMS_AUDIO_ARGS`,
 * `WHATSAPP_VOICE_ARGS`, `TRANSCRIBE_MP3_ARGS`). If the server's ladder changes, change
 * this deliberately, in the same commit.
 */
export const MMS_CLIENT_RUNG = { edge: 1600, quality: 0.8 } as const;

/** Below this there is nothing worth re-encoding, and re-encoding could only add loss. */
export const SHRINK_FLOOR_BYTES = 600 * 1024;

/** Fit within a square of `maxEdge`, preserving aspect ratio, never enlarging. */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number = MMS_CLIENT_RUNG.edge,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Is this file worth shrinking?
 *
 * ⚠️ GIFs are skipped unconditionally. A canvas re-encode kills the animation every
 * time, whereas the server only stills a GIF when it is actually over budget — and that
 * trade-off ("a still frame that arrives beats an animation that does not") is one the
 * server makes knowingly and only when it must. Doing it here would still a small
 * animated GIF for no reason at all.
 */
export function shouldShrink(
  file: { type: string; size: number },
  floor: number = SHRINK_FLOOR_BYTES,
): boolean {
  const mime = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'image/gif') return false;
  if (!mime.startsWith('image/')) return false;
  return file.size > floor;
}

/**
 * The name the shrunk file must carry.
 *
 * ⚠️ THE trap in this whole feature. A canvas export is `image/jpeg`, and the server's
 * `isMmsImage` is CORROBORATION-based: it compares the declared mime against the
 * filename's extension and refuses a mismatch. Keep the original `photo.png` name on
 * JPEG bytes and the send fails with "A text message can only carry pictures", which is
 * both confusing and untrue.
 */
export function jpegName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return `${stem || 'photo'}.jpg`;
}

/**
 * Re-encode one image smaller. Returns the ORIGINAL whenever it cannot, which is always
 * safe: the server still shrinks whatever it must.
 *
 * ⚠️ `imageOrientation: 'from-image'` is load-bearing. The server applies EXIF rotation
 * only on its over-budget path, so an under-budget file keeps its EXIF and the handset
 * honours it — but a canvas re-encode DROPS EXIF, so without this an iPhone portrait
 * photo would arrive rotated 90°. Where `createImageBitmap` is unavailable, fall back to
 * NOT shrinking rather than to an unoriented shrink.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!shouldShrink(file)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    const { width, height } = targetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', MMS_CLIENT_RUNG.quality),
    );
    // A re-encode that came out BIGGER is a re-encode worth throwing away.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** Every picture on one text, shrunk. Order preserved; failures pass through. */
export async function shrinkForMms(files: File[]): Promise<File[]> {
  if (!files.length) return files;
  return Promise.all(files.map((f) => shrinkImage(f)));
}
