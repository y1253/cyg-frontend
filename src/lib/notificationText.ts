/**
 * How a popup says what arrived.
 *
 * One formatter for all three alert paths — the internal-message stream, the
 * per-company Gmail stream, and the cross-company count poll — so a notification
 * reads the same wherever it came from.
 */

/** Fits a desktop notification body without the OS truncating it mid-thought. */
const DEFAULT_MAX = 110;

export interface PreviewParts {
  from?: string | null;
  subject?: string | null;
  snippet?: string | null;
}

/**
 * Cut to `max`, ending with an ellipsis — but only when something was actually
 * removed, so a short message isn't given a misleading "…".
 *
 * Prefers the last word boundary so the cut doesn't land mid-word, unless that
 * would throw away most of the budget (one very long token, e.g. a URL).
 */
export function truncate(text: string, max = DEFAULT_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const hard = clean.slice(0, max);
  const space = hard.lastIndexOf(' ');
  const cut = space > max * 0.6 ? hard.slice(0, space) : hard;
  return `${cut.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/**
 * `Sender: Subject — beginning of the body…`
 *
 * Parts that are missing are skipped rather than leaving their separator behind: a
 * chat message has no subject, and an internal message may have no snippet.
 */
export function messagePreview(parts: PreviewParts, max = DEFAULT_MAX): string {
  const from = parts.from?.trim();
  const subject = parts.subject?.trim();
  const snippet = parts.snippet?.trim();

  const head = [from, subject || (snippet ? '' : '(no subject)')]
    .filter(Boolean)
    .join(': ');
  const line = [head, snippet].filter(Boolean).join(' — ');
  return truncate(line, max);
}
