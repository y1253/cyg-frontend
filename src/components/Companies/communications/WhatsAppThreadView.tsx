import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, CheckCheck, CheckCircle2, Clock, MailOpen, MessageCircle,
  Mic, Phone, Printer, Reply, Send, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  WHATSAPP_CAPTION_LIMIT,
  fileAcceptsCaption,
  formatVoiceDuration,
  formatWhatsAppNumber,
  whatsappMediaUrl,
  whatsappPreviewText,
  type WhatsAppItem,
} from '@/api/whatsapp';
import { useWhatsAppThread } from '@/hooks/useWhatsAppThread';
import { useSendWhatsApp } from '@/hooks/useSendWhatsApp';
import { useSendWhatsAppVoice } from '@/hooks/useSendWhatsAppVoice';
import { useSendWhatsAppMedia } from '@/hooks/useSendWhatsAppMedia';
import { useSendWhatsAppTemplate } from '@/hooks/useSendWhatsAppTemplate';
import { useMarkWhatsAppItem } from '@/hooks/useMarkWhatsAppItem';
import { AttachmentChip } from '../AttachmentPreview';
import { AttachRow } from '../AttachRow';
import { FileDropOverlay, UploadProgressBar } from '../ComposerBits';
import { useFileDrop } from '@/hooks/useFileDrop';
import { mergeAttachments } from '../message-utils';
import { escapeHtml, formatEmailDate, openPrintWindow } from '../message-utils';
import { VoiceRecorder } from './VoiceRecorder';
import { TemplatePicker } from './TemplatePicker';
import { makeIsFuture } from './thread-dim';
import { countCompletableUpTo } from './complete-until';
import type { CompleteTarget, ItemKind } from './types';

/**
 * One WhatsApp conversation, frozen at the message that was clicked.
 *
 * `SmsThreadView`'s architecture exactly: every message is its own inbox row, and opening
 * one shows the whole conversation with everything NEWER than it dimmed — the freeze is
 * client-side, the server returns the full thread.
 *
 * What differs is WhatsApp's own rules: media and voice notes in the bubbles, delivery
 * ticks, and the 24-hour window outside which Meta refuses a free-form reply.
 */
export function WhatsAppThreadView({
  companyId,
  token,
  peer,
  anchorMsgId,
  anchorTime,
  isCompleted,
  onCompleteUntil,
  active,
  onClose,
  onCall,
  callBlockedReason = null,
  onRequestComplete,
  onUncomplete,
}: {
  companyId: number;
  token: string | null;
  peer: string;
  /** The clicked message. Empty when opened without one (the thread opens at its end). */
  anchorMsgId: string;
  anchorTime: string;
  isCompleted: boolean;
  active: boolean;
  onClose: () => void;
  /** Absent when the company has no support number to call from. */
  onCall?: (number: string) => void;
  callBlockedReason?: string | null;
  onRequestComplete: (target: CompleteTarget) => void;
  onUncomplete: (kind: ItemKind, id: string) => void;
  /** "Complete till here" — the anchor's id and how many messages that covers. */
  onCompleteUntil: (messageId: number, count: number) => void;
}) {
  const { data, isLoading } = useWhatsAppThread(companyId, peer, active);
  const sendText = useSendWhatsApp(companyId);
  const sendVoice = useSendWhatsAppVoice(companyId);
  const sendFile = useSendWhatsAppMedia(companyId);
  const markUnread = useMarkWhatsAppItem(companyId, 'unread');

  const [draft, setDraft] = useState('');
  // The closed-window branch: a template is the only thing Meta will accept there.
  const sendTemplate = useSendWhatsAppTemplate(companyId);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [picked, setPicked] = useState<
    { name: string; language: string; variables: string[] } | null
  >(null);
  // Stable, or `TemplatePicker`'s reporting effect re-runs on every render here.
  const handlePicked = useCallback(
    (next: { name: string; language: string; variables: string[] } | null) =>
      setPicked(next),
    [],
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorVisible, setAnchorVisible] = useState(true);

  const messages: WhatsAppItem[] = data?.messages ?? [];
  const peerName = data?.peerName ?? null;
  const title = peerName || formatWhatsAppNumber(peer);
  // Your own replies stay bright until the customer writes again — see `thread-dim.ts`.
  const isFuture = makeIsFuture(messages, anchorTime);

  // The clock the 24h window is judged against, ticking so the composer closes on its own
  // when the window lapses mid-view rather than only after the next poll re-renders.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const windowOpen =
    !!data?.windowOpenUntil && new Date(data.windowOpenUntil).getTime() > now;
  const canReply = !!data?.connected && windowOpen;

  useLayoutEffect(() => {
    if (!active || messages.length === 0) return;
    anchorRef.current?.scrollIntoView({ block: 'end' });
  }, [active, messages.length]);

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
   * The message this reply quotes — `undefined` = not chosen, so it falls back to the
   * ANCHOR the thread is frozen at; `null` = explicitly cleared, i.e. a plain message.
   * Collapsing the two would make the X on the chip do nothing.
   */
  const [quotePick, setQuotePick] = useState<WhatsAppItem | null | undefined>(
    undefined,
  );
  const anchorMessage = messages.find((m) => m.id === anchorMsgId) ?? null;
  const quoted = quotePick === undefined ? anchorMessage : quotePick;

  // The server resolves a quote to OUR id when the original is in the same page; this
  // turns that id back into the message so a bubble can show it. Built once per render
  // rather than once per bubble — and deliberately NOT memoized: `messages` is
  // `data?.messages ?? []`, a fresh array every render, so a `useMemo` on it would never
  // hit while blocking the React Compiler from optimizing the component at all.
  const byMessageId = new Map(messages.map((m) => [m.messageId, m]));
  const quotedOf = (m: WhatsAppItem) =>
    m.replyToMessageId === null
      ? null
      : (byMessageId.get(m.replyToMessageId) ?? null);

  /**
   * One attachment per message, not many.
   *
   * WhatsApp has no multi-attachment message — N files would be N separate sends, N rows
   * and N chances to half-fail. Capping at one also matches what the composer already does
   * with the voice recorder, which is mutually exclusive with typing.
   */
  const [attached, setAttached] = useState<File[]>([]);
  const [attachNotice, setAttachNotice] = useState<string | null>(null);
  const file = attached[0] ?? null;
  // Caption support is Meta's rule, not ours: audio and stickers silently discard one, so
  // the field says so rather than letting somebody type a sentence that never arrives.
  const captionAllowed = file ? fileAcceptsCaption(file) : true;
  const captionLimit = file ? WHATSAPP_CAPTION_LIMIT : 4096;

  /** The paperclip, a paste and a drop all land here — one set of limits, one notice. */
  const addFiles = (picked: FileList | File[] | null) => {
    if (!picked) return;
    const incoming = Array.from(picked);
    const { files, notice } = mergeAttachments(attached, incoming, 1);
    setAttached(files);
    setAttachNotice(
      notice ??
        (incoming.length > 1 || attached.length
          ? 'WhatsApp sends one file per message.'
          : null),
    );
  };

  const { isOver, handlers } = useFileDrop({ onFiles: addFiles });

  const handleSendFile = () => {
    if (!file) return;
    const caption = captionAllowed ? draft.trim() : '';
    sendFile.mutate(
      { to: peer, file, caption, replyToMessageId: quoted?.messageId },
      {
        onSuccess: () => {
          setDraft('');
          setAttached([]);
          setAttachNotice(null);
          setQuotePick(undefined);
        },
      },
    );
  };

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    sendText.mutate(
      // Unlike SMS this is a NATIVE quote: the id goes on the wire and Meta renders the
      // quoted bubble in the customer's own WhatsApp. Nothing is prepended to the text.
      { to: peer, body, replyToMessageId: quoted?.messageId },
      {
        onSuccess: () => {
          setDraft('');
          setQuotePick(undefined);
        },
      },
    );
  };

  const handlePrint = () => {
    const heading = `WhatsApp with ${title}`;
    openPrintWindow(
      heading,
      `<h2>${escapeHtml(heading)}</h2>` +
        messages
          .map(
            (m) =>
              `<p><strong>${escapeHtml(
                m.direction === 'outbound' ? 'Us' : title,
              )}</strong> — ${escapeHtml(formatEmailDate(m.at))}<br/>${escapeHtml(
                whatsappPreviewText(m),
              )}</p>`,
          )
          .join(''),
    );
  };

  const sendError = (sendText.error ??
    sendVoice.error ??
    sendFile.error) as Error | null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="gap-1">
            <ArrowLeft size={14} /> Back
          </Button>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
            <MessageCircle size={11} /> WhatsApp
          </Badge>
          <span className="text-sm font-semibold">{title}</span>
          {peerName && (
            <span className="text-xs text-muted-foreground">{formatWhatsAppNumber(peer)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCall && (
            <span title={callBlockedReason ?? undefined}>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={!!callBlockedReason}
                onClick={() => onCall(`+${peer}`)}
              >
                <Phone size={13} /> Call
              </Button>
            </span>
          )}
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
              className={isCompleted ? 'gap-1 border-blue-300 text-blue-700 hover:bg-blue-50' : 'gap-1'}
              onClick={() =>
                isCompleted
                  ? onUncomplete('whatsapp', anchorMsgId)
                  : onRequestComplete({ kind: 'whatsapp', id: anchorMsgId, fromDetail: true })
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
            No WhatsApp messages with this number yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <WhatsAppBubble
                key={m.id}
                onReply={() => setQuotePick(m)}
                onCompleteUntil={() =>
                  onCompleteUntil(
                    // The numeric row id — what the server's keyset cut is keyed on.
                    Number(m.id),
                    // `isOwn` on outbound: WhatsApp's `setState` refuses to change an
                    // outbound row, so counting it would overstate what happens.
                    countCompletableUpTo(
                      messages.map((x) => ({
                        id: String(x.id),
                        at: x.at,
                        isCompleted: x.isCompleted,
                        isOwn: x.direction === 'outbound',
                      })),
                      String(m.id),
                    ),
                  )
                }
                quotedOf={quotedOf}
                message={m}
                token={token}
                dimmed={isFuture(m)}
                anchorRef={m.id === anchorMsgId ? anchorRef : undefined}
              />
            ))}
          </div>
        )}
      </Card>

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
      {/* Drop/paste target is the whole composer — see the SMS view for why. */}
      <div
        {...handlers}
        className="relative border rounded-md p-4 flex flex-col gap-3 bg-muted/10"
      >
        {isOver && <FileDropOverlay label="Drop a file to attach" />}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Reply to {title} on WhatsApp
        </p>

        {!isLoading && data && !data.connected ? (
          <p className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            No WhatsApp number is connected to this company, so replies cannot be sent. An
            admin can connect one on the Details tab.
          </p>
        ) : !isLoading && data && !windowOpen ? (
          // The window has shut, so a template is the only thing that will send. This
          // used to be the end of the road ("templates are not supported here yet") —
          // it is now the second home of the compose dialog's picker.
          <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-xs text-amber-900">
              <Clock size={14} className="mt-0.5 shrink-0" />
              {data.windowOpenUntil
                ? 'The 24-hour reply window is closed. WhatsApp only allows an approved template until the customer writes again.'
                : 'This customer has not messaged this number yet. WhatsApp only allows an approved template as the first message.'}
            </p>
            {templateOpen ? (
              <>
                <TemplatePicker
                  companyId={companyId}
                  enabled
                  onChange={handlePicked}
                />
                {sendTemplate.isError && (
                  <p className="text-xs text-destructive">
                    {(sendTemplate.error as Error)?.message ?? 'Failed to send'}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTemplateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={!picked || sendTemplate.isPending}
                    onClick={() =>
                      picked &&
                      sendTemplate.mutate(
                        { to: peer, ...picked },
                        { onSuccess: () => setTemplateOpen(false) },
                      )
                    }
                  >
                    <Send size={13} />
                    {sendTemplate.isPending ? 'Sending…' : 'Send template'}
                  </Button>
                </div>
              </>
            ) : (
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-100"
                  onClick={() => setTemplateOpen(true)}
                >
                  <MessageCircle size={13} /> Send a template
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* The quoted message, removable. Unlike the SMS chip this costs the body
                nothing — Meta carries the quote structurally and renders it in the
                customer's app. Clearing it sends a plain message. */}
            {quoted && (
              <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-emerald-400 bg-emerald-50/60 px-2.5 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-emerald-900">
                    Replying to{' '}
                    {quoted.direction === 'outbound' ? 'your message' : title}
                  </span>
                  <p className="line-clamp-2 text-muted-foreground">
                    {quoted.body || whatsappBubblePreview(quoted)}
                  </p>
                </div>
                <button
                  type="button"
                  title="Remove quote"
                  aria-label="Remove quote"
                  onClick={() => setQuotePick(null)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-emerald-100 hover:text-foreground"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {/* Plain text: WhatsApp formatting is its own *markup*, which a rich editor
                would send literally. */}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                file
                  ? captionAllowed
                    ? 'Add a caption…'
                    : 'WhatsApp shows no caption on this kind of file'
                  : 'Write a WhatsApp message…'
              }
              rows={3}
              maxLength={captionLimit}
              disabled={!canReply || (!!file && !captionAllowed)}
            />

            {/* The picked file, with the same chips the email and internal composers use.
                `cloudLabel={null}` suppresses the "sent as Drive link" badge: nothing here
                ever spills to a cloud drive — Meta stores the media itself. */}
            <AttachRow
              files={attached}
              setFiles={setAttached}
              onPick={addFiles}
              notice={attachNotice}
              cloudLabel={null}
            />

            <div className="flex items-start justify-between gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {draft.length} / {captionLimit}
                {data?.windowOpenUntil && (
                  <> · reply window open until {formatEmailDate(data.windowOpenUntil)}</>
                )}
              </span>
              <div className="flex items-start gap-2">
                {/* The recorder is for when there is nothing else to send — it is a
                    third way to fill the same message, so it hides as soon as either
                    of the other two is in play. */}
                {!draft.trim() && !file && (
                  <VoiceRecorder
                    disabled={!canReply}
                    sending={sendVoice.isPending}
                    uploadProgress={sendVoice.uploadProgress}
                    onSend={(recording, filename) =>
                      sendVoice.mutateAsync({ to: peer, recording, filename })
                    }
                  />
                )}
                {file && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    disabled={sendFile.isPending || !canReply}
                    onClick={handleSendFile}
                  >
                    <Send size={13} />
                    {sendFile.isPending ? 'Sending…' : 'Send file'}
                  </Button>
                )}
                {!file && draft.trim() && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    disabled={sendText.isPending || !canReply}
                    onClick={handleSend}
                  >
                    <Send size={13} />
                    {sendText.isPending ? 'Sending…' : 'Send'}
                  </Button>
                )}
              </div>
            </div>
            {sendFile.uploadProgress !== null && (
              <UploadProgressBar progress={sendFile.uploadProgress} />
            )}
          </>
        )}

        {sendError && (
          <p className="text-xs text-destructive">{sendError.message ?? 'Failed to send'}</p>
        )}
      </div>
    </div>
  );
}

/** Delivery ticks, WhatsApp's own idiom: one grey, two grey, two blue. */
function DeliveryTicks({ message: m }: { message: WhatsAppItem }) {
  if (m.direction !== 'outbound' || !m.status) return null;
  switch (m.status) {
    case 'sent':
      return <Check size={12} className="inline text-muted-foreground" aria-label="Sent" />;
    case 'delivered':
      return <CheckCheck size={12} className="inline text-muted-foreground" aria-label="Delivered" />;
    case 'read':
      return <CheckCheck size={12} className="inline text-sky-500" aria-label="Read" />;
    case 'failed':
      return (
        <span className="inline-flex items-center gap-0.5 text-destructive">
          <AlertCircle size={11} /> Not delivered{m.errorCode ? ` (${m.errorCode})` : ''}
        </span>
      );
  }
}

function MediaUnavailable({ message: m }: { message: WhatsAppItem }) {
  const label = whatsappPreviewText({ type: m.type, body: null, isVoice: m.isVoice });
  return (
    <span className="italic opacity-80">
      {m.mediaStatus === 'failed' ? `${label} unavailable` : `${label} — downloading…`}
    </span>
  );
}

function BubbleContent({ message: m, token }: { message: WhatsAppItem; token: string | null }) {
  const ready = m.mediaStatus === 'ready' && !!token;
  const caption = m.body ? <span className="whitespace-pre-wrap break-words">{m.body}</span> : null;

  switch (m.type) {
    case 'audio':
      return ready ? (
        <div className="flex min-w-[16rem] flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-medium opacity-80">
            <Mic size={12} />
            {m.isVoice ? 'Voice message' : 'Audio'}
            {m.durationSec != null && ` · ${formatVoiceDuration(m.durationSec)}`}
          </span>
          {/* The mp3 made on the server; plays in every browser, and Range makes it seekable. */}
          <audio
            controls
            preload="metadata"
            src={whatsappMediaUrl(token, m.messageId, { playback: true })}
            className="h-9 w-full"
          />
        </div>
      ) : (
        <MediaUnavailable message={m} />
      );
    case 'image':
    case 'sticker':
      return ready ? (
        <div className="flex flex-col gap-1">
          <a href={whatsappMediaUrl(token, m.messageId)} target="_blank" rel="noreferrer">
            <img
              src={whatsappMediaUrl(token, m.messageId)}
              alt={caption ? (m.body ?? '') : m.type === 'sticker' ? 'Sticker' : 'Photo'}
              className={m.type === 'sticker' ? 'h-32 w-32 object-contain' : 'max-h-72 rounded-lg'}
            />
          </a>
          {caption}
        </div>
      ) : (
        <MediaUnavailable message={m} />
      );
    case 'video':
      return ready ? (
        <div className="flex flex-col gap-1">
          <video
            controls
            preload="metadata"
            src={whatsappMediaUrl(token, m.messageId)}
            className="max-h-72 rounded-lg"
          />
          {caption}
        </div>
      ) : (
        <MediaUnavailable message={m} />
      );
    case 'document':
      return ready ? (
        <div className="flex flex-col gap-1">
          <AttachmentChip
            url={whatsappMediaUrl(token, m.messageId)}
            downloadUrl={whatsappMediaUrl(token, m.messageId, { download: true })}
            mimeType={m.mimeType ?? 'application/octet-stream'}
            filename={m.filename ?? 'Document'}
          />
          {caption}
        </div>
      ) : (
        <MediaUnavailable message={m} />
      );
    default:
      return (
        <span className={m.body ? 'whitespace-pre-wrap break-words' : 'italic opacity-80'}>
          {whatsappPreviewText(m)}
        </span>
      );
  }
}

/** One message. Ours on the right, theirs on the left. */
/** A one-line stand-in for a message with no text of its own. Local: exporting it from a
 *  component file breaks fast refresh. */
function whatsappBubblePreview(m: WhatsAppItem): string {
  if (m.isVoice) return 'Voice message';
  if (m.hasMedia) return m.filename ?? 'Attachment';
  return '(no text)';
}

function WhatsAppBubble({
  message: m,
  token,
  dimmed,
  anchorRef,
  onReply,
  onCompleteUntil,
  quotedOf,
}: {
  message: WhatsAppItem;
  token: string | null;
  dimmed: boolean;
  anchorRef?: React.Ref<HTMLDivElement>;
  /** Quote this message in the composer. */
  onReply: () => void;
  /** Complete this message and everything above it. */
  onCompleteUntil: () => void;
  /** Resolve `replyToMessageId` against the loaded thread. */
  quotedOf: (m: WhatsAppItem) => WhatsAppItem | null;
}) {
  const own = m.direction === 'outbound';
  const quoted = quotedOf(m);
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
          our own messages so the button sits on the inside edge, not the margin. */}
      <div
        className={[
          'group/msg flex max-w-[75%] items-center gap-1.5',
          own ? 'flex-row-reverse' : '',
        ].join(' ')}
      >
        <div
          className={[
            'min-w-0 rounded-2xl px-3 py-2 text-sm',
            own ? 'bg-emerald-100 text-emerald-950' : 'bg-muted text-foreground',
          ].join(' ')}
        >
          {/* The quoted original, above the reply — what WhatsApp itself draws. A quote
              whose target is outside the loaded page degrades to a label rather than
              costing a lookup per bubble, the same trade `ChatBubble` makes. */}
          {m.replyToMessageId !== null && (
            <div
              className={[
                'mb-1.5 border-l-2 pl-2 text-xs',
                own ? 'border-emerald-500/60' : 'border-muted-foreground/40',
              ].join(' ')}
            >
              {quoted ? (
                <span className="line-clamp-2 opacity-70">
                  {quoted.body || whatsappBubblePreview(quoted)}
                </span>
              ) : (
                <span className="italic opacity-60">Quoted a message</span>
              )}
            </div>
          )}
          <BubbleContent message={m} token={token} />
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
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {formatEmailDate(m.at)}
        <DeliveryTicks message={m} />
      </span>
    </div>
  );
}
