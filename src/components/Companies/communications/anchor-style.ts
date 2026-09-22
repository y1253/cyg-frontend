/**
 * How the message somebody actually opened is distinguished from the rest of its thread.
 *
 * ── WHY ONE SHARED CONSTANT ───────────────────────────────────────────────────
 * Four views show a conversation frozen around an anchor, and before this only CHAT
 * marked it (a purple ring). SMS and WhatsApp communicated the anchor purely by scroll
 * position, and email by being the one expanded card — so in three of the four, a glance
 * could not answer "which message am I looking at?". Defining it once is what stops the
 * four drifting into four different answers.
 *
 * ⚠️ RAISE THE ANCHOR, NEVER DIM THE REST HARDER. `thread-dim.ts` records the asymmetry
 * that constrains this: "a message shown at full brightness when it should have been
 * dimmed is a harmless wrong answer, while one silently greyed out looks like it failed
 * to send." Past `opacity-50` an outbound bubble reads as failed, so the contrast has to
 * come from the anchor's own treatment.
 *
 * A ring rather than a background: every bubble already uses its background to say who
 * sent it (teal for ours, muted for theirs, emerald on WhatsApp), so a background here
 * would collide with the one signal the thread cannot afford to lose.
 */
export const ANCHOR_RING =
  'ring-2 ring-teal-500 ring-offset-2 ring-offset-background';

/** The same emphasis for a card-shaped message (email), where a ring reads as a border. */
export const ANCHOR_CARD =
  'ring-2 ring-teal-500 ring-offset-1 ring-offset-background border-teal-400';
