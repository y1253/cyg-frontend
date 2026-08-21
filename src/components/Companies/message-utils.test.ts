import { describe, it, expect } from 'vitest';
import {
  displayName,
  extractEmail,
  mergeAttachments,
  parseAddressList,
  recipientSummary,
} from './message-utils';

describe('parseAddressList', () => {
  it('keeps a quoted comma inside one recipient', () => {
    const r = parseAddressList('"Doe, Jane" <j@x.com>, bob@y.com');
    expect(r).toEqual([
      { name: 'Doe, Jane', email: 'j@x.com' },
      { name: 'bob@y.com', email: 'bob@y.com' },
    ]);
  });

  it('handles plain lists, empty and undefined', () => {
    expect(parseAddressList('Ann Lee <a@x.com>, Bo <b@x.com>')).toEqual([
      { name: 'Ann Lee', email: 'a@x.com' },
      { name: 'Bo', email: 'b@x.com' },
    ]);
    expect(parseAddressList('')).toEqual([]);
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList('  ,  ')).toEqual([]);
  });
});

describe('recipientSummary', () => {
  const to = [
    { name: 'me@co.com', email: 'me@co.com' },
    { name: 'David Levy', email: 'david@acme.com' },
  ];
  const cc = [
    { name: 'Rachel Stern', email: 'rachel@acme.com' },
    { name: 'Moshe Katz', email: 'moshe@acme.com' },
  ];

  it('puts me first, first-names the rest and counts cc in the overflow', () => {
    expect(recipientSummary(to, cc, 'me@co.com')).toBe('to me, David, +2');
  });

  it('handles no self, no cc and no recipients', () => {
    expect(recipientSummary(to, [], undefined)).toBe('to me@co.com, David');
    expect(recipientSummary([], [], 'me@co.com')).toBe('to —');
  });

  it('names self once when copied on both To and Cc', () => {
    const self = { name: 'Me', email: 'me@co.com' };
    expect(recipientSummary([self], [self], 'me@co.com')).toBe('to me');
  });
});

describe('displayName / extractEmail', () => {
  it('falls back to the address when there is no display name', () => {
    expect(displayName('<a@b.com>')).toBe('a@b.com');
    expect(displayName('a@b.com')).toBe('a@b.com');
    expect(displayName('"Jane" <j@x.com>')).toBe('Jane');
    expect(extractEmail('Jane <j@x.com>')).toBe('j@x.com');
    expect(extractEmail('j@x.com')).toBe('j@x.com');
  });
});

describe('mergeAttachments', () => {
  const f = (name: string, size = 10) =>
    new File([new Uint8Array(size)], name, { type: 'application/pdf' });

  // Outbound email has no count cap; the composers call it with no `max`.
  it('keeps every file when no cap is given', () => {
    const incoming = Array.from({ length: 40 }, (_, i) => f(`doc-${i}.pdf`));
    const { files, notice } = mergeAttachments([], incoming);
    expect(files).toHaveLength(40);
    expect(notice).toBeNull();
  });

  // Internal messages still pass one, because their files live on our disk.
  it('still truncates and explains when a cap is given', () => {
    const incoming = Array.from({ length: 12 }, (_, i) => f(`doc-${i}.pdf`));
    const { files, notice } = mergeAttachments([], incoming, 10);
    expect(files).toHaveLength(10);
    expect(notice).toContain('only 10 files can be attached');
  });

  it('de-dupes on name and size whether capped or not', () => {
    const existing = [f('a.pdf')];
    const { files, notice } = mergeAttachments(existing, [f('a.pdf'), f('b.pdf')]);
    expect(files.map((x) => x.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(notice).toContain('already attached');
  });

  it('rejects a file over the per-file ceiling even with no count cap', () => {
    const { files, notice } = mergeAttachments([], [f('huge.pdf', 100)], undefined, 50);
    expect(files).toHaveLength(0);
    expect(notice).toContain('limit');
  });
});
