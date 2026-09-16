import { describe, expect, it } from 'vitest';
import {
  SMS_MAX_CHARS,
  buildSmsReplyBody,
  smsQuoteCost,
  smsReplyBudget,
} from './sms-reply';

describe('buildSmsReplyBody', () => {
  it('puts the quoted original above the reply', () => {
    expect(buildSmsReplyBody('can you send the invoice', 'Sure, sending now.')).toBe(
      'Replying to: "can you send the invoice"\n\nSure, sending now.',
    );
  });

  it('sends the reply alone when there is nothing to quote', () => {
    expect(buildSmsReplyBody(null, 'Hello')).toBe('Hello');
    expect(buildSmsReplyBody('', 'Hello')).toBe('Hello');
    expect(buildSmsReplyBody('   ', 'Hello')).toBe('Hello');
  });

  it('trims both sides', () => {
    expect(buildSmsReplyBody('  hi  ', '  there  ')).toBe(
      'Replying to: "hi"\n\nthere',
    );
  });

  /**
   * The rule that matters: full quoting is the preference, but the user's own words are
   * what the customer actually needs to read.
   */
  it('truncates the QUOTE, never the reply, when the limit would be breached', () => {
    const quote = 'q'.repeat(2000);
    const reply = 'Short answer.';
    const body = buildSmsReplyBody(quote, reply);

    expect(body.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
    expect(body.endsWith(reply)).toBe(true);
    expect(body).toContain('…');
  });

  it('keeps a long reply intact and drops the quote entirely when it cannot fit', () => {
    // No room for a quote worth reading — a two-character stub would tell the customer
    // nothing and still cost a segment.
    const reply = 'r'.repeat(SMS_MAX_CHARS - 10);
    expect(buildSmsReplyBody('some original message', reply)).toBe(reply);
  });

  it('never exceeds the cap for any quote length', () => {
    const reply = 'ok';
    for (const len of [0, 1, 50, 1500, 1599, 1600, 5000]) {
      const body = buildSmsReplyBody('q'.repeat(len), reply);
      expect(body.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
    }
  });
});

describe('smsQuoteCost', () => {
  it('is zero when there is nothing quotable', () => {
    expect(smsQuoteCost(null)).toBe(0);
    expect(smsQuoteCost('  ')).toBe(0);
  });

  it('accounts for the wrapper, not just the text', () => {
    // 'Replying to: "' + 'hi' + '"\n\n'
    expect(smsQuoteCost('hi')).toBe('Replying to: "'.length + 2 + 3);
  });

  it('matches what the assembled body actually costs', () => {
    const quote = 'can you send the invoice';
    const reply = 'Sure.';
    expect(buildSmsReplyBody(quote, reply).length).toBe(
      smsQuoteCost(quote) + reply.length,
    );
  });
});

describe('smsReplyBudget', () => {
  it('is the full cap with no quote', () => {
    expect(smsReplyBudget(null)).toBe(SMS_MAX_CHARS);
  });

  it('shrinks by exactly what the quote costs', () => {
    const quote = 'hello there';
    expect(smsReplyBudget(quote)).toBe(SMS_MAX_CHARS - smsQuoteCost(quote));
  });

  it('never locks the composer, however long the quote', () => {
    // The quote gets truncated instead — there is always room to write something.
    expect(smsReplyBudget('q'.repeat(9000))).toBeGreaterThan(0);
  });
});
