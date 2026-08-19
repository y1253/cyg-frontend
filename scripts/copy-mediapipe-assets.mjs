/**
 * Copy the MediaPipe WASM runtime out of node_modules into public/.
 *
 * The assets are served from our own origin rather than a CDN: face login is the
 * first screen of an installable app, and it should not be able to break because a
 * third-party CDN is blocked by an office firewall.
 *
 * This runs from `prebuild`/`predev` so the vendored copy can never drift from the
 * installed package version. A mismatch between the JS glue and the .wasm fails at
 * runtime with an opaque error, which is a miserable thing to debug.
 *
 * Only the SIMD build is copied (~11MB raw, ~2.4MB brotli over the wire). WASM SIMD
 * is available in every browser released since 2021; anything older simply 404s the
 * file, the detector fails to load, and the UI falls back to the manual capture
 * button -- the same behaviour the app had before auto-capture existed.
 */
import { mkdir, copyFile, access, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');

const FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

try {
  await access(src);
} catch {
  console.warn('[mediapipe] node_modules assets not found; skipping copy');
  process.exit(0);
}

await mkdir(dest, { recursive: true });

for (const file of FILES) {
  const from = join(src, file);
  const to = join(dest, file);
  let needsCopy = true;
  try {
    const [a, b] = await Promise.all([stat(from), stat(to)]);
    needsCopy = a.size !== b.size;
  } catch {
    // Destination missing -- copy it.
  }
  if (needsCopy) {
    await copyFile(from, to);
    console.log(`[mediapipe] copied ${file}`);
  }
}
