import { describe, expect, it } from 'vitest';
import type { CallItem, SmsItem } from '@/api/phone';
import { ALL_LABELS, isUnreadMissedCall, type UnifiedItem } from './types';

const call = (over: Partial<CallItem> = {}): UnifiedItem => ({
  kind: 'call',
  data: {
    direction: 'inbound',
    outcome: 'missed',
    isRead: false,
    hasVoicemail: false,
    ...over,
  } as CallItem,
});

describe('isUnreadMissedCall', () => {
  it('matches an inbound, unanswered, unread call', () => {
    expect(isUnreadMissedCall(call())).toBe(true);
  });

  it('matches a voicemail', () => {
    expect(isUnreadMissedCall(call({ hasVoicemail: true }))).toBe(true);
  });

  it('drops the call once it is read', () => {
    expect(isUnreadMissedCall(call({ isRead: true }))).toBe(false);
  });

  it('ignores answered and outbound calls', () => {
    expect(isUnreadMissedCall(call({ outcome: 'answered' }))).toBe(false);
    expect(isUnreadMissedCall(call({ direction: 'outbound' }))).toBe(false);
  });

  it('ignores every other channel', () => {
    const text: UnifiedItem = {
      kind: 'sms',
      data: { direction: 'inbound', isRead: false } as SmsItem,
    };
    expect(isUnreadMissedCall(text)).toBe(false);
  });
});

describe('the MISSED folder, now removed', () => {
  /**
   * ⚠️ This is the assertion that makes the removal safe, and it is worth keeping rather
   * than deleting with the tab.
   *
   * `ALL_LABELS` is derived from `FOLDERS` and is the whitelist the restore check in
   * `CommunicationsTab` runs against the persisted `cmp-comm-{id}` blob. Because the
   * entry is gone from `FOLDERS`, a stored `"MISSED"` now fails that check and falls back
   * to Inbox on its own -- which is why no version bump or migration was needed.
   *
   * Had it been removed from the tab strip but LEFT in `FOLDERS`, the stored value would
   * still have validated, the user would have restored onto an invisible tab, and
   * `emailLabel` would have fallen through to asking Gmail for a label literally named
   * MISSED on every open.
   */
  it('is no longer a label the restore check will accept', () => {
    expect(ALL_LABELS).not.toContain('MISSED');
  });
});
