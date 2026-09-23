import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { UntilAction } from '@/api/completeUntil';
import {
  Clock,
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
import { ANCHOR_RING } from './anchor-style';
import { mergePending, type PendingMeta } from './pending-sends';
import { usePendingSends } from '@/hooks/usePendingSends';
import { useTranslation } from '@/hooks/useTranslation';
import { TranslateControl } from './TranslatePanel';
import {
  PolishBudgetToggle,
  PolishButton,
  PolishPanel,
} from '../PolishPanel';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { smsBudget, threadPolishContext } from './polish-budget';
import { DictateButton } from '../DictateButton';
import { buildSmsReplyBody, smsQuoteCost, smsReplyBudget } from './sms-reply';
import { countMarkableUpTo } from './complete-until';

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
  onMarkUntil,
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
  onMarkUntil: (
    itemId: string,
    count: number,
    action: UntilAction,
  ) => void;
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
  const polish = useDraftPolish('sms');
  // Default ON: a text is billed per segment, so shortening is nearly always wanted.
  const [keepShort, setKeepShort] = useState(true);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorVisible, setAnchorVisible] = useState(true);

  const serverMessages: SmsItem[] = data?.messages ?? [];
  const sends = usePendingSends<SmsItem>();
  const translation = useTranslation();
  /**
   * What the conversation renders: the server's rows plus anything this browser is still
   * uploading. The query cache is left alone as the server's truth.
   */
  const messages = mergePending(
    serverMessages,
    sends.pending.map((p) => p.row),
  ) as (SmsItem & Partial<PendingMeta>)[];
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
   * ⚠️ A preview belongs to the conversation it was written for.
   *
   * This view is NOT keyed on `peer`, so switching conversations reuses the same
   * instance. Without this, a polished reply for one customer would still be sitting
   * there when the next thread opened, one Accept away from being pasted into it.
   */
  useEffect(() => {
    polish.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);

  const polishBudget = smsBudget(keepShort);
  const polishContext = threadPolishContext(
    messages.map((m) => ({
      isOwn: m.direction === 'outbound',
      from: m.counterpartyName ?? peer,
      text: m.body ?? '',
    })),
    'A text message conversation with a client.',
  );

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

  /**
   * Send, showing the message in the conversation IMMEDIATELY.
   *
   * The optimistic row is owned here, not written into the query cache — see
   * `pending-sends.ts` for why that would be wiped by the 15s poll and by SignalWire's
   * own list lag.
   *
   * ⚠️ The composer is cleared on the way IN, not in `onSuccess`. The message is already
   * on screen as a pending bubble, so leaving the text in the box would show it twice;
   * and a failed send keeps its bubble with a Retry rather than restoring the draft.
   */
  const submit = (body: string, files: File[]) => {
    const id = sends.add(
      (pendingId, previews) => ({
        id: pendingId,
        kind: 'sms' as const,
        direction: 'outbound' as const,
        counterparty: peer,
        // Not on the provider yet, so there is no SID. Nothing reads it for a pending row —
        // every action is guarded on `isPendingId` — and the empty string keeps the shape
        // honest about that rather than inventing something SID-looking.
        sid: '',
        supportNumber: data?.supportNumber ?? '',
        at: new Date().toISOString(),
        // Outbound is read and complete by construction, the same as a real sent row.
        isRead: true,
        isCompleted: true,
        body,
        numMedia: files.length,
        // The provider's word for "accepted, not yet delivered". `DeliveryTicks` and the
        // row's own styling already say it is in flight; this just keeps the type honest.
        status: 'queued',
        errorCode: null,
        pending: true as const,
        sendState: 'sending' as const,
        previews,
      }),
      files,
    );

    sendMutation.mutate(
      { to: peer, body, attachments: files },
      {
        onSuccess: () => sends.drop(id),
        onError: (err: unknown) =>
          sends.fail(
            id,
            err instanceof Error && err.message
              ? err.message
              : 'The message could not be sent.',
          ),
      },
    );
  };

  const handleSend = () => {
    const body = outgoing.trim();
    // A picture with no words is an ordinary message — the text is only required when
    // there is nothing else in it.
    if (!draft.trim() && attached.length === 0) return;
    const files = attached;
    setDraft('');
    setAttached([]);
    setAttachNotice(null);
    // Back to quoting the anchor, not to nothing: the next message is still a reply in
    // the same conversation.
    setQuotePick(undefined);
    submit(body, files);
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
                isAnchor={m.id === anchorMsgId}
                pending={m.pending ? (m as SmsItem & PendingMeta) : undefined}
                translation={translation}
                onRetry={() => {
                  const held = sends.pending.find((p) => p.row.id === m.id);
                  if (!held) return;
                  sends.drop(m.id);
                  submit(held.row.body, held.files);
                }}
                onDiscard={() => sends.drop(m.id)}
                onReply={() => setQuotePick(m)}
                onCompleteUntil={() =>
                  onMarkUntil(
                    m.id,
                    // A text you SENT is completable — the shared table has no
                    // direction — so nothing is marked `isOwn` here.
                    countMarkableUpTo(messages, m.id, 'isCompleted'),
                    'complete',
                  )
                }
                onReadUntil={() =>
                  onMarkUntil(
                    m.id,
                    countMarkableUpTo(messages, m.id, 'isRead'),
                    'read',
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

        <PolishPanel
          polish={polish}
          context={polishContext}
          budget={polishBudget}
          onAccept={setDraft}
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
            {/* ⚠️ `draft`, NEVER `outgoing`. `outgoing` has the quoted message prepended,
                so polishing that would have the model rewrite the customer's own words
                back at them. Plain text in, plain text out: no splitSignature and no
                joinPolishedBody, which would write literal <br> into a text SignalWire
                sends verbatim. */}
            <PolishButton
              polish={polish}
              draftPlain={draft}
              context={polishContext}
              budget={polishBudget}
            >
              <PolishBudgetToggle
                polish={polish}
                budget={polishBudget}
                onChange={setKeepShort}
                disabled={sendMutation.isPending}
              />
            </PolishButton>
            {/* Speak instead of type. Appends, so dictating twice adds a second sentence
                rather than replacing the first. */}
            <DictateButton
              disabled={sendMutation.isPending}
              onText={(text) =>
                setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text))
              }
            />
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
  isAnchor,
  pending,
  onRetry,
  onDiscard,
  translation,
  onReply,
  onCompleteUntil,
  onReadUntil,
}: {
  message: SmsItem;
  dimmed: boolean;
  /**
   * Set while THIS browser is still uploading the message.
   *
   * ⚠️ A failed send keeps its bubble rather than disappearing. A text that vanishes on
   * failure looks exactly like one that was sent, which is the worst outcome available
   * for a message somebody believes they sent.
   */
  pending?: PendingMeta;
  onRetry: () => void;
  onDiscard: () => void;
  translation: ReturnType<typeof useTranslation>;
  anchorRef?: React.Ref<HTMLDivElement>;
  /** THE message the reader opened. See `ANCHOR_RING`. */
  isAnchor?: boolean;
  /** Quote this message in the composer. */
  onReply: () => void;
  /** Complete this message and everything above it. */
  onCompleteUntil: () => void;
  onReadUntil: () => void;
}) {
  const own = m.direction === 'outbound';
  const failed = pending?.sendState === 'failed';
  return (
    <div
      ref={anchorRef}
      className={[
        'flex flex-col gap-1 transition-opacity',
        own ? 'items-end' : 'items-start',
        dimmed ? 'opacity-50' : '',
        // Sending is dimmed; FAILED is not — a failure has to be more visible than the
        // messages around it, not less.
        pending && !failed ? 'opacity-70' : '',
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
            isAnchor ? ANCHOR_RING : '',
            own ? 'bg-teal-600 text-white' : 'bg-muted text-foreground',
          ].join(' ')}
        >
          {/* The attachments, above the text — the order every phone uses. `media` is
              present only in a thread; the inbox row still shows the count, because
              listing media costs a provider request per message. */}
          {m.media?.map((file) => (
            <SmsAttachment key={file.sid} media={file} messageSid={m.sid} />
          ))}
          {/* A message still uploading has no server media to fetch, so it renders from
              the local file. This is the whole point of the pending row: the picture is
              on screen the instant Send is pressed, rather than after a multi-megabyte
              upload and a refetch. */}
          {pending?.previews.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="max-h-48 w-auto rounded-lg object-contain"
            />
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
        {/* ⚠️ Every hover action is hidden while a message is pending. None of them can
            work on a row the server has never seen: reply quotes it, and the two
            till-here actions would post a `pending:` id that no route can resolve. */}
        {!pending && (
          <button
            type="button"
            title="Reply to this message"
            aria-label="Reply to this message"
            onClick={onReply}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
          >
            <Reply size={13} />
          </button>
        )}
        {/* Read, then complete: they read left-to-right in the order somebody does them,
            and read is the lighter of the two — it changes what is bold, not what is on
            the worklist. */}
        {!pending && (
          <button
            type="button"
            title="Mark everything up to here read"
            aria-label="Mark everything up to here read"
            onClick={onReadUntil}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100"
          >
            <MailOpen size={13} />
          </button>
        )}
        {!pending && (
          <button
            type="button"
            title="Mark everything up to here complete"
            aria-label="Mark everything up to here complete"
            onClick={onCompleteUntil}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-blue-700 focus-visible:opacity-100 group-hover/msg:opacity-100"
          >
            <CheckCheck size={13} />
          </button>
        )}
      </div>
      {/* Translation is offered on messages the CUSTOMER wrote — our own are already in
          whatever language we chose to write them in. */}
      {!own && !pending && (
        <TranslateControl
          id={m.id}
          text={m.body}
          translation={translation.textFor(m.id)}
          busy={translation.isBusy(m.id)}
          error={translation.errorFor(m.id)}
          shown={translation.isShown(m.id)}
          onToggle={(id, text) => void translation.toggle(id, text)}
        />
      )}
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {pending ? (
          failed ? (
            <>
              <span className="font-medium text-destructive">
                Not sent{pending.error ? ` — ${pending.error}` : ''}
              </span>
              <button
                type="button"
                onClick={onRetry}
                className="font-medium text-teal-700 underline-offset-2 hover:underline"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onDiscard}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                Discard
              </button>
            </>
          ) : (
            <>
              <Clock size={10} className="shrink-0" />
              Sending…
            </>
          )
        ) : (
          <>
            {formatEmailDate(m.at)}
            {/* A failed text looks identical to a sent one without this. */}
            {m.errorCode !== null && (
              <span className="ml-1 text-destructive">
                · failed ({m.errorCode})
              </span>
            )}
          </>
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
