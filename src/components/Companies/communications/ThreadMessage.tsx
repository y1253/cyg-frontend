import { ChevronRight, Forward, Paperclip, Reply } from 'lucide-react';
import type { EmailDetail } from '@/api/gmail';
import { emailAttachmentUrl } from '@/api/gmail';
import { AttachmentPreview } from '../AttachmentPreview';
import { EmailBodyFrame } from '../EmailBodyFrame';
import { Linkified } from '../Linkified';
import { RecipientDetails } from '../RecipientDetails';
import { formatEmailDate, formatForwardTime, parseAddressList, senderInitial } from '../message-utils';
import { injectBaseTarget, rewriteInlineImages } from './email-html';
import { ForwardPreview } from './ForwardPreview';

/**
 * One message in an opened email conversation, Gmail-style: a clickable header
 * (sender · date, plus snippet when collapsed) that toggles the full
 * body/attachments below.
 *
 * `isFuture` = newer than the message the user opened: dimmed like the chat thread
 * view, and it stays dimmed while expanded.
 */
export function ThreadMessage({
  message: m,
  isFuture,
  expanded,
  isAnchor,
  expandedForwardIds,
  companyId,
  token,
  accountAddress,
  onToggle,
  onToggleForwardPreview,
  onReplyToThis,
  onForwardThis,
}: {
  message: EmailDetail;
  isFuture: boolean;
  expanded: boolean;
  /** The message the user opened — its own toolbar buttons already do this. */
  isAnchor: boolean;
  expandedForwardIds: Set<string>;
  companyId: number;
  token: string | null;
  accountAddress: string;
  onToggle: (id: string) => void;
  onToggleForwardPreview: (id: string) => void;
  onReplyToThis: (m: EmailDetail) => void;
  onForwardThis: (m: EmailDetail) => void;
}) {
  const strip = (m.attachments ?? []).filter((a) => !a.isInline);

  return (
    <div
      className={`group/msg border rounded-md overflow-hidden transition-opacity ${
        isFuture ? 'opacity-50' : ''
      }`}
    >
      {/* The arrow is a sibling of the header, not a child — the header is itself
          a <button> and nesting one inside it is invalid HTML. Same reason the
          recipient disclosure sits in its own row below rather than inline. */}
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => onToggle(m.id)}
          className="min-w-0 flex-1 flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
        >
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {senderInitial(m.from)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{m.from}</span>
              <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{formatEmailDate(m.date)}</span>
            </div>
            {!expanded && (
              <div className="text-xs text-muted-foreground truncate">{m.snippet}</div>
            )}
          </div>
        </button>
        {/* Reply to / forward THIS message even though newer ones follow it.
            Hidden on the message that is already the target, where the toolbar
            buttons do the same thing. */}
        {!isAnchor && (
          <div className="shrink-0 self-center mr-2 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              title="Reply to this message"
              onClick={() => onReplyToThis(m)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Reply size={14} />
            </button>
            <button
              type="button"
              title="Forward this message"
              onClick={() => onForwardThis(m)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Forward size={14} />
            </button>
          </div>
        )}
      </div>
      {expanded && (
        // pl-14 lines the details up under the sender name: px-3 (12) + avatar
        // w-8 (32) + gap-3 (12) = 56px.
        <div className="pl-14 pr-3 pb-2 -mt-1.5">
          <RecipientDetails
            from={parseAddressList(m.from)[0] ?? { name: m.from, email: m.from }}
            to={parseAddressList(m.to)}
            cc={parseAddressList(m.cc)}
            date={m.date}
            selfEmail={accountAddress}
          />
        </div>
      )}

      {expanded && (
        <div className="px-3 pt-3 pb-3 flex flex-col gap-3 border-t">
          {m.isForwarded && (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-teal-600">
                <Forward size={13} />
                {(m.forwards?.length ?? 0) > 1
                  ? `You forwarded this message ${m.forwards!.length} times`
                  : 'You forwarded this message'}
              </div>
              {m.forwards && m.forwards.length > 0 && (
                <div className="pl-[18px] flex flex-col gap-0.5 text-muted-foreground">
                  {m.forwards.map((f, i) => {
                    const entry = (
                      <>
                        to{' '}
                        <span className="font-medium text-foreground">
                          {f.to || 'unknown recipient'}
                        </span>{' '}
                        · {formatForwardTime(f.at)}
                      </>
                    );
                    // Clickable → expands the full sent forward inline. Legacy
                    // rows (no stored id) stay as plain, non-clickable text.
                    if (!f.messageId) {
                      return <div key={i}>{entry}</div>;
                    }
                    const open = expandedForwardIds.has(f.messageId);
                    return (
                      <div key={i} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => onToggleForwardPreview(f.messageId!)}
                          className="flex items-center gap-1 text-left hover:text-foreground"
                        >
                          <ChevronRight
                            size={12}
                            className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                          />
                          <span>{entry}</span>
                        </button>
                        {open && (
                          <ForwardPreview
                            companyId={companyId}
                            messageId={f.messageId}
                            token={token}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {strip.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                Attachments ({strip.length})
              </div>
              <div className="flex flex-wrap gap-3">
                {strip.map((att) => (
                  // Keyed on the file's own identity, NOT `att.attachmentId` —
                  // Gmail regenerates that id on every threads.get, so keying on
                  // it remounted (and reset) every attachment on each 15s poll.
                  <AttachmentPreview
                    key={`${m.id}:${att.filename}:${att.size ?? 0}`}
                    url={emailAttachmentUrl(token ?? '', companyId, m.id, att, 'inline')}
                    downloadUrl={emailAttachmentUrl(token ?? '', companyId, m.id, att, 'attachment')}
                    mimeType={att.mimeType}
                    filename={att.filename}
                    size={att.size}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="border rounded-md overflow-hidden">
            {m.bodyHtml ? (
              <EmailBodyFrame
                html={injectBaseTarget(
                  rewriteInlineImages(m.bodyHtml, m.attachments ?? [], (att) =>
                    emailAttachmentUrl(token ?? '', companyId, m.id, att, 'inline'),
                  ),
                )}
              />
            ) : (
              <pre className="p-4 text-sm whitespace-pre-wrap font-sans">
                <Linkified text={m.bodyText ?? '(empty)'} />
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
