import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, MailOpen, MessageSquareText, Phone, Printer, Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { SmsItem } from '@/api/phone';
import { useSmsThread } from '@/hooks/useSmsThread';
import { useSendSms } from '@/hooks/useSendSms';
import { useMarkPhoneItem } from '@/hooks/useMarkPhoneItem';
import { formatE164 } from '@/lib/phone';
import { formatEmailDate, openPrintWindow, escapeHtml } from '../message-utils';
import type { CompleteTarget, ItemKind } from './types';

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
 * `ChatBubble` is not reused: it is built around `ChatMessage`'s sender names, quoted
 * messages and attachments, none of which an SMS has. A small bubble of its own is
 * less code than the props it would take to neuter that one.
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
  onRequestComplete,
  onUncomplete,
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
  onRequestComplete: (target: CompleteTarget) => void;
  onUncomplete: (kind: ItemKind, id: string) => void;
}) {
  const { data, isLoading } = useSmsThread(companyId, peer, active);
  const sendMutation = useSendSms(companyId);
  const markUnread = useMarkPhoneItem(companyId, 'unread');

  const [draft, setDraft] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorVisible, setAnchorVisible] = useState(true);

  const messages: SmsItem[] = data?.messages ?? [];
  const anchorMs = new Date(anchorTime).getTime();
  const isFuture = (m: SmsItem) => new Date(m.at).getTime() > anchorMs;

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

  const { segments, unicode } = segmentsFor(draft);

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    sendMutation.mutate(
      { to: peer, body },
      { onSuccess: () => setDraft('') },
    );
  };

  const handlePrint = () => {
    const title = `Texts with ${formatE164(peer)}`;
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
          <span className="text-sm font-semibold">{formatE164(peer)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => onCall(peer)}>
            <Phone size={13} /> Call
          </Button>
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
      <div className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Reply to {formatE164(peer)}
          {supportNumber && ` from ${formatE164(supportNumber)}`}
        </p>
        {/* A plain textarea, NOT RichTextEditor: SMS carries no formatting, and the
            markdown/HTML conversion the chat composer does would be sent literally. */}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a text message…"
          rows={3}
          maxLength={1600}
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {draft.length} characters
            {segments > 0 && ` · ${segments} segment${segments === 1 ? '' : 's'}`}
            {unicode && ' · unicode (shorter segments)'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              disabled={sendMutation.isPending || !draft.trim()}
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
}: {
  message: SmsItem;
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
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
          own ? 'bg-teal-600 text-white' : 'bg-muted text-foreground',
        ].join(' ')}
      >
        {m.body || (m.numMedia > 0 ? `(${m.numMedia} attachment${m.numMedia === 1 ? '' : 's'})` : '(no text)')}
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
