import type { EmailAttachment } from '@/api/gmail';

/**
 * Transforms applied to provider-supplied email HTML before it is handed to the
 * sandboxed <iframe> (or to the print window, which reuses the same pipeline).
 */

export function injectBaseTarget(html: string): string {
  if (html.includes('<base')) return html;
  const withHead = html.replace(/<head>/i, '<head><base target="_blank" rel="noreferrer">');
  if (withHead !== html) return withHead;
  return '<base target="_blank" rel="noreferrer">' + html;
}

// Rewrite inline `src="cid:XXX"` references in email HTML to authenticated
// attachment URLs so embedded images render inside the sandboxed iframe.
export function rewriteInlineImages(
  html: string,
  attachments: EmailAttachment[],
  urlFor: (att: EmailAttachment) => string,
): string {
  return html.replace(
    /src\s*=\s*(["']?)cid:([^"'>\s]+)\1/gi,
    (match, _quote: string, cid: string) => {
      let decoded = cid;
      try {
        decoded = decodeURIComponent(cid);
      } catch {
        // keep raw cid if it isn't valid percent-encoding
      }
      const att = attachments.find(
        (a) => a.contentId && (a.contentId === cid || a.contentId === decoded),
      );
      return att ? `src="${urlFor(att)}"` : match;
    },
  );
}
