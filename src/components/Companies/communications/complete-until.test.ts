import { describe, expect, it } from 'vitest';
import { countMarkableUpTo } from './complete-until';

const m = (
  id: string,
  at: string,
  over: { isCompleted?: boolean; isOwn?: boolean } = {},
) => ({ id, at, ...over });

describe('countMarkableUpTo', () => {
  const thread = [
    m('a', '2026-09-17T09:00:00.000Z'),
    m('b', '2026-09-17T09:05:00.000Z'),
    m('c', '2026-09-17T09:30:00.000Z'),
  ];

  it('counts the anchor and everything older', () => {
    expect(countMarkableUpTo(thread, 'b')).toBe(2);
    expect(countMarkableUpTo(thread, 'c')).toBe(3);
    expect(countMarkableUpTo(thread, 'a')).toBe(1);
  });

  /** Mirrors `idsUpTo`: the caller's own order must not change the answer. */
  it('does not depend on the order the caller holds the thread in', () => {
    expect(countMarkableUpTo([...thread].reverse(), 'b')).toBe(2);
  });

  /** Completing something already complete changes nothing, so it must not be counted. */
  it('skips messages that are already complete', () => {
    const some = [
      m('a', '2026-09-17T09:00:00.000Z', { isCompleted: true }),
      m('b', '2026-09-17T09:05:00.000Z'),
    ];
    expect(countMarkableUpTo(some, 'b')).toBe(1);
  });

  /**
   * Only where the SERVER also skips them — WhatsApp refuses an outbound row, and an
   * internal message you sent has no recipient row of your own. A sent text or email is
   * completable, and those callers leave `isOwn` unset.
   */
  it('skips own messages when the caller marks them', () => {
    const mixed = [
      m('a', '2026-09-17T09:00:00.000Z', { isOwn: true }),
      m('b', '2026-09-17T09:05:00.000Z'),
    ];
    expect(countMarkableUpTo(mixed, 'b')).toBe(1);
  });

  it('is stable when several messages share a timestamp', () => {
    const burst = [
      m('w1', '2026-09-17T09:00:00.000Z'),
      m('w2', '2026-09-17T09:00:00.000Z'),
      m('w3', '2026-09-17T09:00:00.000Z'),
    ];
    expect(countMarkableUpTo(burst, 'w2')).toBe(2);
  });

  it('counts nothing for an anchor that is not in the thread', () => {
    expect(countMarkableUpTo(thread, 'gone')).toBe(0);
    expect(countMarkableUpTo([], 'a')).toBe(0);
  });
});
