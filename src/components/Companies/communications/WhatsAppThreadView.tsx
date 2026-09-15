import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, CheckCheck, CheckCircle2, Clock, MailOpen, MessageCircle,
  Mic, Phone, Printer, Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  formatVoiceDuration,
  formatWhatsAppNumber,
  whatsappMediaUrl,
  whatsappPreviewText,
  type WhatsAppItem,
} from '@/api/whatsapp';
import { useWhatsAppThread } from '@/hooks/useWhatsAppThread';
import { useSendWhatsApp } from '@/hooks/useSendWhatsApp';
import { useSendWhatsAppVoice } from '@/hooks/useSendWhatsAppVoice';
import { useMarkWhatsAppItem } from '@/hooks/useMarkWhatsAppItem';
import { AttachmentChip } from '../AttachmentPreview';
import { escapeHtml, formatEmailDate, openPrintWindow } from '../message-utils';
import { VoiceRecorder } from './VoiceRecorder';
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
}) {
  const { data, isLoading } = useWhatsAppThread(companyId, peer, active);
  const sendText = useSendWhatsApp(companyId);
  const sendVoice = useSendWhatsAppVoice(companyId);
  const markUnread = useMarkWhatsAppItem(companyId, 'unread');

  const [draft, setDraft] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorVisible, setAnchorVisible] = useState(true);

  const messages: WhatsAppItem[] = data?.messages ?? [];
  const peerName = data?.peerName ?? null;
  const title = peerName || formatWhatsAppNumber(peer);
  const anchorMs = new Date(anchorTime).getTime();
  const isFuture = (m: WhatsAppItem) => new Date(m.at).getTime() > anchorMs;

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

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    sendText.mutate({ to: peer, body }, { onSuccess: () => setDraft('') });
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

  const sendError = (sendText.error ?? sendVoice.error) as Error | null;

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
      <div className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Reply to {title} on WhatsApp
        </p>

        {!isLoading && data && !data.connected ? (
          <p className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            No WhatsApp number is connected to this company, so replies cannot be sent. An
            admin can connect one on the Details tab.
          </p>
        ) : !isLoading && data && !windowOpen ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <Clock size={14} className="mt-0.5 shrink-0" />
            {data.windowOpenUntil
              ? 'The 24-hour reply window is closed. WhatsApp only allows an approved template until the customer writes again (templates are not supported here yet).'
              : 'This customer has not messaged this number yet. WhatsApp only allows an approved template as the first message.'}
          </p>
        ) : (
          <>
            {/* Plain text: WhatsApp formatting is its own *markup*, which a rich editor
                would send literally. */}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a WhatsApp message…"
              rows={3}
              maxLength={4096}
              disabled={!canReply}
            />
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {draft.length} / 4096
                {data?.windowOpenUntil && (
                  <> · reply window open until {formatEmailDate(data.windowOpenUntil)}</>
                )}
              </span>
              <div className="flex items-start gap-2">
                {!draft.trim() && (
                  <VoiceRecorder
                    disabled={!canReply}
                    sending={sendVoice.isPending}
                    uploadProgress={sendVoice.uploadProgress}
                    onSend={(recording, filename) =>
                      sendVoice.mutateAsync({ to: peer, recording, filename })
                    }
                  />
                )}
                {draft.trim() && (
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
function WhatsAppBubble({
  message: m,
  token,
  dimmed,
  anchorRef,
}: {
  message: WhatsAppItem;
  token: string | null;
  dimmed: boolean;
  anchorRef?: React.Ref<HTMLDivElement>;
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
      <div
        className={[
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
          own ? 'bg-emerald-100 text-emerald-950' : 'bg-muted text-foreground',
        ].join(' ')}
      >
        <BubbleContent message={m} token={token} />
      </div>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {formatEmailDate(m.at)}
        <DeliveryTicks message={m} />
      </span>
    </div>
  );
}
