import { describe, expect, it } from 'vitest';
import type { CallItem, SmsItem } from '@/api/phone';
import {
  ALL_LABELS,
  INBOX_TABS,
  PHONE_ONLY_FOLDERS,
  isUnreadMissedCall,
  type UnifiedItem,
} from './types';

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

describe('the MISSED folder', () => {
  it('is an inbox-backed tab, so it renders the merged list rather than a mail folder', () => {
    expect(INBOX_TABS).toContain('MISSED');
  });

  it('survives a reload — the restore check accepts it', () => {
    expect(ALL_LABELS).toContain('MISSED');
  });

  it('is hidden for a company with no support number', () => {
    expect(PHONE_ONLY_FOLDERS).toContain('MISSED');
  });
});
