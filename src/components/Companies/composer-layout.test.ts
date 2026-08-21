import { describe, expect, it } from 'vitest';
import {
  clampPos,
  clampSize,
  composerWidth,
  COMPOSER_EDGE,
  COMPOSER_MIN_WIDTH,
  COMPOSER_RESIZE_MIN_BODY,
  COMPOSER_RESIZE_MIN_WIDTH,
  COMPOSER_WIDTH,
} from './composer-layout';

const VW = 1440;
const VH = 900;

describe('composerWidth', () => {
  it('is the default when the window has never been resized', () => {
    expect(composerWidth(false, null)).toBe(COMPOSER_WIDTH);
  });

  it('is the hand-set width once it has', () => {
    expect(composerWidth(false, { w: 720, h: 400 })).toBe(720);
  });

  it('is the collapsed strip when minimized, whatever the size', () => {
    // The size is remembered for when it expands again, not applied now.
    expect(composerWidth(true, { w: 720, h: 400 })).toBe(COMPOSER_MIN_WIDTH);
    expect(composerWidth(true, null)).toBe(COMPOSER_MIN_WIDTH);
  });
});

describe('clampSize', () => {
  it('leaves a sensible size alone', () => {
    expect(clampSize({ w: 700, h: 480 }, VW, VH)).toEqual({ w: 700, h: 480 });
  });

  it('holds the floor so the toolbar and editor stay usable', () => {
    expect(clampSize({ w: 10, h: 10 }, VW, VH)).toEqual({
      w: COMPOSER_RESIZE_MIN_WIDTH,
      h: COMPOSER_RESIZE_MIN_BODY,
    });
  });

  it('keeps the window inside the viewport', () => {
    const { w, h } = clampSize({ w: 99_999, h: 99_999 }, VW, VH);
    expect(w).toBe(VW - COMPOSER_EDGE * 2);
    expect(h).toBeLessThan(VH);
  });

  it('never inverts on a viewport smaller than the floor', () => {
    // A phone in landscape is narrower than the minimum width; the floor has to
    // win, otherwise max < min and the window collapses to nothing.
    const { w, h } = clampSize({ w: 500, h: 400 }, 280, 180);
    expect(w).toBe(COMPOSER_RESIZE_MIN_WIDTH);
    expect(h).toBe(COMPOSER_RESIZE_MIN_BODY);
  });
});

describe('clampPos with a resized window', () => {
  it('clamps a widened window against its real width, not the default', () => {
    // Dragged far right. A 900-wide window must stop 900 from the right edge —
    // clamping against the default 480 would leave 420px hanging off-screen.
    const pos = clampPos({ x: 5_000, y: 100 }, false, VW, VH, { w: 900, h: 400 });
    expect(pos.x).toBe(VW - 900);
  });

  it('still uses the default width when unsized', () => {
    expect(clampPos({ x: 5_000, y: 100 }, false, VW, VH).x).toBe(
      VW - COMPOSER_WIDTH,
    );
  });

  it('uses the collapsed width when minimized despite a size', () => {
    expect(
      clampPos({ x: 5_000, y: 100 }, true, VW, VH, { w: 900, h: 400 }).x,
    ).toBe(VW - COMPOSER_MIN_WIDTH);
  });

  it('never returns a negative origin', () => {
    const pos = clampPos({ x: -50, y: -50 }, false, VW, VH, { w: 900, h: 400 });
    expect(pos).toEqual({ x: 0, y: 0 });
  });
});
