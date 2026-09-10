import { describe, expect, it } from 'vitest';
import type { SignatureImage } from '@/api/emailSignature';
import {
  NO_LOGO_ID,
  NO_LOGO_LABEL,
  logoLabel,
  logoOptions,
} from './signature-logo';

function image(over: Partial<SignatureImage> = {}): SignatureImage {
  return {
    id: 5,
    name: 'Cyg logo',
    filename: 'cyg.png',
    size: 1234,
    width: 200,
    height: 80,
    createdAt: '2026-01-01T00:00:00.000Z',
    url: 'https://example.test/api/signature-images/public/abc',
    companyId: null,
    ...over,
  };
}

describe('logoOptions', () => {
  it('always offers "No logo", even with an empty library', () => {
    // Without it, a company given a logo could never be put back to none.
    expect(logoOptions([])).toEqual({ [String(NO_LOGO_ID)]: NO_LOGO_LABEL });
    expect(logoOptions(undefined)).toEqual({
      [String(NO_LOGO_ID)]: NO_LOGO_LABEL,
    });
  });

  it('lists every image by id-as-string', () => {
    expect(logoOptions([image(), image({ id: 6, name: 'Acme logo' })])).toEqual({
      '0': NO_LOGO_LABEL,
      '5': 'Cyg logo',
      '6': 'Acme logo',
    });
  });

  it('does not distinguish firm-wide from scoped — both are offerable', () => {
    // The server decides what a company may SEE; by the time a logo is in this list it is
    // selectable. Scope only affects whether the tile offers a delete.
    const options = logoOptions([image({ id: 6, companyId: 7 })]);
    expect(options['6']).toBe('Cyg logo');
  });
});

describe('logoLabel', () => {
  it('names a logo that is present', () => {
    expect(logoLabel([image()], 5)).toBe('Cyg logo');
  });

  it('reports the none sentinel as "No logo"', () => {
    expect(logoLabel([image()], NO_LOGO_ID)).toBe(NO_LOGO_LABEL);
  });

  it('falls back to "Unavailable logo" for an id no longer in the list', () => {
    // A logo is SOFT-deleted while a settings row may still name it, so this is a real
    // reachable state. It must not read as "No logo", which would hide the problem.
    expect(logoLabel([image()], 99)).toBe('Unavailable logo');
    expect(logoLabel([], 5)).toBe('Unavailable logo');
    expect(logoLabel(undefined, 5)).toBe('Unavailable logo');
  });
});
