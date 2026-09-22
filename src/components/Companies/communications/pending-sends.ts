/**
 * Messages this browser is still uploading, shown in the conversation straight away.
 *
 * ── WHY THESE DO NOT LIVE IN THE QUERY CACHE ──────────────────────────────────
 * The obvious implementation is `onMutate` + `setQueryData`, and it does not work here.
 * Both thread queries carry `refetchInterval: 15000` while the view is open, so a poll
 * landing between the mutation starting and finishing replaces the cache wholesale with
 * server data that has no pending row in it — and the row vanishes mid-send. At fifteen
 * seconds against a multi-megabyte upload that is the common case, not a rare race.
 *
 * Worse for texts specifically: `getSmsThread` reads LIVE from SignalWire, so even the
 * refetch after a successful send can come back without the message if their list has
 * not indexed it yet. A cache-based optimistic row would be reintroducing the exact
 * disappearing-message problem it was added to fix.
 *
 * So pending rows are owned by the view and merged at render time. The query cache stays
 * the server's truth, untouched.
 */

/**
 * ⚠️ NOT `swsms:` or `wa:`. Those namespaces are validated by the mark/complete routes,
 * and a row that is not on the server yet must not carry an id that looks like one it
 * could act on — a stray "Mark complete" on a pending bubble would post a well-formed
 * id for a message that does not exist.
 */
export const PENDING_PREFIX = 'pending:';

export function isPendingId(id: string): boolean {
  return id.startsWith(PENDING_PREFIX);
}

export function newPendingId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${PENDING_PREFIX}${rand}`;
}

/** What a pending row adds to whatever the channel's item type already is. */
export interface PendingMeta {
  pending: true;
  /**
   * ⚠️ A failed send STAYS in the list as `'failed'` — it is not rolled back.
   *
   * This inverts the usual React Query shape, where `onError` restores the snapshot. A
   * text that vanishes on failure is indistinguishable from one that was sent, which is
   * the worst possible outcome for a message somebody believes they sent. It stays, in a
   * destructive style, with Retry and Discard.
   */
  sendState: 'sending' | 'failed';
  error?: string;
  /** Object URLs for the local files, so the bubble can show the picture immediately. */
  previews: string[];
}

interface Placed {
  id: string;
  at: string;
}

/**
 * Server rows plus this browser's in-flight ones, in one time-ordered list.
 *
 * Sorted by `(at, id)` — the same rule as `idsUpTo` and `countMarkableUpTo`, because
 * WhatsApp timestamps arrive in whole seconds and a burst would otherwise order
 * arbitrarily between renders.
 */
export function mergePending<T extends Placed, P extends Placed>(
  server: readonly T[],
  pending: readonly P[],
): (T | P)[] {
  const merged: (T | P)[] = [...server, ...pending];
  return merged.sort((a, b) => {
    const at = new Date(a.at).getTime() - new Date(b.at).getTime();
    if (at !== 0) return at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
