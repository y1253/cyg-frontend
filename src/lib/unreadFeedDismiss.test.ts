import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearUnreadFeedDismissals,
  dismissUnreadFeedItem,
  dismissedIds,
  restoreUnreadFeedItem,
} from './unreadFeedDismiss';

/**
 * The store behind "a row leaves the bell the moment you read it".
 *
 * Both rules here fail silently: a missing restore leaves a row the user deliberately
 * marked unread invisible, and a missing expiry hides a genuinely re-delivered message.
 * Neither throws, and neither is visible until somebody complains the bell is wrong.
 */

const ids = () => [...dismissedIds()];

afterEach(() => {
  clearUnreadFeedDismissals();
  vi.useRealTimers();
});

describe('unread feed dismissals', () => {
  it('hides a row once it is read', () => {
    dismissUnreadFeedItem('m1');
    expect(ids()).toEqual(['m1']);
  });

  it('marking unread brings the row back', () => {
    dismissUnreadFeedItem('m1');
    restoreUnreadFeedItem('m1');
    expect(ids()).toEqual([]);
  });

  it('a dismissal expires, so a re-delivered item is not hidden forever', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    dismissUnreadFeedItem('m1');
    expect(ids()).toEqual(['m1']);

    // Past the 5-minute TTL: the row must be eligible to reappear.
    vi.setSystemTime(new Date('2026-09-10T12:06:00Z'));
    expect(ids()).toEqual([]);
  });

  it('keeps unrelated rows when one is restored', () => {
    dismissUnreadFeedItem('a');
    dismissUnreadFeedItem('b');
    restoreUnreadFeedItem('a');
    expect(ids()).toEqual(['b']);
  });

  it('restoring something never dismissed is a no-op', () => {
    dismissUnreadFeedItem('a');
    restoreUnreadFeedItem('zzz');
    expect(ids()).toEqual(['a']);
  });
});
