import type { PolishBudget } from '../PolishPanel';

/**
 * Length budgets and thread context for polishing a TEXT-channel draft.
 *
 * Pure and shared by all four plain-text composers (SMS thread + compose, WhatsApp thread
 * + compose) so the two halves of each channel cannot drift: a limit enforced in the
 * thread view but not the compose dialog is a rule somebody only discovers by hitting it.
 */

/**
 * One GSM-7 text message.
 *
 * ⚠️ Deliberately the SINGLE-segment size, not the concatenated 153. The budget exists to
 * keep a polished reply inside ONE billed message; 153 is what you get per part once a
 * message is already being split, which is the thing being avoided.
 *
 * A draft with any non-GSM-7 character is really limited to 70, but the budget is
 * advisory — the composer's own counter (`segmentsFor`) remains the truth about what will
 * actually be sent, and it is right there under the box.
 */
export const SMS_SEGMENT_CHARS = 160;

/**
 * Meta's hard cap on a media caption. Over this, the send is REFUSED — which is why
 * `hard: true` and Accept is blocked rather than merely warned about.
 */
export const WHATSAPP_CAPTION_CHARS = 1024;

/** A plain WhatsApp message. Generous enough that a polished reply never approaches it. */
export const WHATSAPP_TEXT_CHARS = 4096;

/** The budget for a text message. Always offered: every text is billed by length. */
export function smsBudget(enabled: boolean): PolishBudget {
  return {
    maxChars: SMS_SEGMENT_CHARS,
    // Over-length is legal on SMS, just dearer, so the user keeps the final say.
    hard: false,
    label: 'one text message',
    enabled,
  };
}

/**
 * The budget for a WhatsApp message, or `undefined` when there is nothing worth offering.
 *
 * With no attachment the cap is 4096 — several screens of prose that a polished reply will
 * never reach — so the toggle would be a control that never does anything. Returning
 * `undefined` hides it rather than showing a limit nobody can hit.
 */
export function whatsappBudget(
  enabled: boolean,
  hasCaption: boolean,
): PolishBudget | undefined {
  if (!hasCaption) return undefined;
  return {
    maxChars: WHATSAPP_CAPTION_CHARS,
    // Meta refuses a longer caption outright.
    hard: true,
    label: 'a caption',
    enabled,
  };
}

/**
 * How much conversation is worth sending as context.
 *
 * `PolishReplyDto.context` is capped at 16000 server-side; this stays under it so a long
 * thread is trimmed HERE, where the newest messages can be kept, rather than being
 * rejected wholesale by validation.
 */
export const MAX_POLISH_CONTEXT_CHARS = 12000;

export interface PolishContextLine {
  /** Did we send it? Decides whether the line reads "You" or the other party's name. */
  isOwn: boolean;
  /** Who said it, when it was not us. Falls back to a neutral label. */
  from?: string | null;
  text: string;
}

/**
 * A thread as a transcript the model can read, newest messages guaranteed to survive.
 *
 * ⚠️ Trimmed from the OLD end. The tone a reply has to match is set by the last few
 * messages, so dropping the tail to fit would throw away exactly the part that matters —
 * and `ChatThreadView`'s equivalent is unbounded, which is what the server cap was added
 * to stop. Empty lines are skipped: a row with no text (a bare attachment) contributes
 * nothing but a dangling name.
 */
export function threadPolishContext(
  lines: PolishContextLine[],
  fallback: string,
  maxChars = MAX_POLISH_CONTEXT_CHARS,
): string {
  const rendered: string[] = [];
  let total = 0;
  // Walk backwards so the newest are the ones that fit.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const text = line.text?.trim();
    if (!text) continue;
    const who = line.isOwn ? 'You' : line.from?.trim() || 'Them';
    const entry = `${who}: ${text}`;
    if (total + entry.length > maxChars) break;
    rendered.unshift(entry);
    total += entry.length + 1;
  }
  // `context` is @IsNotEmpty() server-side, so an empty thread must still say something.
  return rendered.length > 0 ? rendered.join('\n') : fallback;
}
