import { describe, expect, it } from 'vitest';
import {
  MAX_POLISH_CONTEXT_CHARS,
  SMS_SEGMENT_CHARS,
  WHATSAPP_CAPTION_CHARS,
  smsBudget,
  threadPolishContext,
  whatsappBudget,
} from './polish-budget';

describe('smsBudget', () => {
  it('is one segment, and soft', () => {
    // Over-length on SMS is legal and merely dearer, so Accept must stay available —
    // `hard` is what PolishPanel keys the blocked-Accept path on.
    const b = smsBudget(true);
    expect(b.maxChars).toBe(SMS_SEGMENT_CHARS);
    expect(b.maxChars).toBe(160);
    expect(b.hard).toBe(false);
  });

  it('carries the toggle state through, which is what decides if a limit is SENT', () => {
    expect(smsBudget(true).enabled).toBe(true);
    expect(smsBudget(false).enabled).toBe(false);
  });
});

describe('whatsappBudget', () => {
  it('is the caption cap, and HARD — Meta refuses a longer one', () => {
    const b = whatsappBudget(true, true);
    expect(b?.maxChars).toBe(WHATSAPP_CAPTION_CHARS);
    expect(b?.hard).toBe(true);
  });

  it('is absent with no attachment, so no toggle is offered', () => {
    // The plain-message cap is 4096 — a polished reply never approaches it, so a toggle
    // there would be a control that can never change anything.
    expect(whatsappBudget(true, false)).toBeUndefined();
  });
});

describe('threadPolishContext', () => {
  const line = (text: string, isOwn = false, from = 'Dana') => ({
    isOwn,
    from,
    text,
  });

  it('labels our own messages "You" and names the other party', () => {
    expect(
      threadPolishContext([line('hello'), line('hi there', true)], 'none'),
    ).toBe('Dana: hello\nYou: hi there');
  });

  it('falls back when the thread is empty — context is required server-side', () => {
    expect(threadPolishContext([], 'A text message conversation.')).toBe(
      'A text message conversation.',
    );
    expect(threadPolishContext([line('   ')], 'fallback')).toBe('fallback');
  });

  it('skips empty rows rather than emitting a dangling name', () => {
    // A bare attachment has no text; "Dana:" on its own tells the model nothing.
    expect(threadPolishContext([line(''), line('real')], 'none')).toBe(
      'Dana: real',
    );
  });

  it('⚠️ trims the OLDEST messages, keeping the newest', () => {
    // The tone a reply must match is set by the last few messages. Trimming the tail
    // would drop exactly the part that matters.
    const lines = [
      line('x'.repeat(200), false, 'Old'),
      line('y'.repeat(200), false, 'Mid'),
      line('the latest thing', false, 'New'),
    ];
    const out = threadPolishContext(lines, 'none', 250);
    expect(out).toContain('the latest thing');
    expect(out).not.toContain('Old:');
  });

  it('stays under the server cap so a long thread is never rejected outright', () => {
    const lines = Array.from({ length: 500 }, (_, i) =>
      line(`message number ${i} `.repeat(20)),
    );
    const out = threadPolishContext(lines, 'none');
    expect(out.length).toBeLessThanOrEqual(MAX_POLISH_CONTEXT_CHARS);
    // 16000 is the server's @MaxLength; this must leave room rather than sit on it.
    expect(MAX_POLISH_CONTEXT_CHARS).toBeLessThan(16000);
  });

  it('keeps a single over-long message from producing an empty context', () => {
    // It cannot fit, so nothing renders — and the fallback is what stops the request
    // failing @IsNotEmpty() validation.
    expect(threadPolishContext([line('z'.repeat(999))], 'fallback', 100)).toBe(
      'fallback',
    );
  });
});
