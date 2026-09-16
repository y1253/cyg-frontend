/**
 * Quoting a message in a REPLY BY TEXT.
 *
 * SMS has no native quoting and, unlike WhatsApp, nothing about a text is stored on our
 * side — rows are fetched live from SignalWire, so there is nowhere to hang a structured
 * "replies to" pointer. The quote therefore has to be part of the message body, which is
 * also what the customer's phone will show them.
 *
 * Assembled on the CLIENT rather than the server so the segment counter and the character
 * limit stay honest: the user sees the true length, and its real cost in billed segments,
 * before pressing send rather than getting a rejection afterwards.
 */

/** Ten SMS segments — the server enforces the same cap in the DTO and in `sendSms`. */
export const SMS_MAX_CHARS = 1600;

const PREFIX = 'Replying to: "';
const SUFFIX = '"\n\n';

/** An empty or whitespace-only original is not worth quoting. */
function usable(quoted: string | null | undefined): string | null {
  const trimmed = quoted?.trim();
  return trimmed ? trimmed : null;
}

/**
 * How many characters the quote will cost, so the composer can budget for it.
 *
 * Zero when there is nothing quotable, which is also what makes "clear the quote" and
 * "there was never a quote" behave identically.
 */
export function smsQuoteCost(quoted: string | null | undefined): number {
  const text = usable(quoted);
  return text ? PREFIX.length + text.length + SUFFIX.length : 0;
}

/**
 * The body actually sent: the quoted original, then the user's own words.
 *
 * ⚠️ When the whole thing would breach the limit, the QUOTE is truncated and never the
 * reply. Quoting in full is the stated preference, but a reply the customer cannot read
 * to the end is a worse failure than an abbreviated quote — and refusing to send at all
 * is the worst of the three.
 */
export function buildSmsReplyBody(
  quoted: string | null | undefined,
  reply: string,
  maxChars: number = SMS_MAX_CHARS,
): string {
  const body = reply.trim();
  const text = usable(quoted);
  if (!text) return body;

  const budget = maxChars - body.length - PREFIX.length - SUFFIX.length;
  // No room for a quote worth reading: send the reply alone rather than a stub like
  // `Replying to: "c…"`, which tells the customer nothing and costs a segment.
  if (budget < 12) return body;

  const clipped = text.length <= budget ? text : `${text.slice(0, budget - 1)}…`;
  return `${PREFIX}${clipped}${SUFFIX}${body}`;
}

/**
 * What the user may still type, given the quote already claims part of the budget.
 *
 * Never negative: an enormous quote gets truncated by `buildSmsReplyBody` rather than
 * locking the composer, so there is always room to write something.
 */
export function smsReplyBudget(
  quoted: string | null | undefined,
  maxChars: number = SMS_MAX_CHARS,
): number {
  return Math.max(1, maxChars - smsQuoteCost(quoted));
}
