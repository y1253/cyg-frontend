import { describe, expect, it } from 'vitest';
import {
  MMS_CLIENT_RUNG,
  jpegName,
  shouldShrink,
  targetSize,
} from './image-shrink';

/**
 * The geometry and the exclusions are where the mistakes live; the encoder calls around
 * them need a real canvas and are left untested — the same split `mms-shrink.util.ts`
 * makes on the server, for the same stated reason.
 */
describe('targetSize', () => {
  it('fits the long edge to the rung, keeping the ratio', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('never enlarges a small picture', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('mirrors the server ladder first rung', () => {
    expect(MMS_CLIENT_RUNG.edge).toBe(1600);
    expect(MMS_CLIENT_RUNG.quality).toBe(0.8);
  });
});

describe('shouldShrink', () => {
  it('shrinks a large photo', () => {
    expect(shouldShrink({ type: 'image/jpeg', size: 5_000_000 })).toBe(true);
  });

  it('leaves an already-small picture alone', () => {
    expect(shouldShrink({ type: 'image/jpeg', size: 40_000 })).toBe(false);
  });

  /**
   * A canvas re-encode kills the animation unconditionally, while the server only stills
   * a GIF when it is genuinely over budget. Shrinking here would destroy a small
   * animated GIF for no benefit at all.
   */
  it('never touches a GIF, however large', () => {
    expect(shouldShrink({ type: 'image/gif', size: 9_000_000 })).toBe(false);
  });

  it('ignores anything that is not an image', () => {
    expect(shouldShrink({ type: 'application/pdf', size: 9_000_000 })).toBe(
      false,
    );
  });
});

describe('jpegName', () => {
  /**
   * The server corroborates the declared mime against the extension, so JPEG bytes under
   * a .png name are REFUSED with "a text message can only carry pictures" — confusing,
   * and untrue.
   */
  it('renames to .jpg, because the bytes are now JPEG', () => {
    expect(jpegName('receipt.png')).toBe('receipt.jpg');
    expect(jpegName('photo.jpeg')).toBe('photo.jpg');
    expect(jpegName('scan')).toBe('scan.jpg');
  });

  it('keeps a dotted stem intact', () => {
    expect(jpegName('invoice.2026.01.png')).toBe('invoice.2026.01.jpg');
  });
});
