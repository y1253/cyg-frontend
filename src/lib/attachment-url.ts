import { emailAttachmentUrl, type EmailAttachment } from '@/api/gmail';

/**
 * A stable attachment URL for one file, across refetches.
 *
 * ── THE PROBLEM ────────────────────────────────────────────────────────────────
 * Gmail mints a FRESH `attachmentId` on every `threads.get` (the server says so at
 * `gmail.service.ts`, in `getEmailAttachment`'s catch). The thread query polls every
 * 15s, so `emailAttachmentUrl` produced a different string each cycle for the exact
 * same bytes. React wrote the new `src` onto the live `<img>`, the browser threw away
 * the decoded frame and re-downloaded — a visible blink, every 15 seconds, for as
 * long as the email stayed open. `Cache-Control: private, max-age=3600` on the route
 * cannot help: the URL *is* the HTTP cache key, and the URL is what changed.
 *
 * Keying the component was already fixed and was not enough; the `src` attribute
 * mutating is a separate defect from the element remounting.
 *
 * ── THE FIX ────────────────────────────────────────────────────────────────────
 * Identify the file by what actually holds still — message id, filename, size — and
 * hand back the FIRST url minted for it, ignoring later id churn. The server's
 * attachment route re-resolves a superseded id from the `filename` and `size` already
 * on the query string, so a frozen url stays fetchable however long the tab is open.
 * Those two halves belong together: freezing without the server-side re-resolve would
 * trade a blink for a 404.
 *
 * ── WHAT IS DELIBERATELY *NOT* FROZEN ──────────────────────────────────────────
 * Only the attachmentId. Everything else in the url is compared against a freshly
 * built one and wins if it differs. That matters most for the API base, which
 * `emailAttachmentUrl` picks from a module-level provider map: a component that
 * renders before the account query resolves gets the Gmail base by default, and an
 * Outlook company would otherwise be frozen at the wrong host forever. Same for the
 * token — a re-login re-mints once, which is correct, rather than serving a url
 * signed with a dead token.
 *
 * Only Gmail needs any of this. Chat, Outlook and internal-message ids are stable.
 */
const cache = new Map<string, string>();

/** Bounds the map. Generous: one thread of image-heavy mail is dozens of entries. */
const MAX_ENTRIES = 500;

const ATTACHMENT_SEGMENT = '/attachments/';

/**
 * Are these the same url but for the attachment id? Compares the path prefix and the
 * whole query string, so a different base, token, disposition or filename counts as a
 * different url — the id in between is the only part allowed to drift.
 */
function differsOnlyByAttachmentId(a: string, b: string): boolean {
  const split = (url: string) => {
    const cut = url.lastIndexOf(ATTACHMENT_SEGMENT);
    if (cut === -1) return null;
    const q = url.indexOf('?', cut);
    return q === -1
      ? { prefix: url.slice(0, cut), query: '' }
      : { prefix: url.slice(0, cut), query: url.slice(q) };
  };
  const x = split(a);
  const y = split(b);
  if (!x || !y) return false;
  return x.prefix === y.prefix && x.query === y.query;
}

export function stableEmailAttachmentUrl(
  token: string,
  companyId: number,
  messageId: string,
  att: EmailAttachment,
  disposition?: 'inline' | 'attachment',
): string {
  const fresh = emailAttachmentUrl(token, companyId, messageId, att, disposition);
  const key = [companyId, messageId, att.filename, att.size ?? 0, disposition ?? ''].join(
    '|',
  );

  const hit = cache.get(key);
  if (hit && differsOnlyByAttachmentId(hit, fresh)) return hit;

  // Insertion-ordered, so the first key is the oldest — evict it rather than clearing
  // the whole map, which would re-blink every image currently on screen.
  if (!cache.has(key) && cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, fresh);
  return fresh;
}
