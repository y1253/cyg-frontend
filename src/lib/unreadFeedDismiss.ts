/**
 * Rows the user has just read, hidden from the notification bell immediately.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────────
 * The obvious implementation is to invalidate the feed query on every mark-read. That
 * does not work: the server caches each company's sweep for 55s, so a refetch a moment
 * after reading serves THE SAME SWEEP, still containing the item — and the row the user
 * just dealt with flickers back into the list. Optimistic dismissal is the primary
 * mechanism here, not an optimisation, and the 60s poll is only the slow backstop that
 * eventually agrees.
 *
 * ── WHY A MODULE STORE RATHER THAN CONTEXT ────────────────────────────────────
 * The five mark-read hooks would each have to take a `useNotifications()` dependency,
 * and every dismissal would re-render every notification consumer. A plain store read
 * through `useSyncExternalStore` keeps the hooks independent and is testable on its own.
 */

import { useSyncExternalStore } from 'react';

/**
 * Long enough for several 60s sweeps to agree that the item is read, short enough that a
 * stale entry cannot hide a genuinely re-delivered row for a whole session.
 */
const TTL_MS = 5 * 60_000;

const dismissed = new Map<string, number>();
const listeners = new Set<() => void>();

/** A new Set identity per change, because `useSyncExternalStore` compares by reference. */
let snapshot: ReadonlySet<string> = new Set();

function rebuild(): void {
  const now = Date.now();
  for (const [id, at] of dismissed) {
    if (now - at >= TTL_MS) dismissed.delete(id);
  }
  snapshot = new Set(dismissed.keys());
  for (const listener of listeners) listener();
}

/** Hide a row: the user has read this item. */
export function dismissUnreadFeedItem(id: string): void {
  dismissed.set(id, Date.now());
  rebuild();
}

/**
 * Bring a row back: the user marked it unread again.
 *
 * Without this, marking something unread would leave it dismissed for the whole TTL —
 * the count would be right on the next sweep and the row still missing, which reads as
 * the bell being broken.
 */
export function restoreUnreadFeedItem(id: string): void {
  if (dismissed.delete(id)) rebuild();
}

/** Test seam; also what logout should call if the store ever outlives a session. */
export function clearUnreadFeedDismissals(): void {
  if (dismissed.size === 0) return;
  dismissed.clear();
  rebuild();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The currently-hidden ids.
 *
 * Exported because it IS the store's read side — `useDismissedIds` is a thin React
 * binding over it, and the tests exercise the same function the UI does rather than a
 * parallel seam.
 *
 * Expired entries are swept on READ as well as on write: a user who reads a message and
 * then leaves the tab alone produces no further writes, so without this a row could stay
 * hidden indefinitely if the server ever reported it unread again.
 */
export function dismissedIds(): ReadonlySet<string> {
  const now = Date.now();
  let expired = false;
  for (const [, at] of dismissed) {
    if (now - at >= TTL_MS) {
      expired = true;
      break;
    }
  }
  if (expired) rebuild();
  return snapshot;
}

export function useDismissedIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, dismissedIds);
}
