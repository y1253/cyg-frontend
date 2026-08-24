import { describe, it, expect } from 'vitest';
import { messagePreview, truncate } from './notificationText';

describe('truncate', () => {
  it('leaves a short string alone, with no misleading ellipsis', () => {
    expect(truncate('Short and sweet', 40)).toBe('Short and sweet');
  });

  it('collapses whitespace so a wrapped body reads as one line', () => {
    expect(truncate('one\n\ntwo   three', 40)).toBe('one two three');
  });

  it('cuts on a word boundary and adds an ellipsis', () => {
    const out = truncate('the quick brown fox jumps over the lazy dog', 20);
    expect(out).toBe('the quick brown fox…');
    expect(out.length).toBeLessThanOrEqual(21);
  });

  it('hard-cuts a single long token rather than losing most of the budget', () => {
    const out = truncate('see https://example.com/a/very/long/path/indeed', 20);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);
    // The word boundary at index 3 would have thrown away most of the budget, so
    // the cut ignores it rather than rendering a useless "see…".
    expect(out).toBe('see https://example…');
  });

  it('drops trailing punctuation before the ellipsis', () => {
    expect(truncate('hello there, everybody in the room', 14)).toBe('hello there…');
  });
});

describe('messagePreview', () => {
  it('formats sender, subject and snippet', () => {
    expect(
      messagePreview({
        from: 'Jane Doe',
        subject: 'Invoice question',
        snippet: 'Hi, just checking on the August invoice',
      }),
    ).toBe('Jane Doe: Invoice question — Hi, just checking on the August invoice');
  });

  it('omits the subject for a chat message, leaving no stray separator', () => {
    expect(
      messagePreview({ from: 'Jane Doe', subject: '', snippet: 'are you around?' }),
    ).toBe('Jane Doe — are you around?');
  });

  it('says (no subject) only when there is nothing else to show', () => {
    expect(messagePreview({ from: 'Jane Doe', subject: '', snippet: '' })).toBe(
      'Jane Doe: (no subject)',
    );
  });

  it('works with no sender at all', () => {
    expect(messagePreview({ subject: 'Payroll', snippet: 'see attached' })).toBe(
      'Payroll — see attached',
    );
  });

  it('truncates the whole line, not just the snippet', () => {
    const out = messagePreview(
      { from: 'Jane Doe', subject: 'Invoice', snippet: 'x'.repeat(300) },
      50,
    );
    expect(out.length).toBe(51);
    expect(out.endsWith('…')).toBe(true);
  });
});
