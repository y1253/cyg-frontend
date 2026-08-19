import type { EmailAttachment, EmailDetail, ChatMessage } from '@/api/gmail';
import { escapeHtml, formatEmailDate } from '../message-utils';
import { linkifyEscapedText } from '../linkify';
import { injectBaseTarget, rewriteInlineImages } from './email-html';

/**
 * Printable HTML builders for the Gmail-style "Print / save as PDF" action. The
 * markup is handed to `openPrintWindow` (message-utils), which supplies the page
 * chrome and the stylesheet these class names refer to.
 */

// Build the printable HTML for a single email (header + rendered body + list of
// non-inline attachments). Reuses the same inline-image rewrite + base-target
// transforms as the on-screen iframe so embedded images resolve.
export function buildEmailPrintHtml(
  email: EmailDetail,
  urlFor: (att: EmailAttachment) => string,
): string {
  const bodyHtml = email.bodyHtml
    ? injectBaseTarget(rewriteInlineImages(email.bodyHtml, email.attachments ?? [], urlFor))
    : `<pre style="white-space:pre-wrap;font-family:inherit;">${linkifyEscapedText(
        email.bodyText ?? '(empty)',
      )}</pre>`;
  const strip = (email.attachments ?? []).filter((a) => !a.isInline);
  const attachmentsHtml = strip.length
    ? `<div class="print-attachments"><span class="label">Attachments (${strip.length}):</span><ul>${strip
        .map((a) => `<li>${escapeHtml(a.filename)}</li>`)
        .join('')}</ul></div>`
    : '';
  return `<div class="print-header">
    <h1>${escapeHtml(email.subject || '(no subject)')}</h1>
    <div class="print-meta">
      <div><span class="label">From:</span> ${escapeHtml(email.from)}</div>
      <div><span class="label">To:</span> ${escapeHtml(email.to)}</div>
      ${email.cc ? `<div><span class="label">Cc:</span> ${escapeHtml(email.cc)}</div>` : ''}
      <div><span class="label">Date:</span> ${escapeHtml(formatEmailDate(email.date))}</div>
    </div>
  </div>
  <div class="print-body">${bodyHtml}</div>
  ${attachmentsHtml}`;
}

// Build the printable transcript for a chat conversation (plain text, one block
// per message). `messages` is the loaded thread (frozen at the anchored message).
export function buildChatPrintHtml(spaceName: string, messages: ChatMessage[]): string {
  const rows = messages
    .map((m) => {
      const when = m.createTime
        ? new Date(m.createTime).toLocaleString([], {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '';
      const atts = (m.attachments ?? [])
        .map((a) => `<div class="text">📎 ${escapeHtml(a.contentName || a.name)}</div>`)
        .join('');
      return `<div class="chat-msg">
        <div class="who">${escapeHtml(m.isOwn ? 'You' : m.sender)}<span class="when">${escapeHtml(when)}</span></div>
        ${m.text ? `<div class="text">${linkifyEscapedText(m.text)}</div>` : ''}
        ${atts}
      </div>`;
    })
    .join('');
  return `<div class="print-header"><h1>${escapeHtml(spaceName)}</h1></div>${rows}`;
}

/**
 * Print the whole opened conversation as one document, messages separated by a
 * rule. Titled after the newest message's subject, like Gmail.
 */
export function buildEmailThreadPrintHtml(
  emails: EmailDetail[],
  urlFor: (email: EmailDetail, att: EmailAttachment) => string,
): string {
  return emails
    .map((email) => buildEmailPrintHtml(email, (att) => urlFor(email, att)))
    .join('<hr style="margin:24px 0;border:none;border-top:1px solid #ddd;" />');
}
