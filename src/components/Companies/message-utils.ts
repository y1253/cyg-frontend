// Presentation helpers shared by the external Communications tab (Gmail/Outlook +
// Chat/Teams) and the internal staff-messaging tab. These started life as
// module-private functions inside CommunicationsTab.tsx; they were lifted here so
// the internal inbox can reuse the exact same date formatting, subject prefixing,
// signature handling and AI-polish plumbing rather than growing a second,
// slightly-divergent copy.

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Relative-ish date for a message row: time today, weekday this week, else date. */
export function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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

export function sanitizeForwardHtml(html: string): string {
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
  doc.body.querySelectorAll('img').forEach((img) => {
    if (/^\s*cid:/i.test(img.getAttribute('src') ?? '')) img.remove();
  });
  return doc.body.innerHTML;
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
