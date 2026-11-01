import { describe, expect, it } from 'vitest';
import { picturePoint } from './picture-point';

describe('picturePoint', () => {
  const natural = { width: 1280, height: 900 };

  it('maps a click on a box the picture fills exactly', () => {
    expect(picturePoint({ x: 640, y: 450 }, { width: 1280, height: 900 }, natural)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it('skips the bars of a letterboxed picture', () => {
    // A wide box: the picture is 640x450 in the middle, 180px bars on each side.
    const box = { width: 1000, height: 450 };
    expect(picturePoint({ x: 100, y: 200 }, box, natural)).toBeNull();
    expect(picturePoint({ x: 180, y: 0 }, box, natural)).toEqual({ x: 0, y: 0 });
    expect(picturePoint({ x: 820, y: 450 }, box, natural)).toEqual({ x: 1, y: 1 });
  });

  it('is null before the first picture', () => {
    expect(picturePoint({ x: 1, y: 1 }, { width: 10, height: 10 }, { width: 0, height: 0 })).toBeNull();
  });
});
