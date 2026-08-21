/**
 * Geometry shared by the composer stack and the individual windows.
 *
 * `ComposerStack` fans the parked windows out along the bottom-right and re-flows
 * them on resize; `DockedComposer` positions itself from the same numbers and clamps
 * a dragged window against them. They have to agree, so the constants live here
 * rather than being spelled twice.
 */

/** Matches `w-[30rem]` / `w-[17rem]` on the window. */
export const COMPOSER_WIDTH = 480;
export const COMPOSER_MIN_WIDTH = 272;
export const COMPOSER_GAP = 12;
/** Matches the old `sm:right-6`. */
export const COMPOSER_EDGE = 24;
/** The title bar. A dragged window is clamped so at least this much stays on
 *  screen — otherwise it could be dropped somewhere it can never be grabbed again. */
export const COMPOSER_HEADER = 44;
/** Matches the `9rem` in the body's `h-[min(32rem,calc(100vh-9rem))]` cap. */
export const COMPOSER_CHROME = 144;

/** Floors for a hand-resized window: below these the toolbar wraps to nothing
 *  useful and the editor can't show a line of text. */
export const COMPOSER_RESIZE_MIN_WIDTH = 320;
export const COMPOSER_RESIZE_MIN_BODY = 200;

export interface ComposerPos {
  x: number;
  y: number;
}

/** A hand-resized window. `h` is the height of the *body* — the region below the
 *  title bar — because that is what the layout actually controls; the title bar
 *  is a fixed height that rides on top of it. */
export interface ComposerSize {
  w: number;
  h: number;
}

/**
 * The width a window is actually occupying.
 *
 * Minimized wins over a custom size: the collapsed window is a fixed strip, and a
 * size the user set while it was expanded is remembered, not applied.
 */
export function composerWidth(
  minimized: boolean,
  size: ComposerSize | null,
): number {
  if (minimized) return COMPOSER_MIN_WIDTH;
  return size?.w ?? COMPOSER_WIDTH;
}

/** Keep a custom size inside the viewport — also applied on window resize, so a
 *  window sized on a big screen doesn't overhang a small one. */
export function clampSize(
  size: ComposerSize,
  viewportWidth: number,
  viewportHeight: number,
): ComposerSize {
  const maxW = Math.max(COMPOSER_RESIZE_MIN_WIDTH, viewportWidth - COMPOSER_EDGE * 2);
  const maxH = Math.max(COMPOSER_RESIZE_MIN_BODY, viewportHeight - COMPOSER_CHROME);
  return {
    w: Math.min(Math.max(size.w, COMPOSER_RESIZE_MIN_WIDTH), maxW),
    h: Math.min(Math.max(size.h, COMPOSER_RESIZE_MIN_BODY), maxH),
  };
}

/** How many expanded windows fit along the bottom edge. Never fewer than one, so a
 *  phone still shows the window the user just opened. */
export function maxExpanded(viewportWidth: number): number {
  return Math.max(
    1,
    Math.floor((viewportWidth - COMPOSER_EDGE) / (COMPOSER_WIDTH + COMPOSER_GAP)),
  );
}

/** Distance from the right edge for the nth parked window. */
export function slotRight(slot: number): number {
  return COMPOSER_EDGE + slot * (COMPOSER_WIDTH + COMPOSER_GAP);
}

export function clampPos(
  pos: ComposerPos,
  minimized: boolean,
  viewportWidth: number,
  viewportHeight: number,
  /** The window's own size once the user has resized it — otherwise a widened
   *  window is clamped against the default 480 and can be dragged off-screen. */
  size: ComposerSize | null = null,
): ComposerPos {
  const width = Math.min(composerWidth(minimized, size), viewportWidth);
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(viewportWidth - width, 0)),
    y: Math.min(Math.max(pos.y, 0), Math.max(viewportHeight - COMPOSER_HEADER, 0)),
  };
}
