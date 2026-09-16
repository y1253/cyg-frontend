/**
 * Which messages are the "future" of the moment a thread was opened at.
 *
 * A thread opens frozen at the message the user clicked and dims everything newer, so a
 * later message is visible but visibly later. The flaw that rule has on its own: the reply
 * you just typed is also newer, so it greys out the instant you send it — which reads as
 * "that failed" rather than "that is in the future".
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────────
 * A message is future when it is newer than the anchor, UNLESS it is yours and the
 * customer has not written since the anchor. Your replies are your answer to the thing you
 * opened. Once the customer writes again the conversation has genuinely moved on, so
 * everything from their message onward dims — yours included.
 *
 * ── WHY NOT COPY CHAT ─────────────────────────────────────────────────────────
 * `ChatThreadView` reaches the same result by HOISTING an own reply up next to the message
 * it natively quotes (`surfacedReplies`), and it deliberately refuses to surface a reply
 * that answers something already dimmed — "relative to the anchor it's future and stays
 * light". SMS and WhatsApp carry no quote, so there is nothing to hoist by. The customer's
 * next message is the quote-free stand-in for that same boundary.
 */

interface Dimmable {
  at: string;
  direction: 'inbound' | 'outbound';
}

/**
 * Build the predicate for one thread. `messages` may be in any order — the cutoff is found
 * by scanning, not by position — though both callers render oldest-first.
 *
 * An unparseable date is never dimmed. Same instinct as `sortableIso` refusing to fall back
 * to epoch 0: a message shown at full brightness when it should have been dimmed is a
 * harmless wrong answer, while one silently greyed out looks like it failed to send.
 */
export function makeIsFuture<T extends Dimmable>(
  messages: readonly T[],
  anchorTime: string,
): (m: T) => boolean {
  const anchorMs = Date.parse(anchorTime);
  if (Number.isNaN(anchorMs)) return () => false;

  // The customer's first word after the anchor. Everything from here on is future for
  // both sides; before it, only their messages are.
  let cutoff = Infinity;
  for (const m of messages) {
    if (m.direction !== 'inbound') continue;
    const at = Date.parse(m.at);
    if (Number.isNaN(at) || at <= anchorMs) continue;
    if (at < cutoff) cutoff = at;
  }

  return (m: T) => {
    const at = Date.parse(m.at);
    if (Number.isNaN(at)) return false;
    if (at <= anchorMs) return false;
    return !(m.direction === 'outbound' && at < cutoff);
  };
}
