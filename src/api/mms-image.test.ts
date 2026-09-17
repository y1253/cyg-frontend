import { describe, expect, it } from 'vitest';
import { isMmsImageFile } from './phone';

/**
 * Mirrors `isMmsImage` in server `phone/mms-shrink.util.ts`, which is what actually
 * refuses the upload. This copy rejects a dropped or pasted file in the composer instead
 * of sending 25 MB to earn a 400 — and if the two ever disagree, the browser is wrong.
 */
const file = (name: string, type: string): File =>
  new File([new Uint8Array([1])], name, { type });

describe('isMmsImageFile', () => {
  it('accepts the four types a carrier renders', () => {
    expect(isMmsImageFile(file('shot.png', 'image/png'))).toBe(true);
    expect(isMmsImageFile(file('photo.jpg', 'image/jpeg'))).toBe(true);
    expect(isMmsImageFile(file('photo.jpeg', 'image/jpeg'))).toBe(true);
    expect(isMmsImageFile(file('funny.gif', 'image/gif'))).toBe(true);
    expect(isMmsImageFile(file('pic.webp', 'image/webp'))).toBe(true);
  });

  /** HEIC is the iPhone default and would fail inside sharp with a misleading message. */
  it('refuses image types a carrier will not render', () => {
    expect(isMmsImageFile(file('IMG_0001.heic', 'image/heic'))).toBe(false);
    expect(isMmsImageFile(file('logo.svg', 'image/svg+xml'))).toBe(false);
    expect(isMmsImageFile(file('old.bmp', 'image/bmp'))).toBe(false);
  });

  it('refuses audio, video and documents — a text carries pictures only', () => {
    expect(isMmsImageFile(file('song.mp3', 'audio/mpeg'))).toBe(false);
    expect(isMmsImageFile(file('clip.mp4', 'video/mp4'))).toBe(false);
    expect(isMmsImageFile(file('invoice.pdf', 'application/pdf'))).toBe(false);
  });

  it('refuses a name that contradicts the declared type', () => {
    expect(isMmsImageFile(file('payload.exe', 'image/png'))).toBe(false);
    expect(isMmsImageFile(file('photo.jpg', 'image/png'))).toBe(false);
  });

  /** A pasted screenshot often has no extension, and sometimes no type either. */
  it('handles a pasted screenshot with no extension, and a drag with no type', () => {
    expect(isMmsImageFile(file('image', 'image/png'))).toBe(true);
    expect(isMmsImageFile(file('screenshot.png', ''))).toBe(true);
    expect(isMmsImageFile(file('notes.txt', ''))).toBe(false);
  });
});
