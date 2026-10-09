import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { UntilAction } from '@/api/completeUntil';
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
  type WhatsAppOutboxItem,
} from '@/api/whatsapp';
import { useWhatsAppThread } from '@/hooks/useWhatsAppThread';
import { useSendWhatsApp } from '@/hooks/useSendWhatsApp';
import { useSendWhatsAppMedia } from '@/hooks/useSendWhatsAppMedia';
import { useSendWhatsAppSmart } from '@/hooks/useSendWhatsAppSmart';
import { useWhatsAppOutboxAction } from '@/hooks/useWhatsAppOutboxAction';
import { useMarkWhatsAppItem } from '@/hooks/useMarkWhatsAppItem';
import { AttachmentChip } from '../AttachmentPreview';
import { AttachRow } from '../AttachRow';
import { FileDropOverlay, UploadProgressBar } from '../ComposerBits';
import { useFileDrop } from '@/hooks/useFileDrop';
import { mergeAttachments } from '../message-utils';
import { escapeHtml, formatEmailDate, openPrintWindow } from '../message-utils';
import {
  PolishBudgetToggle,
  PolishButton,
  PolishPanel,
} from '../PolishPanel';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { threadPolishContext, whatsappBudget } from './polish-budget';
import { DictateButton } from '../DictateButton';
import { makeIsFuture } from './thread-dim';
import { ANCHOR_RING } from './anchor-style';
import {
  PENDING_PREFIX,
  isPendingId,
  mergePending,
  type PendingMeta,
} from './pending-sends';
import { usePendingSends } from '@/hooks/usePendingSends';
import { useTranslation } from '@/hooks/useTranslation';
import { TranslateControl } from './TranslatePanel';
import { VoiceTranscript } from './VoiceTranscript';
import { countMarkableUpTo } from './complete-until';
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
  onAnchorChange,
  isCompleted,
  onMarkUntil,
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
  /**
   * Move the thread's anchor to an earlier message — the "go to this message" path,
   * shared by the per-message Reply arrow and the quoted-message preview.
   *
   * ⚠️ REQUIRED, not optional. This view was missing the behaviour precisely because
   * `ChatThreadView` was given the prop and this one silently was not.
   */
  onAnchorChange: (m: { id: string; at: string }) => void;
  isCompleted: boolean;
  active: boolean;
  onClose: () => void;
  /** Absent when the company has no support number to call from. */
  onCall?: (number: string) => void;
  callBlockedReason?: string | null;
  onRequestComplete: (target: CompleteTarget) => void;
  onUncomplete: (kind: ItemKind, id: string) => void;
  /** "Complete till here" — the anchor's id and how many messages that covers. */
  onMarkUntil: (
    messageId: number,
    count: number,
    action: UntilAction,
  ) => void;
}) {
  const { data, isLoading } = useWhatsAppThread(companyId, peer, active);
  const sendText = useSendWhatsApp(companyId);
  const sendFile = useSendWhatsAppMedia(companyId);
  const markUnread = useMarkWhatsAppItem(companyId, 'unread');

  const [draft, setDraft] = useState('');
  const polish = useDraftPolish('whatsapp');
  // Default ON, though it only has anything to constrain once a caption limit applies.
  const [keepShort, setKeepShort] = useState(true);
  // Outside the 24-hour window: the server turns the text into a template send.
  const sendSmart = useSendWhatsAppSmart(companyId);
  const outboxAction = useWhatsAppOutboxAction(companyId);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorVisible, setAnchorVisible] = useState(true);

  const serverMessages: WhatsAppItem[] = data?.messages ?? [];
  const sends = usePendingSends<WhatsAppItem>();
  const translation = useTranslation();
  /** The server's rows plus whatever this browser is still uploading. */
  const messages = mergePending(serverMessages, [
    ...sends.pending.map((p) => p.row),
    ...(data?.pending ?? []).map((o) => outboxRow(o, peer)),
  ]) as (WhatsAppItem & Partial<PendingMeta>)[];

  /**
   * Show the message immediately, then send it.
   *
   * ⚠️ `messageId` is a NEGATIVE sentinel. The quote map and the till-here anchor both key
   * off it, and a pending row has no server id yet — a positive one could collide with a
   * real row, and zero is a plausible id. Negative cannot be either, and every action is
   * guarded on `isPendingId` anyway.
   */
  const addPending = (
    body: string | null,
    files: File[],
    over: Partial<WhatsAppItem> = {},
  ) =>
    sends.add(
      (pendingId, previews) => ({
        id: pendingId,
        messageId: -Date.now(),
        kind: 'whatsapp' as const,
        direction: 'outbound' as const,
        peer,
        peerName: null,
        type: (files.length ? 'document' : 'text') as WhatsAppItem['type'],
        body,
        isVoice: false,
        durationSec: null,
        hasMedia: files.length > 0,
        mediaStatus: null,
        mimeType: files[0]?.type ?? null,
        filename: files[0]?.name ?? null,
        size: files[0]?.size ?? null,
        // No ticks until Meta says something — `DeliveryTicks` already renders null as
        // nothing, so a pending bubble simply has no tick rather than a wrong one.
        status: null,
        errorCode: null,
        replyToMessageId: null,
        at: new Date().toISOString(),
        // Outbound is written read and complete at creation server-side; matching that
        // here keeps the optimistic row from flickering when the real one replaces it.
        isRead: true,
        isCompleted: true,
        pending: true as const,
        sendState: 'sending' as const,
        previews,
        ...over,
      }),
      files,
    );
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
  /**
   * Text can be written whatever the window says — outside it the server finds or creates
   * a template (smart send). Only a FILE still needs the window, since a template carries
   * none.
   */
  const canWrite = !!data?.connected;

  /**
   * Jump to the anchor message — on open, and again whenever the anchor MOVES.
   *
   * See the twin in `SmsThreadView` for the full reasoning. In short: `anchorMsgId` in
   * the deps is what makes "go to this message" work at all, and `scrolledFor` is what
   * stops an optimistic pending row (which changes `messages.length` on send) from
   * yanking the view back up to the message you were replying to.
   */
  const scrolledFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!active) {
      scrolledFor.current = null;
      return;
    }
    if (!anchorMsgId || messages.length === 0) return;
    const el = anchorRef.current;
    // Before the write, never after — on the first render the anchor is not mounted yet.
    if (!el) return;
    if (scrolledFor.current === anchorMsgId) return;
    scrolledFor.current = anchorMsgId;
    el.scrollIntoView({ block: 'end' });
  }, [active, anchorMsgId, messages.length]);

  // ⚠️ `anchorMsgId` in the deps, or after a re-anchor the observer keeps watching the
  // OLD node — still mounted, only the ref moved — and the "Back to message" pill tracks
  // a message nobody is looking at.
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setAnchorVisible(e.isIntersecting), {
      root: el.closest('.overflow-y-auto') as HTMLElement | null,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [anchorMsgId, messages.length]);

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

  /**
   * Go to an earlier message — the same move `ChatThreadView.navigateToMessage` makes,
   * shared by the Reply arrow and the quoted-message preview exactly as Chat shares it.
   *
   * ⚠️ `setQuotePick(undefined)`, NOT `setQuotePick(m)`: `undefined` resolves to the
   * anchor through the live `messages` lookup above, so it cannot pin a row object the
   * 15s poll is about to replace — which matters here more than in SMS, because
   * `handleSend` puts `quoted?.messageId` on the wire. It also preserves the three-state
   * rule, so the chip's X still clears to a plain send.
   *
   * ⚠️ The pending guard is not belt-and-braces on the quote path. `byMessageId` is
   * built from `messages`, which includes optimistic rows carrying a synthetic negative
   * `messageId`, so a quote CAN resolve to one — and `Selection` is persisted, so a
   * `pending:` anchor would survive a reload pointing at a row that never existed.
   */
  const navigateToMessage = (m: WhatsAppItem) => {
    if (isPendingId(m.id)) return;
    onAnchorChange({ id: m.id, at: m.at });
    setQuotePick(undefined);
  };

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
  // Outside the window the text becomes a template body, which Meta caps at 1024.
  const captionLimit = file || !windowOpen ? WHATSAPP_CAPTION_LIMIT : 4096;

  /**
   * ⚠️ Recomputed per render because the budget CHANGES while the composer is open:
   * attaching a file drops the cap from 4096 to Meta's 1024-character caption limit. A
   * budget captured once would keep asking for the wrong length after a paperclip.
   */
  const polishBudget = whatsappBudget(keepShort, !!file && captionAllowed);

  const polishContext = threadPolishContext(
    messages.map((m) => ({
      isOwn: m.direction === 'outbound',
      from: m.peerName ?? m.peer,
      // A voice note has no body; its transcript is what the client actually said, and
      // it is what a reply has to answer.
      text: m.body ?? m.transcript ?? '',
    })),
    'A WhatsApp conversation with a client.',
  );

  /**
   * ⚠️ A preview belongs to the conversation it was written for — see the twin comment in
   * `SmsThreadView`. This view is not keyed on `peer` either.
   */
  useEffect(() => {
    polish.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);

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
    const id = addPending(caption || null, [file], {
      replyToMessageId: quoted?.messageId ?? null,
    });
    setDraft('');
    setAttached([]);
    setAttachNotice(null);
    setQuotePick(undefined);
    sendFile.mutate(
      { to: peer, file, caption, replyToMessageId: quoted?.messageId },
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

  /**
   * Outside the window: queue it with the server. The optimistic bubble is dropped once
   * the server answers, and the server's own pending row (polled with the thread) takes
   * over showing its progress.
   */
  const sendQueued = (pendingId: string, body: string) =>
    sendSmart.mutate(
      { to: peer, text: body },
      {
        onSuccess: () => sends.drop(pendingId),
        onError: (err: unknown) =>
          sends.fail(
            pendingId,
            err instanceof Error && err.message
              ? err.message
              : 'The message could not be sent.',
          ),
      },
    );

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    if (!windowOpen) {
      const id = addPending(body, [], { type: 'text' });
      setDraft('');
      setQuotePick(undefined);
      sendQueued(id, body);
      return;
    }
    const id = addPending(body, [], {
      type: 'text',
      replyToMessageId: quoted?.messageId ?? null,
    });
    setDraft('');
    setQuotePick(undefined);
    sendText.mutate(
      // Unlike SMS this is a NATIVE quote: the id goes on the wire and Meta renders the
      // quoted bubble in the customer's own WhatsApp. Nothing is prepended to the text.
      { to: peer, body, replyToMessageId: quoted?.messageId },
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

  const sendError = (sendText.error ?? sendFile.error ?? outboxAction.error) as Error | null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="gap-1">
            <ArrowLeft size={14} /> Back
          </Button>
          <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-400 gap-1">
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
                companyId={companyId}
                onReply={() => navigateToMessage(m)}
                onCompleteUntil={() =>
                  onMarkUntil(
                    // ⚠️ `m.messageId`, NOT `Number(m.id)`.
                    //
                    // `m.id` is the NAMESPACED id, `"wa:42"` — so `Number()` gave `NaN`,
                    // which `JSON.stringify` writes as `null`, which the DTO's `@IsInt()`
                    // rejected with a 400. The mutation had no `onError`, so the failure
                    // was swallowed whole: the dialog showed a correct count (that path
                    // compares strings and matched), the thread closed on the way out,
                    // and nothing was marked. The server's keyset cut wants the numeric
                    // row id, which the DTO carries separately for exactly this reason.
                    m.messageId,
                    // `isOwn` on outbound: WhatsApp's `setState` refuses to change an
                    // outbound row, so counting it would overstate what happens.
                    countMarkableUpTo(
                      messages.map((x) => ({
                        id: String(x.id),
                        at: x.at,
                        isCompleted: x.isCompleted,
                        isRead: x.isRead,
                        isOwn: x.direction === 'outbound',
                      })),
                      String(m.id),
                      'isCompleted',
                    ),
                    'complete',
                  )
                }
                onReadUntil={() =>
                  onMarkUntil(
                    m.messageId,
                    countMarkableUpTo(
                      messages.map((x) => ({
                        id: String(x.id),
                        at: x.at,
                        isCompleted: x.isCompleted,
                        isRead: x.isRead,
                        isOwn: x.direction === 'outbound',
                      })),
                      String(m.id),
                      'isRead',
                    ),
                    'read',
                  )
                }
                quotedOf={quotedOf}
                onNavigateToMessage={navigateToMessage}
                message={m}
                token={token}
                dimmed={isFuture(m)}
                anchorRef={m.id === anchorMsgId ? anchorRef : undefined}
                isAnchor={m.id === anchorMsgId}
                pending={
                  m.pending ? (m as WhatsAppItem & PendingMeta) : undefined
                }
                translation={translation}
                onRetry={() => {
                  const outboxId = outboxIdOf(m.id);
                  if (outboxId !== null) {
                    outboxAction.mutate({ id: outboxId, action: 'retry' });
                    return;
                  }
                  const held = sends.pending.find((p) => p.row.id === m.id);
                  if (!held) return;
                  sends.drop(m.id);
                  if (held.files.length) {
                    sendFile.mutate({
                      to: peer,
                      file: held.files[0],
                      caption: held.row.body ?? '',
                    });
                  } else if (!windowOpen) {
                    const id = addPending(held.row.body ?? '', [], { type: 'text' });
                    sendQueued(id, held.row.body ?? '');
                  } else {
                    sendText.mutate({ to: peer, body: held.row.body ?? '' });
                  }
                }}
                onDiscard={() => {
                  const outboxId = outboxIdOf(m.id);
                  if (outboxId !== null) {
                    outboxAction.mutate({ id: outboxId, action: 'discard' });
                    return;
                  }
                  sends.drop(m.id);
                }}
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
        ) : (
          <>
            {!isLoading && data && !windowOpen && (
              // Outside the window the message goes as a WhatsApp template, which the
              // server picks or creates by itself. The user only needs to know it may
              // take a little longer, and that files wait until the customer replies.
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <Clock size={14} className="mt-0.5 shrink-0" />
                {data.windowOpenUntil
                  ? "They haven't written in the last 24 hours, so WhatsApp may take a few minutes to deliver your message. Files can be sent once they reply."
                  : "They haven't messaged this number yet, so WhatsApp may take a few minutes to deliver your first message. Files can be sent once they reply."}
              </p>
            )}
            {/* The quoted message, removable. Unlike the SMS chip this costs the body
                nothing — Meta carries the quote structurally and renders it in the
                customer's app. Clearing it sends a plain message. */}
            {/* Only inside the window: a template send carries no native quote. */}
            {quoted && windowOpen && (
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
              disabled={!canWrite || (!!file && !captionAllowed)}
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
              disabledReason={
                canReply ? undefined : 'You can send files once they reply.'
              }
            />

            <PolishPanel
              polish={polish}
              context={polishContext}
              budget={polishBudget}
              onAccept={setDraft}
            />

            <div className="flex items-start justify-between gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {draft.length} / {captionLimit}
                {data?.windowOpenUntil && (
                  <> · reply window open until {formatEmailDate(data.windowOpenUntil)}</>
                )}
              </span>
              <div className="flex items-start gap-2">
                {/* Plain text in, plain text out — no splitSignature, no
                    joinPolishedBody: WhatsApp formatting is its own markup and HTML
                    would be sent literally. The quote is a native replyToMessageId, so
                    it is not in the draft and cannot be rewritten. */}
                <PolishButton
                  polish={polish}
                  draftPlain={draft}
                  context={polishContext}
                  budget={polishBudget}
                >
                  {polishBudget && (
                    <PolishBudgetToggle
                      polish={polish}
                      budget={polishBudget}
                      onChange={setKeepShort}
                      disabled={!canWrite}
                    />
                  )}
                </PolishButton>
                {/* The microphone now produces TEXT, not a voice note.

                    Sending a recording to a client was removed deliberately: it put the
                    firm's voice in the client's WhatsApp with no record of what was said
                    that anybody could search, read back or check. Dictation keeps the
                    convenience — speak instead of type — while what actually leaves is a
                    message like any other. Inbound voice notes are untouched and still
                    arrive and play. */}
                <DictateButton
                  disabled={!canWrite}
                  onText={(text) =>
                    setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text))
                  }
                />
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
                    disabled={sendText.isPending || sendSmart.isPending || !canWrite}
                    onClick={handleSend}
                  >
                    <Send size={13} />
                    {sendText.isPending || sendSmart.isPending ? 'Sending…' : 'Send'}
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

function BubbleContent({
  message: m,
  token,
  companyId,
}: {
  message: WhatsAppItem;
  token: string | null;
  companyId: number;
}) {
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
          <VoiceTranscript companyId={companyId} message={m} />
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
  companyId,
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
  quotedOf,
  onNavigateToMessage,
}: {
  message: WhatsAppItem;
  token: string | null;
  companyId: number;
  dimmed: boolean;
  anchorRef?: React.Ref<HTMLDivElement>;
  /** THE message the reader opened. See `ANCHOR_RING`. */
  isAnchor?: boolean;
  /**
   * Set while THIS browser is still uploading the message. A failed send keeps its
   * bubble rather than vanishing — see `PendingMeta`.
   */
  pending?: PendingMeta;
  onRetry: () => void;
  onDiscard: () => void;
  translation: ReturnType<typeof useTranslation>;
  /** Go to this message: it becomes the anchor, and the composer quotes it. */
  onReply: () => void;
  /** Complete this message and everything above it. */
  onCompleteUntil: () => void;
  onReadUntil: () => void;
  /** Resolve `replyToMessageId` against the loaded thread. */
  quotedOf: (m: WhatsAppItem) => WhatsAppItem | null;
  /** Go to the quoted original. Same path the Reply arrow takes, as in `ChatBubble`. */
  onNavigateToMessage: (m: WhatsAppItem) => void;
}) {
  const own = m.direction === 'outbound';
  const quoted = quotedOf(m);
  // Resolved, and real: an optimistic row carries a synthetic id that must never be
  // written to the persisted anchor.
  const canJumpToQuoted = !!quoted && !isPendingId(quoted.id);
  const failed = pending?.sendState === 'failed';
  return (
    <div
      ref={anchorRef}
      className={[
        'flex flex-col gap-1 transition-opacity',
        own ? 'items-end' : 'items-start',
        dimmed ? 'opacity-50' : '',
        // Sending is dimmed; FAILED is not — a failure must be more visible than the
        // messages around it, not less.
        pending && !failed ? 'opacity-70' : '',
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
          isAnchor ? ANCHOR_RING : '',
            own ? 'bg-emerald-100 text-emerald-950' : 'bg-muted text-foreground',
          ].join(' ')}
        >
          {/* The quoted original, above the reply — what WhatsApp itself draws. A quote
              whose target is outside the loaded page degrades to a label rather than
              costing a lookup per bubble, the same trade `ChatBubble` makes. */}
          {m.replyToMessageId !== null && (
            <div
              // Click to go to the original, exactly as `ChatBubble` does. Inert when the
              // target is outside the loaded page (nothing to jump to) or is an optimistic
              // row — a `pending:` id must never reach the anchor, which is persisted.
              role={canJumpToQuoted ? 'button' : undefined}
              title={canJumpToQuoted ? 'Go to this message' : undefined}
              onClick={
                canJumpToQuoted ? () => onNavigateToMessage(quoted) : undefined
              }
              className={[
                'mb-1.5 border-l-2 pl-2 text-xs',
                own ? 'border-emerald-500/60' : 'border-muted-foreground/40',
                canJumpToQuoted ? 'cursor-pointer hover:opacity-80' : '',
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
          {/* A message still uploading has no server media to fetch, so it renders from
              the local file — the picture is on screen the instant Send is pressed. */}
          {pending?.previews.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="mb-1 max-h-48 w-auto rounded-lg object-contain"
            />
          ))}
          {pending ? (
            <span className="whitespace-pre-wrap break-words">
              {m.body || (m.filename ?? '')}
            </span>
          ) : (
            <BubbleContent message={m} token={token} companyId={companyId} />
          )}
        </div>
        {/* ⚠️ Hidden while pending: none of these can act on a row the server has never
            seen — reply needs a real `messageId`, and the two till-here actions would
            post an id no route can resolve. */}
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
      {/* Offered on messages the CUSTOMER wrote — ours are already in the language we
          chose. A voice note's `body` is null until it is transcribed, and the control
          hides itself when there is no text, so the two features compose without either
          knowing about the other. */}
      {!own && !pending && (
        <TranslateControl
          id={m.id}
          text={m.body ?? ''}
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
                className="font-medium text-emerald-700 underline-offset-2 hover:underline"
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
              {pending.stateLabel ?? 'Sending…'}
            </>
          )
        ) : (
          <>
            {formatEmailDate(m.at)}
            <DeliveryTicks message={m} />
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Smart-send rows carry the `pending:` prefix ON PURPOSE, so every guard that already
 * keeps an optimistic bubble away from read/complete/quote/anchor actions covers them too.
 */
const OUTBOX_ROW_PREFIX = `${PENDING_PREFIX}outbox:`;

function outboxIdOf(id: string): number | null {
  if (!id.startsWith(OUTBOX_ROW_PREFIX)) return null;
  const n = Number(id.slice(OUTBOX_ROW_PREFIX.length));
  return Number.isInteger(n) ? n : null;
}

/** What the user sees while the server works out how WhatsApp will deliver a message. */
function outboxLabel(status: WhatsAppOutboxItem['status']): string {
  return status === 'AWAITING_TEMPLATE'
    ? 'Waiting for WhatsApp approval…'
    : 'Preparing…';
}

/**
 * A message the server is still delivering, drawn as an outbound bubble.
 *
 * Only what the user typed is shown -- which template carries it, and with which values,
 * never leaves the server.
 */
function outboxRow(
  o: WhatsAppOutboxItem,
  peer: string,
): WhatsAppItem & PendingMeta {
  const failed = o.status === 'FAILED';
  return {
    id: `${OUTBOX_ROW_PREFIX}${o.id}`,
    // Negative, like every pending row: never a real row id.
    messageId: -o.id,
    kind: 'whatsapp',
    direction: 'outbound',
    peer,
    peerName: null,
    type: 'text',
    body: o.text,
    isVoice: false,
    durationSec: null,
    hasMedia: false,
    mediaStatus: null,
    mimeType: null,
    filename: null,
    size: null,
    status: null,
    errorCode: null,
    replyToMessageId: null,
    at: o.createdAt,
    isRead: true,
    isCompleted: true,
    pending: true,
    sendState: failed ? 'failed' : 'sending',
    error: failed ? (o.error ?? undefined) : undefined,
    stateLabel: failed ? undefined : outboxLabel(o.status),
    previews: [],
  };
}
