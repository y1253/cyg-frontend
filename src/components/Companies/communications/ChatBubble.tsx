import { Reply } from 'lucide-react';
import type { ChatMessage } from '@/api/gmail';
import { chatAttachmentUrl } from '@/api/gmail';
import { AttachmentPreview } from '../AttachmentPreview';
import { Linkified } from '../Linkified';
import { formatEmailDate } from '../message-utils';

/**
 * One message in a chat conversation.
 *
 * Rendered twice for some messages: once in its chronological place, and once
 * "surfaced" — my own later reply pulled up next to the message it answers so a
 * just-sent reply isn't buried among dimmed future activity. `surfaced` swaps the
 * timestamp for "Your reply" and suppresses the per-message reply affordance.
 */
export function ChatBubble({
  message: m,
  messages,
  dimmed,
  isAnchor,
  anchorRef,
  hideQuote,
  surfaced,
  companyId,
  token,
  onNavigateToMessage,
}: {
  message: ChatMessage;
  /** The loaded thread, used to resolve a quoted message into a preview. */
  messages: ChatMessage[];
  dimmed: boolean;
  isAnchor: boolean;
  /** Attached only to the chronological copy of the anchor. */
  anchorRef?: React.Ref<HTMLDivElement>;
  hideQuote: boolean;
  surfaced?: boolean;
  companyId: number;
  token: string | null;
  onNavigateToMessage: (m: ChatMessage) => void;
}) {
  const quoted =
    !hideQuote && m.quotedMessageName
      ? messages.find((q) => q.id === m.quotedMessageName)
      : null;

  return (
    <div
      ref={anchorRef}
      className={`flex flex-col gap-1 transition-opacity ${m.isOwn ? 'items-end' : 'items-start'} ${dimmed ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2">
        {!m.isOwn && (
          <div className="shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-semibold">
            {(m.sender[0] ?? '?').toUpperCase()}
          </div>
        )}
        <span className="text-xs font-medium text-foreground/80">{m.isOwn ? 'You' : m.sender}</span>
        <span className="text-[11px] text-muted-foreground">
          {surfaced ? 'Your reply' : formatEmailDate(m.createTime)}
        </span>
      </div>
      <div className={`flex items-center gap-1.5 group/msg max-w-full ${m.isOwn ? 'flex-row-reverse' : ''}`}>
        <div
          className={`max-w-[75%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
            m.isOwn ? 'bg-teal-600 text-white' : 'ml-8 bg-background border'
          } ${isAnchor ? 'ring-2 ring-purple-400 ring-offset-1' : ''} ${
            surfaced ? 'border-l-4 border-l-teal-300' : ''
          }`}
        >
          {/* Quoted-message preview — click to navigate to the original message */}
          {!hideQuote && m.quotedMessageName && (
            <div
              role={quoted ? 'button' : undefined}
              title={quoted ? 'Go to this message' : undefined}
              onClick={quoted ? () => onNavigateToMessage(quoted) : undefined}
              className={`mb-1.5 border-l-2 pl-2 text-xs ${
                m.isOwn ? 'border-white/60 text-white/80' : 'border-purple-300 text-muted-foreground'
              } ${quoted ? 'cursor-pointer hover:opacity-80' : ''}`}
            >
              {quoted ? (
                <>
                  <span className="font-medium">{quoted.isOwn ? 'You' : quoted.sender}</span>
                  <span className="line-clamp-2">{quoted.text || '(no text)'}</span>
                </>
              ) : (
                <span className="italic">Quoted a message</span>
              )}
            </div>
          )}
          {m.text ? (
            // Own bubbles are teal with white text, where the default blue link
            // is unreadable — hand those their own anchor styling.
            <Linkified
              text={m.text}
              className={
                m.isOwn
                  ? 'underline decoration-white/70 hover:decoration-white'
                  : 'text-blue-600 underline hover:text-blue-700'
              }
            />
          ) : m.attachments && m.attachments.length > 0 ? (
            ''
          ) : (
            '(empty message)'
          )}
          {m.attachments && m.attachments.length > 0 && (
            <div className={`flex flex-col gap-2 ${m.text ? 'mt-2' : ''}`}>
              {m.attachments.map((att) =>
                att.resourceName ? (
                  <AttachmentPreview
                    key={att.name}
                    url={chatAttachmentUrl(token ?? '', companyId, att, 'inline')}
                    downloadUrl={chatAttachmentUrl(token ?? '', companyId, att, 'attachment')}
                    mimeType={att.contentType}
                    filename={att.contentName}
                  />
                ) : att.driveFileId ? (
                  <AttachmentPreview
                    key={att.name}
                    mimeType={att.contentType}
                    filename={att.contentName}
                    driveHref={`https://drive.google.com/file/d/${att.driveFileId}/view`}
                  />
                ) : att.downloadUri ? (
                  // Teams file references live in SharePoint/OneDrive — link out
                  // (we don't hold a Graph scope to stream their bytes).
                  <AttachmentPreview
                    key={att.name}
                    mimeType={att.contentType}
                    filename={att.contentName}
                    driveHref={att.downloadUri}
                  />
                ) : null,
              )}
            </div>
          )}
        </div>
        {/* Per-message Reply → navigate/re-anchor to this message, then reply there */}
        {!isAnchor && !surfaced && (
          <button
            type="button"
            title="Reply to this message"
            onClick={() => onNavigateToMessage(m)}
            className="shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <Reply size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
