import { describe, it, expect } from 'vitest';
import { showListSpinner } from './inbox-loading';

const args = (over: Partial<Parameters<typeof showListSpinner>[0]> = {}) => ({
  isInboxLike: true,
  emailLoading: false,
  chatLoading: false,
  phoneLoading: false,
  loadedRowCount: 0,
  ...over,
});

describe('showListSpinner', () => {
  it('spins on a cold inbox with nothing loaded', () => {
    expect(
      showListSpinner(args({ emailLoading: true, chatLoading: true, phoneLoading: true })),
    ).toBe(true);
  });

  /**
   * THE REPORTED BUG. Phone is gated behind the support-number query, so it starts loading
   * after email has already painted — and the old expression wiped those rows for a
   * centered "Loading…" every time the tab was opened.
   */
  it('does NOT wipe a list that already has rows when phone arrives late', () => {
    expect(showListSpinner(args({ phoneLoading: true, loadedRowCount: 12 }))).toBe(false);
  });

  it('does not wipe the list for a late chat query either', () => {
    expect(showListSpinner(args({ chatLoading: true, loadedRowCount: 12 }))).toBe(false);
  });

  // No mailbox, so the email and chat queries are DISABLED and report isLoading false.
  // Without the spinner this company would flash "Inbox is empty" before its calls land.
  it('still spins for a cold phone-only company', () => {
    expect(showListSpinner(args({ phoneLoading: true }))).toBe(true);
  });

  it('stops once everything has settled, even with no rows', () => {
    expect(showListSpinner(args())).toBe(false);
  });

  // Sent/Spam/Trash page email and nothing else, so a background chat or phone page must
  // never blank them.
  it('ignores chat and phone in a folder view', () => {
    expect(
      showListSpinner(
        args({ isInboxLike: false, chatLoading: true, phoneLoading: true }),
      ),
    ).toBe(false);
  });

  it('spins in a folder view only while email is loading and empty', () => {
    expect(showListSpinner(args({ isInboxLike: false, emailLoading: true }))).toBe(true);
    expect(
      showListSpinner(args({ isInboxLike: false, emailLoading: true, loadedRowCount: 3 })),
    ).toBe(false);
  });
});
