import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCheck, CheckCircle2, MailOpen, MessageSquareText, Phone, Printer,
  Reply, Send, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  MAX_MMS_FILES,
  MAX_MMS_UPLOAD_BYTES,
  MMS_ACCEPT,
  isMmsImageFile,
  smsMediaUrl,
  type SmsItem,
  type SmsMedia,
} from '@/api/phone';
import { useSmsThread } from '@/hooks/useSmsThread';
import { useSendSms } from '@/hooks/useSendSms';
import { useMarkPhoneItem } from '@/hooks/useMarkPhoneItem';
import { formatE164 } from '@/lib/phone';
import {
  formatEmailDate,
  openPrintWindow,
  escapeHtml,
  mergeAttachments,
} from '../message-utils';
import { AttachRow } from '../AttachRow';
import { FileDropOverlay } from '../ComposerBits';
import { useFileDrop } from '@/hooks/useFileDrop';
import { AttachmentChip } from '../AttachmentPreview';
import type { CompleteTarget, ItemKind } from './types';
import { makeIsFuture } from './thread-dim';
import { buildSmsReplyBody, smsQuoteCost, smsReplyBudget } from './sms-reply';
import { countCompletableUpTo } from './complete-until';

/**
 * A GSM-7 message fits 160 characters, 153 once it is split across segments; any
 * character outside that alphabet (an emoji, a curly quote) forces UCS-2, where the
 * numbers drop to 70 and 67. Getting this wrong understates the cost of a message by
 * more than half, so it is measured rather than assumed.
 */
const GSM7 = /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€\r\n]*$/;

function segmentsFor(text: string): { segments: number; unicode: boolean } {
  if (text.length === 0) return { segments: 0, unicode: false };
  const unicode = !GSM7.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return {
    segments: text.length <= single ? 1 : Math.ceil(text.length / multi),
    unicode,
  };
}

/**
 * One SMS conversation, frozen at the message that was clicked.
 *
 * Mirrors `ChatThreadView` deliberately: the spec's description of texting ("every
 * message comes in like a new message, and clicking it shows the conversation up to
 * that message") is exactly the behaviour chat already has. As there, the freeze is
 * CLIENT-side — the server returns the whole conversation and everything newer than
 * the anchor is dimmed, so a later message is visible but visibly later.
 *
 * `ChatBubble` is still not reused, though half the original reason has expired now that
 * a text can quote a message. What remains is enough: it is built around `ChatMessage`'s
 * sender names and attachments, and around a STRUCTURAL quote resolved against the loaded
 * thread. An SMS quote is neither of those — it is plain text prepended to the body,
 * because SMS has no native quoting and nothing about a text is stored on our side (see
 * `sms-reply.ts`). A small bubble of its own is still less code than the props it would
 * take to neuter that one.
 */
export function SmsThreadView({
  companyId,
  peer,
  anchorMsgId,
  anchorTime,
  supportNumber,
  isCompleted,
  active,
  onClose,
  onCall,
  callBlockedReason = null,
  onRequestComplete,
  onUncomplete,
  onCompleteUntil,
}: {
  companyId: number;
  peer: string;
  /** The clicked message. Empty when the thread was opened by sending a new text. */
  anchorMsgId: string;
  anchorTime: string;
  supportNumber: string | null;
  isCompleted: boolean;
  active: boolean;
  onClose: () => void;
  onCall: (number: string) => void;
  /** Set while this company's line is on a call: Call is disabled. Texting is not. */
  callBlockedReason?: string | null;
  onRequestComplete: (target: CompleteTarget) => void;
  onUncomplete: (kind: ItemKind, id: string) => void;
  /**
   * "Complete till here" — the anchor's id, and how many messages that covers.
   *
   * The count is computed HERE because this is where the conversation is loaded; the tab
   * only holds inbox rows. It is an estimate for the dialog's wording — the server does
   * the real cut and reports what it actually changed.
   */
  onCompleteUntil: (itemId: string, count: number) => void;
}) {
  const { data, isLoading } = useSmsThread(companyId, peer, active);
  /**
   * The saved contact's name for this thread, read off whichever message carries it.
   *
   * Taken from the rows rather than a second lookup: every row in a thread has the same
   * counterparty by construction, so the first one that has a name has the name. Null
   * until the thread loads, which is why the number stays the fallback everywhere.
   */
  const peerName =
    data?.messages.find((m) => m.counterpartyName)?.counterpartyName ?? null;
  const sendMutation = useSendSms(companyId);
  const markUnread = useMarkPhoneItem(companyId, 'unread');

  const [draft, setDraft] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorVisible, setAnchorVisible] = useState(true);

  const messages: SmsItem[] = data?.messages ?? [];
  // Your own replies stay bright until the customer writes again — see `thread-dim.ts`
  // for why, and for what `ChatThreadView` does instead where a quote exists.
  const isFuture = makeIsFuture(messages, anchorTime);

  // Jump to the clicked message once the thread paints. Depends on the loaded count
  // so it re-runs when the messages actually arrive, not merely on mount.
  useLayoutEffect(() => {
    if (!active || messages.length === 0) return;
    anchorRef.current?.scrollIntoView({ block: 'end' });
  }, [active, messages.length]);

  // Drives the "Back to message" affordance — only useful once it is off screen.
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setAnchorVisible(e.isIntersecting), {
      root: el.closest('.overflow-y-auto') as HTMLElement | null,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [messages.length]);

  /**
   * The message this reply quotes.
   *
   * `undefined` means "not chosen yet", which resolves to the ANCHOR — the message the
   * user opened, and the one the thread is frozen at. `null` means they cleared it, which
   * is how a plain non-reply is sent from inside a conversation. The two cannot be one
   * value: without the distinction, clearing the quote would immediately fall back to the
   * anchor again and the X would do nothing.
   */
  const [quotePick, setQuotePick] = useState<SmsItem | null | undefined>(undefined);
  const anchorMessage = messages.find((m) => m.id === anchorMsgId) ?? null;
  const quoted = quotePick === undefined ? anchorMessage : quotePick;

  // Assembled here rather than on the server so the counter below is the truth: the
  // quote is part of the message the customer receives, and it is billed as such.
  const outgoing = buildSmsReplyBody(quoted?.body, draft);
  const { segments, unicode } = segmentsFor(outgoing);

  /**
   * Pictures and clips to send with this text.
   *
   * The per-file cap here is generous because the SERVER shrinks rather than refuses — a
   * camera photo is 3-8 MB as a matter of course, and a limit that rejected those would
   * make the feature unusable. What the server enforces is the message budget a carrier
   * will actually deliver, which is much smaller and is reached by re-encoding.
   */
  const [attached, setAttached] = useState<File[]>([]);
  const [attachNotice, setAttachNotice] = useState<string | null>(null);

  /**
   * The ONE way a file gets attached — the paperclip, a paste, and a drop all land here.
   *
   * `isMmsImageFile` is the filter rather than the input's `accept`, because `accept`
   * only governs the picker: a pasted screenshot or a dragged PDF never sees it. A
   * rejected file is named in the notice rather than vanishing.
   */
  const addFiles = (picked: FileList | File[] | null) => {
    if (!picked) return;
    const { files, notice } = mergeAttachments(
      attached,
      Array.from(picked),
      MAX_MMS_FILES,
      MAX_MMS_UPLOAD_BYTES,
      isMmsImageFile,
    );
    setAttached(files);
    setAttachNotice(notice);
  };

  // Paste and drag-and-drop, from the same hook the email composers use.
  const { isOver, handlers } = useFileDrop({ onFiles: addFiles });

  const handleSend = () => {
    const body = outgoing.trim();
    // A picture with no words is an ordinary message — the text is only required when
    // there is nothing else in it.
    if (!draft.trim() && attached.length === 0) return;
    sendMutation.mutate(
      { to: peer, body, attachments: attached },
      {
        onSuccess: () => {
          setDraft('');
          setAttached([]);
          setAttachNotice(null);
          // Back to quoting the anchor, not to nothing: the next message is still a
          // reply in the same conversation.
          setQuotePick(undefined);
        },
      },
    );
  };

  const handlePrint = () => {
    const title = `Texts with ${peerName || formatE164(peer)}`;
    openPrintWindow(
      title,
      `<h2>${escapeHtml(title)}</h2>` +
        messages
          .map(
            (m) =>
              `<p><strong>${escapeHtml(
                m.direction === 'outbound' ? 'Us' : formatE164(m.counterparty),
              )}</strong> — ${escapeHtml(formatEmailDate(m.at))}<br/>${escapeHtml(m.body)}</p>`,
          )
          .join(''),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="gap-1">
            <ArrowLeft size={14} /> Back
          </Button>
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 gap-1"
          >
            <MessageSquareText size={11} /> Text
          </Badge>
          <span className="text-sm font-semibold">
            {peerName || formatE164(peer)}
          </span>
          {peerName && (
            // Keep the number readable: it is what somebody dials from another phone.
            <span className="text-xs text-muted-foreground">{formatE164(peer)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span title={callBlockedReason ?? undefined}>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={!!callBlockedReason}
              onClick={() => onCall(peer)}
            >
              <Phone size={13} /> Call
            </Button>
          </span>
          <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint}>
            <Printer size={13} /> Print
          </Button>
          {anchorMsgId && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => {
                markUnread.mutate(anchorMsgId);
                onClose();
              }}
            >
              <MailOpen size={13} /> Mark as unread
            </Button>
          )}
          {anchorMsgId && (
            <Button
              size="sm"
              variant="outline"
              className={
                isCompleted
                  ? 'gap-1 border-blue-300 text-blue-700 hover:bg-blue-50'
                  : 'gap-1'
              }
              onClick={() =>
                isCompleted
                  ? onUncomplete('sms', anchorMsgId)
                  : onRequestComplete({ kind: 'sms', id: anchorMsgId, fromDetail: true })
              }
            >
              <CheckCircle2 size={13} />
              {isCompleted ? 'Completed' : 'Mark complete'}
            </Button>
          )}
        </div>
      </div>

      {/* Conversation */}
      <Card className="p-4">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages with this number yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <SmsBubble
                key={m.id}
                message={m}
                dimmed={isFuture(m)}
                anchorRef={m.id === anchorMsgId ? anchorRef : undefined}
                onReply={() => setQuotePick(m)}
                onCompleteUntil={() =>
                  onCompleteUntil(
                    m.id,
                    // A text you SENT is completable — the shared table has no
                    // direction — so nothing is marked `isOwn` here.
                    countCompletableUpTo(messages, m.id),
                  )
                }
              />
            ))}
          </div>
        )}
      </Card>

      {/* Anchor is off screen — offer a way back to the message that was opened. */}
      {!anchorVisible && anchorMsgId && messages.length > 0 && (
        <button
          type="button"
          onClick={() => anchorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 rounded-full border bg-background px-3 py-1.5 text-xs shadow-lg hover:bg-muted"
        >
          Back to message
        </button>
      )}

      {/* Reply */}
      {/* The drop/paste target is the whole composer, so a screenshot can be pasted with
          the cursor anywhere in it rather than only inside the textarea. */}
      <div
        {...handlers}
        className="relative border rounded-md p-4 flex flex-col gap-3 bg-muted/10"
      >
        {isOver && <FileDropOverlay label="Drop a picture to attach" />}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Reply to {peerName || formatE164(peer)}
          {supportNumber && ` from ${formatE164(supportNumber)}`}
        </p>
        {/* The quoted message, removable. SMS has no native quoting, so this text really
            is prepended to the body the customer receives — which is why its cost shows
            in the counter below. Clearing it sends a plain message. */}
        {quoted && (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-amber-400 bg-amber-50/60 px-2.5 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-medium text-amber-900">
                Replying to {quoted.direction === 'outbound' ? 'your message' : 'their message'}
              </span>
              <p className="line-clamp-2 text-muted-foreground">
                {quoted.body || '(no text)'}
              </p>
            </div>
            <button
              type="button"
              title="Remove quote"
              aria-label="Remove quote"
              onClick={() => setQuotePick(null)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-amber-100 hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
        )}
        {/* A plain textarea, NOT RichTextEditor: SMS carries no formatting, and the
            markdown/HTML conversion the chat composer does would be sent literally. */}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a text message…"
          rows={3}
          // The quote eats into the same 1600 the server enforces, so the budget shrinks
          // rather than letting someone write a message that cannot be sent whole.
          maxLength={smsReplyBudget(quoted?.body)}
        />

        {/* `cloudLabel={null}`: nothing here spills to a cloud drive. An attachment too
            big for a carrier is SHRUNK by the server, and only refused if that fails. */}
        <AttachRow
          files={attached}
          setFiles={setAttached}
          onPick={addFiles}
          notice={attachNotice}
          cloudLabel={null}
          accept={MMS_ACCEPT}
        />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {outgoing.length} characters
            {quoted && ` (${smsQuoteCost(quoted.body)} of them quoted)`}
            {segments > 0 && ` · ${segments} segment${segments === 1 ? '' : 's'}`}
            {unicode && ' · unicode (shorter segments)'}
            {/* The counter above is about the TEXT. A picture makes this an MMS, which is
                billed as one message whatever the body costs — saying so stops the segment
                count reading as the price of the whole thing. */}
            {attached.length > 0 && ' · sent as a picture message (MMS)'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              disabled={
                sendMutation.isPending ||
                (!draft.trim() && attached.length === 0)
              }
              onClick={handleSend}
            >
              <Send size={13} />
              {sendMutation.isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
        {sendMutation.isError && (
          <p className="text-xs text-destructive">
            {(sendMutation.error as Error)?.message ?? 'Failed to send'}
          </p>
        )}
      </div>
    </div>
  );
}

/** One message. Ours on the right, theirs on the left — the universal SMS idiom. */
function SmsBubble({
  message: m,
  dimmed,
  anchorRef,
  onReply,
  onCompleteUntil,
}: {
  message: SmsItem;
  dimmed: boolean;
  anchorRef?: React.Ref<HTMLDivElement>;
  /** Quote this message in the composer. */
  onReply: () => void;
  /** Complete this message and everything above it. */
  onCompleteUntil: () => void;
}) {
  const own = m.direction === 'outbound';
  return (
    <div
      ref={anchorRef}
      className={[
        'flex flex-col gap-1 transition-opacity',
        own ? 'items-end' : 'items-start',
        dimmed ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* The bubble and its hover action share a row — `ChatBubble`'s shape. Reversed for
          our own messages so the button stays on the inside edge rather than the margin. */}
      <div
        className={[
          'group/msg flex max-w-[75%] items-center gap-1.5',
          own ? 'flex-row-reverse' : '',
        ].join(' ')}
      >
        <div
          className={[
            'flex min-w-0 flex-col gap-2 rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
            own ? 'bg-teal-600 text-white' : 'bg-muted text-foreground',
          ].join(' ')}
        >
          {/* The attachments, above the text — the order every phone uses. `media` is
              present only in a thread; the inbox row still shows the count, because
              listing media costs a provider request per message. */}
          {m.media?.map((file) => (
            <SmsAttachment key={file.sid} media={file} messageSid={m.sid} />
          ))}
          {/* A picture with no words is an ordinary message, so it gets no placeholder
              text. The count is still the fallback when the bytes could not be listed. */}
          {m.body ||
            (m.media?.length
              ? null
              : m.numMedia > 0
                ? `(${m.numMedia} attachment${m.numMedia === 1 ? '' : 's'})`
                : '(no text)')}
        </div>
        <button
          type="button"
          title="Reply to this message"
          aria-label="Reply to this message"
          onClick={onReply}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
        >
          <Reply size={13} />
        </button>
        <button
          type="button"
          title="Mark everything up to here complete"
          aria-label="Mark everything up to here complete"
          onClick={onCompleteUntil}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-blue-700 focus-visible:opacity-100 group-hover/msg:opacity-100"
        >
          <CheckCheck size={13} />
        </button>
      </div>
      <span className="text-[10px] text-muted-foreground">
        {formatEmailDate(m.at)}
        {/* A failed text looks identical to a sent one without this. */}
        {m.errorCode !== null && (
          <span className="ml-1 text-destructive">· failed ({m.errorCode})</span>
        )}
      </span>
    </div>
  );
}

/**
 * One MMS attachment.
 *
 * Images render inline, because that is what the message IS — a text with a photo in it
 * reading "(1 attachment)" is the bug this replaces. Everything else (a clip, a vCard) gets
 * the same chip the email and WhatsApp threads use, so a sender's odd file type degrades to
 * a download rather than a broken element.
 *
 * The URL is our own proxy, never SignalWire's: the provider serves message media with no
 * authentication at all, so its URL is a permanent public link to a client's photo.
 */
function SmsAttachment({
  media,
  messageSid,
}: {
  media: SmsMedia;
  messageSid: string;
}) {
  const url = smsMediaUrl(media, messageSid);
  const download = smsMediaUrl(media, messageSid, { download: true });

  if (media.contentType.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt="Attachment"
          loading="lazy"
          className="max-h-64 w-auto max-w-full rounded-lg object-contain"
        />
      </a>
    );
  }
  if (media.contentType.startsWith('audio/')) {
    return <audio controls src={url} className="max-w-full" />;
  }
  if (media.contentType.startsWith('video/')) {
    return <video controls src={url} className="max-h-64 max-w-full rounded-lg" />;
  }
  return (
    <AttachmentChip
      url={url}
      downloadUrl={download}
      mimeType={media.contentType}
      filename={`attachment${extensionHint(media.contentType)}`}
    />
  );
}

/** A friendly-looking suffix for a chip's label; the real name is the server's business. */
function extensionHint(contentType: string): string {
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === 'text/vcard' || base === 'text/x-vcard') return '.vcf';
  if (base === 'application/pdf') return '.pdf';
  return '';
}
