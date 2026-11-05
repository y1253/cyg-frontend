import { describe, expect, it, vi } from 'vitest';
import {
  emitInternalMessageNotice,
  internalMessageNoticeOf,
  onInternalMessageNotice,
} from './internal-message-bus';

describe('internalMessageNoticeOf', () => {
  it('reads the popup fields', () => {
    expect(
      internalMessageNoticeOf({
        newMessage: { from: 'Dina', subject: 'Hi', snippet: 'x', threadId: 4 },
      }),
    ).toEqual({ from: 'Dina', subject: 'Hi', snippet: 'x', threadId: 4 });
  });
  it('is null for an invalidation-only event (sender, read state)', () => {
    expect(internalMessageNoticeOf(undefined)).toBeNull();
    expect(internalMessageNoticeOf({})).toBeNull();
  });
  it('drops fields of the wrong type', () => {
    expect(internalMessageNoticeOf({ newMessage: { from: 3, threadId: '4' } })).toEqual({
      from: undefined,
      subject: undefined,
      snippet: undefined,
      threadId: undefined,
    });
  });
});

describe('the bus', () => {
  it('reaches every listener even when one throws, and unsubscribes', () => {
    const bad = vi.fn(() => {
      throw new Error('x');
    });
    const good = vi.fn();
    const off1 = onInternalMessageNotice(bad);
    const off2 = onInternalMessageNotice(good);
    emitInternalMessageNotice({ from: 'A' });
    expect(good).toHaveBeenCalledWith({ from: 'A' });
    off1();
    off2();
    emitInternalMessageNotice({ from: 'B' });
    expect(good).toHaveBeenCalledTimes(1);
  });
});
