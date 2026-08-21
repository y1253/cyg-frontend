import { describe, expect, it } from 'vitest';
import { extractFiles, hasFiles } from './useFileDrop';

/** A stand-in for DataTransfer — only the two fields the helpers read. */
function transfer(types: string[], files: File[] = []): DataTransfer {
  return { types, files } as unknown as DataTransfer;
}

const file = (name: string) => new File(['x'], name, { type: 'text/plain' });

describe('hasFiles', () => {
  it('is true for a real file drag', () => {
    expect(hasFiles(transfer(['Files'], [file('a.pdf')]))).toBe(true);
  });

  // The case that would otherwise flash the drop overlay — and, worse, attach
  // nothing while swallowing the browser's own drop behaviour.
  it('is false when dragging selected text', () => {
    expect(hasFiles(transfer(['text/plain']))).toBe(false);
  });

  it('is false when dragging a hyperlink', () => {
    expect(hasFiles(transfer(['text/uri-list', 'text/plain']))).toBe(false);
  });

  it('is false for a missing or empty transfer', () => {
    expect(hasFiles(null)).toBe(false);
    expect(hasFiles(undefined)).toBe(false);
    expect(hasFiles(transfer([]))).toBe(false);
  });

  it('copes with a DOMStringList-ish types that has no includes()', () => {
    // Older engines hand back a DOMStringList, which is array-like but not an
    // Array — hence the Array.from in the implementation.
    const list = { 0: 'Files', length: 1 } as unknown as string[];
    expect(hasFiles(transfer(list))).toBe(true);
  });
});

describe('extractFiles', () => {
  it('returns every file on the transfer', () => {
    const files = extractFiles(transfer(['Files'], [file('a.pdf'), file('b.png')]));
    expect(files.map((f) => f.name)).toEqual(['a.pdf', 'b.png']);
  });

  it('returns nothing for a text-only clipboard, so paste is left alone', () => {
    expect(extractFiles(transfer(['text/plain']))).toEqual([]);
  });

  it('returns nothing when there is no transfer at all', () => {
    expect(extractFiles(null)).toEqual([]);
    expect(extractFiles(undefined)).toEqual([]);
  });
});
