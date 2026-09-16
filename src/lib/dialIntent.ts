/**
 * "Did THIS tab place an outbound call just now?"
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * Every browser registers the SAME shared SIP credential, so every browser receives every
 * INVITE, and an INVITE carrying no marker is anonymous. An internal call's leg 1 — the
 * caller's own `outbound-api` leg — has no marker at all (only the callee's leg gets
 * `X-Cyg-Call`), so any tab holding any token-less outbound event could claim it, and
 * outbound events auto-answer. In practice that meant a colleague whose own company call
 * had just ended, or the caller's own second tab, silently answering somebody else's call
 * while the person who dialled got no overlay and no audio.
 *
 * Marking leg 1 server-side would rest on `<Sip>` URI parameters arriving as SIP headers,
 * which is still unverified against the live account — and is precisely why order-matching
 * exists as a fallback. The tab that dialled, on the other hand, knows it dialled.
 *
 * A module store rather than context or a ref: the dial goes out through `api/phone.ts`
 * and `api/internalCalls.ts`, which are plain functions with no access to React state, and
 * `SoftphoneContext` needs to read it without those files depending on it. Same shape as
 * `unreadFeedDismiss.ts`.
 */

/**
 * How long a dial stays "recent".
 *
 * Matched to `EVENT_STALE_MS` in `SoftphoneContext` on purpose. Pairing needs BOTH a live
 * intent and an unconsumed outbound event, and `pair()` removes the event it used — so the
 * event is the scarce half and the limiting TTL. A shorter window here could expire before
 * a slow event arrives; a longer one would buy nothing, since no event outlives 60s.
 */
export const DIAL_INTENT_MS = 60_000;

let dialedAt = 0;

/**
 * Call this as the dial request is SENT, never when it resolves.
 *
 * SignalWire starts forking leg 1 the instant `POST /Calls` is accepted, so the INVITE can
 * reach the browser before the fetch promise settles. Recording the intent afterwards would
 * leave the exact gap this is meant to close.
 */
export function markDialedHere(now: number = Date.now()): void {
  dialedAt = now;
}

export function dialedHere(now: number = Date.now()): boolean {
  return dialedAt > 0 && now - dialedAt <= DIAL_INTENT_MS;
}

/** Test seam, and a clean slate on logout. */
export function clearDialIntent(): void {
  dialedAt = 0;
}
