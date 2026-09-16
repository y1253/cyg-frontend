import { describe, expect, it } from 'vitest';
import { makeIsFuture } from './thread-dim';

type Msg = { at: string; direction: 'inbound' | 'outbound' };

const T = (min: number) => new Date(Date.UTC(2026, 8, 15, 12, min, 0)).toISOString();

const inbound = (min: number): Msg => ({ at: T(min), direction: 'inbound' });
const outbound = (min: number): Msg => ({ at: T(min), direction: 'outbound' });

describe('makeIsFuture', () => {
  it('keeps your replies bright until the customer writes again', () => {
    // Their message (the anchor) → two replies from you → their next message → your reply.
    const messages = [
      inbound(0), // anchor
      outbound(1),
      outbound(2),
      inbound(3),
      outbound(4),
    ];
    const isFuture = makeIsFuture(messages, T(0));

    expect(isFuture(messages[0])).toBe(false); // the anchor itself
    expect(isFuture(messages[1])).toBe(false); // your reply
    expect(isFuture(messages[2])).toBe(false); // still your reply
    expect(isFuture(messages[3])).toBe(true); // they wrote again — the future starts
    expect(isFuture(messages[4])).toBe(true); // your reply to THAT is future too
  });

  it('never dims anything before the anchor', () => {
    const messages = [inbound(0), outbound(1), inbound(2)];
    const isFuture = makeIsFuture(messages, T(2));
    expect(messages.map(isFuture)).toEqual([false, false, false]);
  });

  it('leaves every later reply bright when the customer never answers', () => {
    // The unanswered-follow-ups case: nothing inbound after the anchor, so nothing dims.
    const messages = [inbound(0), outbound(1), outbound(5), outbound(9)];
    const isFuture = makeIsFuture(messages, T(0));
    expect(messages.map(isFuture)).toEqual([false, false, false, false]);
  });

  it('dims their later messages even when you never replied', () => {
    const messages = [inbound(0), inbound(1), inbound(2)];
    const isFuture = makeIsFuture(messages, T(0));
    expect(messages.map(isFuture)).toEqual([false, true, true]);
  });

  it('anchors on an outbound message too', () => {
    // Opening a conversation you started: your own later follow-up is not future.
    const messages = [outbound(0), outbound(1), inbound(2), outbound(3)];
    const isFuture = makeIsFuture(messages, T(0));
    expect(messages.map(isFuture)).toEqual([false, false, true, true]);
  });

  /**
   * An undimmed message that should have been dimmed is a harmless wrong answer; one
   * silently greyed out looks like it failed to send. Same instinct as `sortableIso`
   * refusing to fall back to epoch 0.
   */
  it('never dims a message whose date will not parse', () => {
    const broken: Msg = { at: 'not a date', direction: 'inbound' };
    const messages = [inbound(0), broken, inbound(5)];
    const isFuture = makeIsFuture(messages, T(0));
    expect(isFuture(broken)).toBe(false);
    // and it does not become the cutoff, so a later own reply is unaffected
    expect(isFuture(messages[2])).toBe(true);
  });

  it('dims nothing when the anchor itself will not parse', () => {
    const messages = [inbound(0), outbound(1), inbound(2)];
    const isFuture = makeIsFuture(messages, '');
    expect(messages.map(isFuture)).toEqual([false, false, false]);
  });

  it('takes the EARLIEST inbound after the anchor as the cutoff, not the last', () => {
    // Order-independent: the list is handed over newest-first here on purpose.
    const messages = [inbound(9), outbound(4), inbound(3), outbound(1), inbound(0)];
    const isFuture = makeIsFuture(messages, T(0));
    expect(isFuture(messages[3])).toBe(false); // outbound(1), before their next word
    expect(isFuture(messages[2])).toBe(true); // inbound(3), the cutoff
    expect(isFuture(messages[1])).toBe(true); // outbound(4), after it
    expect(isFuture(messages[0])).toBe(true); // inbound(9)
  });
});
