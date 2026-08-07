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

export interface ComposerPos {
  x: number;
  y: number;
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
): ComposerPos {
  const width = Math.min(minimized ? COMPOSER_MIN_WIDTH : COMPOSER_WIDTH, viewportWidth);
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(viewportWidth - width, 0)),
    y: Math.min(Math.max(pos.y, 0), Math.max(viewportHeight - COMPOSER_HEADER, 0)),
  };
}
