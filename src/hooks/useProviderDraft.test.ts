import { describe, expect, it } from 'vitest';
import {
  fileSetKey,
  serialiseDraft,
  shouldWriteDraft,
  type DraftSnapshot,
} from './useProviderDraft';

/**
 * The two rules that decide whether an autosave is issued at all.
 *
 * They exist because this app's mailboxes are already close to Gmail's per-user rate
 * limit: a save on every timer tick, rather than every real change, would add a
 * write per composer per two seconds for as long as a window is open — including
 * while the user is only reading.
 */

const snap = (over: Partial<DraftSnapshot> = {}): DraftSnapshot => ({
  to: 'client@example.com',
  cc: '',
  bcc: '',
  subject: 'Invoice',
  body: 'hello',
  bodyHtml: '<p>hello</p>',
  ...over,
});

describe('serialiseDraft', () => {
  it('is stable for an unchanged snapshot', () => {
    expect(serialiseDraft(snap())).toBe(serialiseDraft(snap()));
  });

  it.each([
    ['recipient', { to: 'someone@else.com' }],
    ['cc', { cc: 'boss@example.com' }],
    ['bcc', { bcc: 'boss@example.com' }],
    ['subject', { subject: 'Invoice (revised)' }],
    ['body', { bodyHtml: '<p>hello there</p>' }],
  ] as [string, Partial<DraftSnapshot>][])(
    'changes when the %s changes',
    (_label, over) => {
      expect(serialiseDraft(snap(over))).not.toBe(serialiseDraft(snap()));
    },
  );

  /**
   * `body` is `bodyHtml` run through htmlToText, so it cannot differ on its own. If
   * it ever could, the key would have to include it — but today including it would
   * only make every comparison longer.
   */
  it('ignores the plain-text mirror of the body', () => {
    expect(serialiseDraft(snap({ body: 'anything at all' }))).toBe(
      serialiseDraft(snap()),
    );
  });
});

describe('shouldWriteDraft', () => {
  const key = serialiseDraft(snap());

  // The rule that keeps a read-only pause free.
  it('does not rewrite an unchanged draft', () => {
    expect(
      shouldWriteDraft({ key, savedKey: key, hasDraft: true, dirty: true }),
    ).toBe(false);
  });

  it('writes once the text has actually changed', () => {
    expect(
      shouldWriteDraft({
        key,
        savedKey: serialiseDraft(snap({ subject: 'old' })),
        hasDraft: true,
        dirty: true,
      }),
    ).toBe(true);
  });

  // Opening Compose and closing it again must leave nothing behind.
  it('creates nothing for an untouched composer', () => {
    expect(
      shouldWriteDraft({ key, savedKey: null, hasDraft: false, dirty: false }),
    ).toBe(false);
  });

  it('creates a draft as soon as there is something to save', () => {
    expect(
      shouldWriteDraft({ key, savedKey: null, hasDraft: false, dirty: true }),
    ).toBe(true);
  });

  /**
   * The asymmetry that matters: once a draft EXISTS, emptying the composer is a real
   * edit. Treating "not dirty" as "nothing to do" here would leave the old text
   * sitting in the user's mailbox after they deliberately cleared it.
   */
  it('saves an existing draft that has been emptied', () => {
    expect(
      shouldWriteDraft({
        key: serialiseDraft(
          snap({ to: '', subject: '', body: '', bodyHtml: '' }),
        ),
        savedKey: key,
        hasDraft: true,
        dirty: false,
      }),
    ).toBe(true);
  });
});

describe('fileSetKey', () => {
  const f = (name: string, size: number) =>
    new File([new Uint8Array(size)], name, { type: 'text/plain' });

  it('is stable for the same files', () => {
    expect(fileSetKey([f('a.pdf', 10), f('b.pdf', 20)])).toBe(
      fileSetKey([f('a.pdf', 10), f('b.pdf', 20)]),
    );
  });

  it('changes when a file is added', () => {
    expect(fileSetKey([f('a.pdf', 10)])).not.toBe(
      fileSetKey([f('a.pdf', 10), f('b.pdf', 20)]),
    );
  });

  // Removing the last attachment is a real edit, and the only signal for it.
  it('changes when the last file is removed', () => {
    expect(fileSetKey([f('a.pdf', 10)])).not.toBe(fileSetKey([]));
  });

  // Same name, different content of a different length — a re-exported PDF, say.
  it('changes when a file is replaced by a different size', () => {
    expect(fileSetKey([f('a.pdf', 10)])).not.toBe(fileSetKey([f('a.pdf', 11)]));
  });

  /**
   * Order is part of the key. Two files never reorder on their own — `mergeAttachments`
   * appends — so this costs nothing, and treating order as significant is safer than
   * sorting and hiding a genuine change.
   */
  it('is order-sensitive', () => {
    expect(fileSetKey([f('a.pdf', 1), f('b.pdf', 2)])).not.toBe(
      fileSetKey([f('b.pdf', 2), f('a.pdf', 1)]),
    );
  });
});
