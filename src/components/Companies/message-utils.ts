// Presentation helpers shared by the external Communications tab (Gmail/Outlook +
// Chat/Teams) and the internal staff-messaging tab. These started life as
// module-private functions inside CommunicationsTab.tsx; they were lifted here so
// the internal inbox can reuse the exact same date formatting, subject prefixing,
// signature handling and AI-polish plumbing rather than growing a second,
// slightly-divergent copy.

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Relative-ish date for a message row. The date part collapses with age (today →
 * weekday → date → date + year) but the clock time is always appended, so a
 * message from yesterday still shows when it arrived, not just "Wed".
 */
export function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return time;
  if (diffDays < 7) return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}, ${time}`;
}

export function prefixReSubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

export function prefixFwdSubject(subject: string): string {
  return /^fwd?:/i.test(subject.trim()) ? subject : `Fwd: ${subject}`;
}

/** Avatar letter. Accepts a raw From header ("Name <a@b.com>") or a bare name. */
export function senderInitial(from: string): string {
  const name = from.replace(/<[^>]+>/, '').trim().replace(/"/g, '');
  return (name[0] ?? '?').toUpperCase();
}

/** De-dupe a list by `id`, keeping first occurrence (guards against page overlap). */
export function dedupeById<T extends { id: string | number }>(items: T[]): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const it of items) {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

/** Plain-text version of an HTML body (used as the text/plain fallback on send). */
export function htmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.innerText || tmp.textContent || '').trim();
}

/** Blank lines seeded above the signature so the caret starts well clear of it. */
export const SIGNATURE_LEAD =
  '<div><br></div><div><br></div><div><br></div><div><br></div>';

/**
 * Split a compose/reply/forward body into the user's own text and the trailing
 * untouchable block — the signature (data-cyg-signature) and/or a quoted forward
 * (data-cyg-forward) — so AI polish never rewrites either. Cuts at whichever
 * marker appears first, so an account with no signature still has its quote spared.
 */
export function splitSignature(html: string): { body: string; sig: string } {
  const idx = html.search(/<div[^>]*data-cyg-(signature|forward)/i);
  if (idx === -1) return { body: html, sig: '' };
  return { body: html.slice(0, idx), sig: html.slice(idx) };
}

/**
 * Plain text → minimal HTML so an AI-polished draft renders in the RichTextEditor
 * and htmlToText still serializes it correctly on send.
 */
export function textToHtml(text: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br>' : escape(line)))
    .join('<br>');
}

/**
 * Scrub untrusted message HTML before it is seeded into the RichTextEditor.
 *
 * Detail views render bodies inside a sandboxed <iframe srcDoc>, but the editor
 * assigns `el.innerHTML = html` on a live contentEditable — where `<img onerror>`
 * / `<svg onload>` DO fire. Every quoted/forwarded body goes through here first.
 */
const FORBIDDEN_TAGS = 'script,style,link,meta,iframe,object,embed,form,base';
const URL_ATTRS = ['href', 'src', 'action'];

export function sanitizeForwardHtml(html: string, dropDataImages = false): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll(FORBIDDEN_TAGS).forEach((el) => el.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.includes(name) && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  // Inline images reference `cid:` parts of the ORIGINAL message. We re-attach
  // their bytes as normal attachments instead, so drop the tags rather than
  // leave broken-image icons for the recipient.
  //
  // `dropDataImages` additionally strips base64 `data:` images. Only used when
  // quoting a whole conversation: a reply usually embeds every earlier message, so
  // one embedded logo is repeated once per message and a dozen-message thread can
  // push `bodyHtml` past multer's 25 MB per-field limit — which surfaces as an
  // opaque failed send.
  doc.body.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (/^\s*cid:/i.test(src)) img.remove();
    else if (dropDataImages && /^\s*data:/i.test(src)) img.remove();
  });
  return doc.body.innerHTML;
}

/** The fields a forward quote needs, shared by real emails and internal messages. */
export interface ForwardSource {
  /** Display string, e.g. `"Ada" <ada@x.com>` or an internal user's name. */
  from: string;
  to: string;
  /** ISO timestamp. */
  date: string;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
}

/** The `From:/Date:/Subject:/To:` header block above one quoted message. */
function forwardHeader(src: ForwardSource): string {
  return (
    '<div>---------- Forwarded message ----------</div>' +
    `<div>From: ${escapeHtml(src.from)}</div>` +
    `<div>Date: ${escapeHtml(new Date(src.date).toLocaleString())}</div>` +
    `<div>Subject: ${escapeHtml(src.subject || '(no subject)')}</div>` +
    `<div>To: ${escapeHtml(src.to)}</div>` +
    '<div><br></div>'
  );
}

/**
 * The quoted block alone — header + body per message, oldest first, wrapped in a
 * SINGLE `data-cyg-forward` div.
 *
 * One wrapper for the whole run, not one per message: `splitSignature` cuts at the
 * first marker it finds, so per-message markers would leave every block after the
 * first outside the protected region and expose it to AI polish.
 *
 * Split out from `buildForwardedBody` so the forward panel can swap the quote when
 * the user switches between forwarding one message and the whole conversation,
 * without disturbing the signature or anything they have typed above it.
 */
export function buildForwardQuote(sources: ForwardSource[]): string {
  if (sources.length === 0) return '';
  // See sanitizeForwardHtml: a conversation quote repeats each embedded image once
  // per message, so those get dropped.
  const dropDataImages = sources.length > 1;
  const blocks = sources.map((src) => {
    const quoted = src.bodyHtml
      ? sanitizeForwardHtml(src.bodyHtml, dropDataImages)
      : `<div>${escapeHtml(src.bodyText ?? '').replace(/\n/g, '<br>')}</div>`;
    return forwardHeader(src) + quoted;
  });
  // data-cyg-forward marks the quote as untouchable — see splitSignature.
  return `<div data-cyg-forward>${blocks.join('<div><br></div>')}</div>`;
}

/**
 * Replace the quoted block in a forward draft, keeping everything above it — the
 * caret space, the signature (which the user may have edited) and whatever they
 * have already written.
 *
 * Deliberately not `splitSignature`, which cuts at whichever of
 * `data-cyg-signature` / `data-cyg-forward` comes first: with a signature present
 * that would take the signature too, and re-prepending a freshly built body would
 * emit SIGNATURE_LEAD twice.
 *
 * No marker means there is no quote yet — the Outlook single-message draft, where
 * Graph supplies the quote server-side — so the new one is simply appended.
 */
export function replaceForwardQuote(html: string, quote: string): string {
  const i = html.search(/<div[^>]*data-cyg-forward/i);
  return (i === -1 ? html : html.slice(0, i)) + quote;
}

/**
 * The Gmail-style quoted block seeded into a forward editor. Order matters:
 * caret space → signature → quote, so `splitSignature` still cuts at the
 * signature and AI polish only ever touches the user's own text above it.
 *
 * `signatureHtml` is '' where the provider has no signature (internal messages).
 */
export function buildForwardedBody(
  src: ForwardSource,
  signatureHtml: string,
): string {
  return (
    SIGNATURE_LEAD + signatureHtml + '<div><br></div>' + buildForwardQuote([src])
  );
}

/**
 * Per-file ceiling for every composer, email and internal alike. Matches
 * MAX_ATTACHMENT_BYTES on the server (which outbound email re-exports as
 * MAX_OUTBOUND_FILE_BYTES). Anything bigger is rejected in the browser rather
 * than uploaded and 400'd.
 */
export const MAX_FILE_BYTES = 250 * 1024 * 1024;

/**
 * How many raw bytes ride inside the message itself. Must match
 * INLINE_BUDGET_BYTES in server/src/communications/outbound-uploads.ts — the
 * server does the real split; this only drives the "will be sent as a link"
 * badge, so the two must agree or the badge lies.
 */
export const INLINE_BUDGET_BYTES = 18 * 1024 * 1024;

/**
 * Which of these files will travel inside the message and which the server will
 * upload to Drive/OneDrive and link. Mirrors `splitBySizeBudget` on the server:
 * spill the largest files until the rest fits the budget.
 */
export function attachmentsToLink(files: File[]): Set<File> {
  const biggestFirst = [...files].sort((a, b) => b.size - a.size);
  const linked = new Set<File>();
  let total = files.reduce((sum, f) => sum + f.size, 0);
  for (const f of biggestFirst) {
    if (total <= INLINE_BUDGET_BYTES) break;
    linked.add(f);
    total -= f.size;
  }
  return linked;
}

/**
 * Merge newly picked files into a composer's attachment list, enforcing the same
 * limits the server does. De-dupes on `name:size` (re-picking the same file is a
 * slip, not an intent to attach it twice), rejects anything over the per-file
 * ceiling, and caps the total — returning a notice to show the user rather than
 * silently dropping anything.
 */
export function mergeAttachments(
  existing: File[],
  incoming: File[],
  max: number,
  maxBytes: number = MAX_FILE_BYTES,
): { files: File[]; notice: string | null } {
  const seen = new Set(existing.map((f) => `${f.name}:${f.size}`));
  const added: File[] = [];
  let duplicates = 0;
  let tooBig = 0;
  for (const file of incoming) {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    if (file.size > maxBytes) {
      tooBig++;
      continue;
    }
    seen.add(key);
    added.push(file);
  }
  const room = Math.max(0, max - existing.length);
  const overflow = added.length - room;
  const files = [...existing, ...added.slice(0, room)];

  const parts: string[] = [];
  if (duplicates > 0) {
    parts.push(`${duplicates} file${duplicates > 1 ? 's were' : ' was'} already attached`);
  }
  if (tooBig > 0) {
    parts.push(
      `${tooBig} file${tooBig > 1 ? 's are' : ' is'} over the ${formatBytes(maxBytes)} limit`,
    );
  }
  if (overflow > 0) {
    parts.push(`only ${max} files can be attached`);
  }
  return { files, notice: parts.length ? `${parts.join('; ')}.` : null };
}

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Gmail-style print / save-as-PDF: open a fresh same-origin window, write a
 * self-contained printable document, and trigger the print dialog (whose "Save as
 * PDF" is the download path). Rebuilding the document avoids the message body's
 * sandboxed iframe, which can't be printed directly.
 */
export function openPrintWindow(title: string, contentHtml: string): void {
  // No `noopener`/`noreferrer` here — those make window.open return null (while
  // still opening a blank tab), leaving nothing to write the document into.
  const win = window.open('', '_blank', 'width=800,height=1000');
  if (!win) {
    alert('Please allow pop-ups for this site to print or save as PDF.');
    return;
  }
  const doc = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 24px; font-size: 13px; line-height: 1.5; }
  .print-header { border-bottom: 1px solid #ddd; padding-bottom: 12px; margin-bottom: 16px; }
  .print-header h1 { font-size: 18px; margin: 0 0 8px; }
  .print-meta { font-size: 12px; color: #444; }
  .print-meta div { margin: 1px 0; }
  .print-meta .label { font-weight: 600; }
  .print-body img { max-width: 100%; height: auto; }
  .print-attachments { margin-top: 16px; padding-top: 8px; border-top: 1px solid #eee; font-size: 12px; color: #444; }
  .print-attachments ul { margin: 4px 0 0; padding-left: 18px; }
  .chat-msg { margin: 0 0 14px; page-break-inside: avoid; }
  .chat-msg .who { font-size: 12px; font-weight: 600; color: #222; }
  .chat-msg .when { font-size: 11px; color: #888; margin-left: 8px; font-weight: 400; }
  .chat-msg .text { white-space: pre-wrap; margin-top: 2px; }
</style>
</head>
<body>${contentHtml}</body>
</html>`;
  win.document.open();
  win.document.write(doc);
  win.document.close();
  win.focus();
  // Print after content (incl. images) has loaded; handle the already-complete
  // case too (the written doc may finish loading before we attach onload).
  const triggerPrint = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === 'complete') {
    setTimeout(triggerPrint, 300);
  } else {
    win.onload = triggerPrint;
  }
  win.onafterprint = () => win.close();
}
