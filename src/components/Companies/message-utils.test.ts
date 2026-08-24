import { describe, it, expect } from 'vitest';
import {
  displayName,
  joinPolishedBody,
  SIGNATURE_LEAD,
  splitSignature,
  textToHtml,
  extractEmail,
  mergeAttachments,
  parseAddressList,
  recipientSummary,
  replyAllRecipients,
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

  // No caller passes a cap any more (internal messages matched email), but the
  // parameter stays supported — keep it honest.
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

const ME = 'me@cyg.com';

describe('replyAllRecipients', () => {
  it('answers the sender and copies everyone else', () => {
    const r = replyAllRecipients(
      'Alice <alice@x.com>',
      'me@cyg.com, Bob <bob@x.com>',
      'Carol <carol@x.com>',
      ME,
    );
    expect(r.to).toEqual(['alice@x.com']);
    expect(r.cc).toEqual(['bob@x.com', 'carol@x.com']);
  });

  it('never addresses the reply back at the account itself', () => {
    const r = replyAllRecipients('Alice <alice@x.com>', 'me@cyg.com', '', ME);
    expect(r.to).toEqual(['alice@x.com']);
    expect(r.cc).toEqual([]);
  });

  it('is case-insensitive about the account address', () => {
    const r = replyAllRecipients('Alice <alice@x.com>', 'ME@CYG.com', '', ME);
    expect(r.cc).toEqual([]);
  });

  // The reason this helper exists instead of `detail.to.split(',')`: a display
  // name may legitimately contain a comma.
  it('does not split inside a quoted display name', () => {
    const r = replyAllRecipients(
      'Alice <alice@x.com>',
      '"Doe, Jane" <jane@x.com>, bob@x.com',
      undefined,
      ME,
    );
    expect(r.cc).toEqual(['jane@x.com', 'bob@x.com']);
  });

  it('replies to the original recipients for a message the account sent', () => {
    const r = replyAllRecipients(
      'Me <me@cyg.com>',
      'Alice <alice@x.com>, Bob <bob@x.com>',
      'carol@x.com',
      ME,
    );
    expect(r.to).toEqual(['alice@x.com', 'bob@x.com']);
    expect(r.cc).toEqual(['carol@x.com']);
  });

  it('de-dupes across To and Cc, keeping the address in To only', () => {
    const r = replyAllRecipients(
      'Alice <alice@x.com>',
      'Bob <bob@x.com>',
      'ALICE@x.com, bob@x.com',
      ME,
    );
    expect(r.to).toEqual(['alice@x.com']);
    expect(r.cc).toEqual(['bob@x.com']);
  });

  it('tolerates a missing cc header', () => {
    expect(replyAllRecipients('a@x.com', 'b@x.com', null, ME).cc).toEqual(['b@x.com']);
    expect(replyAllRecipients('a@x.com', '', undefined, ME).cc).toEqual([]);
  });

  it('keeps everyone when the account address is unknown', () => {
    const r = replyAllRecipients('Alice <alice@x.com>', 'me@cyg.com', '', undefined);
    expect(r.cc).toEqual(['me@cyg.com']);
  });
});

describe('joinPolishedBody', () => {
  const SIG = '<div data-cyg-signature="1">Jane Doe</div>';

  it('restores the four-blank-line gap the composer seeded above the signature', () => {
    const out = joinPolishedBody('Hello there', SIG);
    expect(out).toBe(`Hello there${SIGNATURE_LEAD}${SIG}`);
    expect(out).toContain(SIGNATURE_LEAD);
  });

  it('adds no trailing blank lines when there is no signature or quote', () => {
    expect(joinPolishedBody('Hello there', '')).toBe(textToHtml('Hello there'));
  });

  it('is idempotent across repeated accepts', () => {
    const first = joinPolishedBody('draft one', SIG);
    const second = joinPolishedBody('draft two', splitSignature(first).sig);
    expect(splitSignature(second).body).toBe(`draft two${SIGNATURE_LEAD}`);
    expect(second).toBe(`draft two${SIGNATURE_LEAD}${SIG}`);
  });

  it('keeps a forward quote below the polished note', () => {
    const quote = '<div data-cyg-forward="1">original</div>';
    expect(joinPolishedBody('see below', quote)).toBe(
      `see below${SIGNATURE_LEAD}${quote}`,
    );
  });
});
