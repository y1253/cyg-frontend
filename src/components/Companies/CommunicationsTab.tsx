import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Mail, Send, ArrowLeft, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Trash2,
  Inbox, SendHorizonal, AlertOctagon, Trash, X, MessageSquare, Reply, MailOpen, Paperclip,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGmailAccount } from '@/hooks/useGmailAccount';
import { useGmailEmails } from '@/hooks/useGmailEmails';
import { useGmailEmail } from '@/hooks/useGmailEmail';
import { useGmailChats } from '@/hooks/useGmailChats';
import { useGmailChatThread } from '@/hooks/useGmailChatThread';
import { useSendEmail } from '@/hooks/useSendEmail';
import { useSendChatMessage } from '@/hooks/useSendChatMessage';
import { useMarkEmailUnread } from '@/hooks/useMarkEmailUnread';
import { useMarkChatRead } from '@/hooks/useMarkChatRead';
import { useMarkChatUnread } from '@/hooks/useMarkChatUnread';
import { useDisconnectGmail } from '@/hooks/useDisconnectGmail';
import { useMarkEmailRead } from '@/hooks/useMarkEmailRead';
import { useGmailUnreadCount } from '@/hooks/useGmailUnreadCount';
import { fetchAuthUrl, emailAttachmentUrl, chatAttachmentUrl } from '@/api/gmail';
import type { EmailSummary, ChatInboxMessage, EmailDetail, EmailAttachment } from '@/api/gmail';
import { AttachmentPreview } from './AttachmentPreview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  companyId: number;
  isAdmin: boolean;
}

const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'SENT', label: 'Sent', icon: SendHorizonal },
  { id: 'SPAM', label: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', label: 'Trash', icon: Trash },
] as const;

type UnifiedItem =
  | { kind: 'email'; data: EmailSummary }
  | { kind: 'chat'; data: ChatInboxMessage };

// Minimal shape needed to natively quote a chat message in a reply.
type QuoteTarget = {
  id: string;
  sender: string;
  text: string;
  lastUpdateTime: string;
};

function getItemTimestamp(item: UnifiedItem): number {
  const raw = item.kind === 'email' ? item.data.date : item.data.createTime;
  return new Date(raw).getTime() || 0;
}

function injectBaseTarget(html: string): string {
  if (html.includes('<base')) return html;
  const withHead = html.replace(/<head>/i, '<head><base target="_blank" rel="noreferrer">');
  if (withHead !== html) return withHead;
  return '<base target="_blank" rel="noreferrer">' + html;
}

// Rewrite inline `src="cid:XXX"` references in email HTML to authenticated
// attachment URLs so embedded images render inside the sandboxed iframe.
function rewriteInlineImages(
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

function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function extractEmail(from: string): string {
  const match = /<(.+?)>/.exec(from);
  return match ? match[1] : from.trim();
}

function prefixReSubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

function senderInitial(from: string): string {
  const name = from.replace(/<[^>]+>/, '').trim().replace(/"/g, '');
  return (name[0] ?? '?').toUpperCase();
}

export function CommunicationsTab({ companyId, isAdmin }: Props) {
  const { token } = useAuth();
  const qc = useQueryClient();

  const [connecting, setConnecting] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  // The clicked chat message — its createTime freezes the thread at that moment,
  // and its id is the per-message read/unread target for the open thread.
  const [openedChatMsgId, setOpenedChatMsgId] = useState<string | null>(null);
  const [openedChatMsgTime, setOpenedChatMsgTime] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('INBOX');
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '', cc: '' });
  const [newEmailBanner, setNewEmailBanner] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyForm, setReplyForm] = useState({ to: '', subject: '', body: '', cc: '' });
  const [chatReplyOpen, setChatReplyOpen] = useState(false);
  const [chatReplyText, setChatReplyText] = useState('');
  // The message the reply will natively quote (default = the opened/anchor
  // message; cleared → plain reply). Mirrors Google Chat's "Quote in reply".
  const [quoteTarget, setQuoteTarget] = useState<QuoteTarget | null>(null);
  const [selectedMsgIsRead, setSelectedMsgIsRead] = useState(false);

  const { data: account, isLoading: accountLoading } = useGmailAccount(companyId);
  const isInbox = selectedLabel === 'INBOX';

  // Emails: in INBOX unified mode, no pagination token; other folders keep pagination
  const { data: emailList, isLoading: emailsLoading } = useGmailEmails(
    companyId,
    account ? (isInbox ? undefined : pageToken) : undefined,
    selectedLabel,
  );
  const { data: chatData, isLoading: chatsLoading, error: chatsError } = useGmailChats(companyId, account);
  const { data: emailDetail, isLoading: emailDetailLoading } = useGmailEmail(
    companyId,
    account ? selectedMsgId : null,
  );
  const { data: chatThread, isLoading: chatThreadLoading } = useGmailChatThread(
    companyId,
    account ? selectedSpaceId : null,
  );
  const sendMutation = useSendEmail(companyId);
  const sendChatMutation = useSendChatMessage(companyId);
  const disconnectMutation = useDisconnectGmail(companyId);
  const markReadMutation = useMarkEmailRead(companyId);
  const markUnreadMutation = useMarkEmailUnread(companyId);
  const markChatReadMutation = useMarkChatRead(companyId);
  const markChatUnreadMutation = useMarkChatUnread(companyId);
  const { data: unreadData } = useGmailUnreadCount(companyId, account);

  const threadScrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  // Whether the anchor (opened) message is currently visible in the scroll
  // container — drives the floating "Back to message" button. `anchorDir` is
  // the direction to scroll to reach it when it's off-screen.
  const [anchorVisible, setAnchorVisible] = useState(true);
  const [anchorDir, setAnchorDir] = useState<'up' | 'down'>('up');

  const scrollToAnchor = useCallback(() => {
    anchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, []);

  // On open (or when the anchor / thread changes), position the anchor message
  // at the BOTTOM of the visible area so the view reads as if the conversation
  // ends there — the dimmed "future" messages sit just below (scroll to see).
  useEffect(() => {
    if (!selectedSpaceId || !openedChatMsgId) return;
    const el = anchorRef.current;
    if (el) el.scrollIntoView({ block: 'end' });
    // Re-run when the loaded thread changes (anchor node mounts after fetch).
  }, [selectedSpaceId, openedChatMsgId, chatThread?.messages?.length]);

  // Track anchor visibility to toggle the "Back to message" button.
  useEffect(() => {
    const root = threadScrollRef.current;
    const target = anchorRef.current;
    if (!root || !target) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setAnchorVisible(entry.isIntersecting);
        if (!entry.isIntersecting && entry.rootBounds) {
          // Anchor below the viewport → scroll down to reach it, else up.
          setAnchorDir(
            entry.boundingClientRect.top >= entry.rootBounds.bottom ? 'down' : 'up',
          );
        }
      },
      { root, threshold: 0.1 },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [selectedSpaceId, openedChatMsgId, chatThread?.messages?.length]);

  // Build unified sorted list for INBOX (emails + one row per chat conversation)
  const unifiedItems: UnifiedItem[] = isInbox
    ? [
        ...(emailList?.messages ?? []).map((e): UnifiedItem => ({ kind: 'email', data: e })),
        ...(chatData?.messages ?? []).map((c): UnifiedItem => ({ kind: 'chat', data: c })),
      ].sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a))
    : [];

  // The opened chat message (for the thread view header / space name fallback).
  const openedChatMsg = openedChatMsgId
    ? (chatData?.messages ?? []).find((m) => m.id === openedChatMsgId) ?? null
    : null;
  const threadMessages = chatThread?.messages ?? [];
  // The anchor message object — prefer the freshly-fetched thread copy (has the
  // most up-to-date lastUpdateTime for quoting), fall back to the inbox row.
  const anchorMsg: QuoteTarget | null = openedChatMsgId
    ? threadMessages.find((m) => m.id === openedChatMsgId) ??
      (openedChatMsg
        ? {
            id: openedChatMsg.id,
            sender: openedChatMsg.sender,
            text: openedChatMsg.text,
            lastUpdateTime: openedChatMsg.lastUpdateTime,
          }
        : null)
    : null;
  // Display name for the open thread — prefer freshly-fetched thread metadata.
  const selectedSpaceName =
    chatThread?.spaceName ?? openedChatMsg?.spaceName ?? 'Conversation';

  // SSE: real-time inbox updates
  useEffect(() => {
    if (!account || !token) return;
    const es = new EventSource(
      `/api/gmail/companies/${companyId}/events?token=${encodeURIComponent(token)}`,
    );
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as { type: string };
        if (data.type === 'new-email') {
          void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
          void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
          setNewEmailBanner(true);
          setTimeout(() => setNewEmailBanner(false), 5000);
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [account, companyId, token, qc]);

  const handleConnect = useCallback(async () => {
    if (!token) return;
    setConnecting(true);
    try {
      const { authUrl } = await fetchAuthUrl(token, companyId);
      const popup = window.open(authUrl, 'gmail-oauth', 'width=500,height=600');
      const onMessage = (e: MessageEvent<{ type: string }>) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === 'gmail-connected' || e.data?.type === 'gmail-error') {
          void qc.invalidateQueries({ queryKey: ['gmail-account', companyId] });
          setConnecting(false);
          window.removeEventListener('message', onMessage);
        }
      };
      window.addEventListener('message', onMessage);
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          setConnecting(false);
          window.removeEventListener('message', onMessage);
        }
      }, 500);
    } catch {
      setConnecting(false);
    }
  }, [token, companyId, qc]);

  const handleSend = () => {
    sendMutation.mutate(
      { to: composeForm.to, subject: composeForm.subject, body: composeForm.body, cc: composeForm.cc || undefined },
      {
        onSuccess: () => {
          setComposeOpen(false);
          setComposeForm({ to: '', subject: '', body: '', cc: '' });
        },
      },
    );
  };

  const handleSendReply = () => {
    if (!emailDetail) return;
    sendMutation.mutate(
      {
        to: replyForm.to,
        subject: replyForm.subject,
        body: replyForm.body,
        cc: replyForm.cc || undefined,
        inReplyTo: emailDetail.messageId || undefined,
        threadId: emailDetail.threadId || undefined,
      },
      {
        onSuccess: () => {
          setReplyOpen(false);
          setReplyForm({ to: '', subject: '', body: '', cc: '' });
        },
      },
    );
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => setDisconnectConfirmOpen(false),
    });
  };

  const handleNextPage = () => {
    if (!emailList?.nextPageToken) return;
    setPageHistory((h) => [...h, pageToken ?? '']);
    setPageToken(emailList.nextPageToken);
    setSelectedMsgId(null);
  };

  const handlePrevPage = () => {
    const prev = pageHistory[pageHistory.length - 1];
    setPageHistory((h) => h.slice(0, -1));
    setPageToken(prev === '' ? undefined : prev);
    setSelectedMsgId(null);
  };

  const handleSelectFolder = (folderId: string) => {
    setSelectedLabel(folderId);
    setPageToken(undefined);
    setPageHistory([]);
    setSelectedMsgId(null);
    setSelectedSpaceId(null);
  };

  const handleOpenEmail = (msg: EmailSummary) => {
    if (!msg.isRead) markReadMutation.mutate(msg.id);
    setSelectedMsgId(msg.id);
    setSelectedMsgIsRead(true); // always read after opening (auto-marked or was already read)
    setSelectedSpaceId(null);
    setReplyOpen(false);
  };

  const handleOpenChat = (msg: ChatInboxMessage) => {
    if (!msg.isRead) markChatReadMutation.mutate(msg.id); // mark THIS message read, not the whole space
    setSelectedSpaceId(msg.spaceId);
    setOpenedChatMsgId(msg.id);
    setOpenedChatMsgTime(msg.createTime); // anchor: messages after this are dimmed
    setSelectedMsgId(null);
    setReplyOpen(false);
    setChatReplyOpen(false);
    setChatReplyText('');
    setQuoteTarget(null);
  };

  const handleCloseChat = () => {
    setSelectedSpaceId(null);
    setOpenedChatMsgId(null);
    setOpenedChatMsgTime(null);
    setChatReplyOpen(false);
    setChatReplyText('');
    setQuoteTarget(null);
  };

  // Open the reply box, defaulting to natively quoting the anchor message
  // (Google Chat's "Quote in reply"). The user can clear the quote before send.
  const handleOpenChatReply = () => {
    setQuoteTarget(anchorMsg);
    setChatReplyOpen(true);
  };

  const handleSendChatReply = () => {
    if (!selectedSpaceId || !chatReplyText.trim()) return;
    sendChatMutation.mutate(
      {
        spaceId: selectedSpaceId,
        text: chatReplyText,
        ...(quoteTarget
          ? {
              quotedMessageName: quoteTarget.id,
              quotedMessageLastUpdateTime: quoteTarget.lastUpdateTime,
            }
          : {}),
      },
      {
        onSuccess: () => {
          setChatReplyOpen(false);
          setChatReplyText('');
          setQuoteTarget(null);
          // The thread query is invalidated by the mutation; once the refetch
          // lands, scroll to the bottom so the just-sent reply is visible.
          setTimeout(() => {
            const el = threadScrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }, 300);
        },
      },
    );
  };

  const handleOpenReply = (detail: EmailDetail) => {
    setReplyForm({
      to: extractEmail(detail.from),
      subject: prefixReSubject(detail.subject || ''),
      body: '',
      cc: '',
    });
    setReplyOpen(true);
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (accountLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Mail size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No Gmail account connected — link one from the Billing section in Account Details.
        </p>
        {isAdmin && (
          <Button
            onClick={() => void handleConnect()}
            disabled={connecting}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {connecting ? 'Opening…' : 'Connect Gmail'}
          </Button>
        )}
      </div>
    );
  }

  // ── Chat conversation (thread) view ───────────────────────────────────────

  if (selectedSpaceId) {
    const anchorTime = openedChatMsgTime ? new Date(openedChatMsgTime).getTime() : null;

    // My own replies whose real position is in the future/dimmed zone, grouped by the
    // message they answer. These are surfaced again in regular color right after that
    // message so a just-sent reply isn't buried among later dimmed activity.
    const surfacedReplies = new Map<string, typeof threadMessages>();
    if (anchorTime !== null) {
      for (const m of threadMessages) {
        const isFuture = new Date(m.createTime).getTime() > anchorTime;
        if (m.isOwn && m.quotedMessageName && isFuture) {
          const arr = surfacedReplies.get(m.quotedMessageName) ?? [];
          arr.push(m);
          surfacedReplies.set(m.quotedMessageName, arr);
        }
      }
    }

    // Render a single chat bubble. Reused for the normal chronological instance and
    // for the surfaced (regular-color) copy of my own future replies.
    const renderChatBubble = (
      m: (typeof threadMessages)[number],
      opts: {
        keyStr: string;
        dimmed: boolean;
        isAnchor: boolean;
        attachRef: boolean;
        hideQuote: boolean;
        surfaced?: boolean;
      },
    ) => {
      const quoted =
        !opts.hideQuote && m.quotedMessageName
          ? threadMessages.find((q) => q.id === m.quotedMessageName)
          : null;
      return (
        <div
          key={opts.keyStr}
          ref={opts.attachRef ? anchorRef : undefined}
          className={`flex flex-col gap-1 transition-opacity ${m.isOwn ? 'items-end' : 'items-start'} ${opts.dimmed ? 'opacity-50' : ''}`}
        >
          <div className="flex items-center gap-2">
            {!m.isOwn && (
              <div className="shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-semibold">
                {(m.sender[0] ?? '?').toUpperCase()}
              </div>
            )}
            <span className="text-xs font-medium text-foreground/80">{m.isOwn ? 'You' : m.sender}</span>
            <span className="text-[11px] text-muted-foreground">
              {opts.surfaced ? 'Your reply' : formatEmailDate(m.createTime)}
            </span>
          </div>
          <div
            className={`max-w-[75%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
              m.isOwn ? 'bg-teal-600 text-white' : 'ml-8 bg-background border'
            } ${opts.isAnchor ? 'ring-2 ring-purple-400 ring-offset-1' : ''} ${
              opts.surfaced ? 'border-l-4 border-l-teal-300' : ''
            }`}
          >
            {/* Quoted-message preview (native "Quote in reply") */}
            {!opts.hideQuote && m.quotedMessageName && (
              <div
                className={`mb-1.5 border-l-2 pl-2 text-xs ${
                  m.isOwn ? 'border-white/60 text-white/80' : 'border-purple-300 text-muted-foreground'
                }`}
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
            {m.text || (m.attachments && m.attachments.length > 0 ? '' : '(empty message)')}
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
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
          onClick={handleCloseChat}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium shrink-0">
                Chat
              </span>
              <span className="text-sm font-medium truncate">{selectedSpaceName}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-muted-foreground"
              disabled={markChatUnreadMutation.isPending || !openedChatMsgId}
              onClick={() => {
                if (!openedChatMsgId) return;
                markChatUnreadMutation.mutate(openedChatMsgId, {
                  onSuccess: handleCloseChat,
                });
              }}
            >
              <MailOpen size={14} /> Mark as unread
            </Button>
          </div>

          {/* Conversation thread */}
          <div className="relative">
            <div ref={threadScrollRef} className="border rounded-md bg-muted/10 max-h-[28rem] overflow-y-auto p-4 flex flex-col gap-3">
              {chatThreadLoading && threadMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Loading conversation…</p>
              ) : threadMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No messages in this conversation.</p>
              ) : (
                threadMessages.map((m) => {
                  const isAnchor = m.id === openedChatMsgId;
                  // Messages newer than the anchor are the "future" — dimmed.
                  const isFuture =
                    anchorTime !== null && new Date(m.createTime).getTime() > anchorTime;
                  const surfaced = surfacedReplies.get(m.id) ?? [];
                  return (
                    <Fragment key={m.id}>
                      {renderChatBubble(m, {
                        keyStr: m.id,
                        dimmed: isFuture,
                        isAnchor,
                        attachRef: isAnchor,
                        hideQuote: false,
                      })}
                      {/* My own future replies to this message, surfaced here in
                          regular color right after the message they answer. */}
                      {surfaced.map((r) =>
                        renderChatBubble(r, {
                          keyStr: `${r.id}:surfaced`,
                          dimmed: false,
                          isAnchor: false,
                          attachRef: false,
                          hideQuote: true,
                          surfaced: true,
                        }),
                      )}
                    </Fragment>
                  );
                })
              )}
            </div>

            {/* Floating "Back to message" button — shows when the anchor scrolls
                out of view, jumps back to the opened message. */}
            {openedChatMsgId && !anchorVisible && threadMessages.length > 0 && (
              <button
                type="button"
                onClick={scrollToAnchor}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-purple-600 text-white text-xs font-medium px-3 py-1.5 shadow-lg hover:bg-purple-700 transition-colors"
              >
                {anchorDir === 'down' ? <ArrowDown size={13} /> : <ArrowUp size={13} />} Back to message
              </button>
            )}
          </div>

          {/* Chat-send permission not granted — this account was connected before
              chat replies existed and only has read access. Reconnect to fix. */}
          {account.hasChatScope === false && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertOctagon size={14} className="mt-0.5 shrink-0" />
              <span>
                This account hasn't granted permission to send chat replies — it was
                connected before chat replies were enabled. Reconnect the account and
                approve the chat permission to reply.
              </span>
            </div>
          )}

          {/* Reply button */}
          {!chatReplyOpen && (
            <Button
              size="sm"
              variant="outline"
              className="w-fit gap-1"
              onClick={handleOpenChatReply}
            >
              <Reply size={14} /> Reply
            </Button>
          )}

          {/* Inline chat reply form */}
          {chatReplyOpen && (
            <div className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reply in {selectedSpaceName}
              </p>
              {/* Quote-in-reply preview (removable, like Google Chat) */}
              {quoteTarget && (
                <div className="flex items-start gap-2 rounded-md border-l-2 border-purple-400 bg-purple-50/60 pl-2 pr-2 py-1.5 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-purple-800">Replying to {quoteTarget.sender}</span>
                    <p className="text-muted-foreground line-clamp-2">{quoteTarget.text || '(no text)'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuoteTarget(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Remove quote"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Message</Label>
                <textarea
                  className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={chatReplyText}
                  onChange={(e) => setChatReplyText(e.target.value)}
                  placeholder="Write your reply…"
                  rows={5}
                />
              </div>
              {sendChatMutation.isError && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-destructive">
                    {(sendChatMutation.error as Error)?.message ?? 'Failed to send'}
                  </p>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start border-amber-300 text-amber-700 hover:bg-amber-50 text-xs"
                      onClick={() => void handleConnect()}
                      disabled={connecting}
                    >
                      {connecting ? 'Opening…' : 'Re-connect Gmail to fix permissions'}
                    </Button>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={sendChatMutation.isPending || !chatReplyText.trim()}
                  onClick={handleSendChatReply}
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                >
                  <Send size={13} />
                  {sendChatMutation.isPending ? 'Sending…' : 'Send Reply'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setChatReplyOpen(false); setChatReplyText(''); setQuoteTarget(null); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Email detail view ─────────────────────────────────────────────────────

  if (selectedMsgId) {
    return (
      <div className="flex flex-col gap-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
          onClick={() => { setSelectedMsgId(null); setReplyOpen(false); }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        {emailDetailLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        )}

        {emailDetail && (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-base">{emailDetail.subject || '(no subject)'}</h2>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div><span className="font-medium">From:</span> {emailDetail.from}</div>
              <div><span className="font-medium">To:</span> {emailDetail.to}</div>
              <div><span className="font-medium">Date:</span> {formatEmailDate(emailDetail.date)}</div>
            </div>
            <div className="border rounded-md overflow-hidden mt-2">
              {emailDetail.bodyHtml ? (
                <iframe
                  srcDoc={injectBaseTarget(
                    rewriteInlineImages(
                      emailDetail.bodyHtml,
                      emailDetail.attachments ?? [],
                      (att) =>
                        emailAttachmentUrl(token ?? '', companyId, emailDetail.id, att, 'inline'),
                    ),
                  )}
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  className="w-full min-h-96 border-0"
                  title="Email body"
                />
              ) : (
                <pre className="p-4 text-sm whitespace-pre-wrap font-sans">
                  {emailDetail.bodyText ?? '(empty)'}
                </pre>
              )}
            </div>

            {/* Attachment strip — inline images already show in the body above */}
            {(() => {
              const strip = (emailDetail.attachments ?? []).filter((a) => !a.isInline);
              if (strip.length === 0) return null;
              return (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments ({strip.length})
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {strip.map((att) => (
                      <AttachmentPreview
                        key={att.attachmentId}
                        url={emailAttachmentUrl(token ?? '', companyId, emailDetail.id, att, 'inline')}
                        downloadUrl={emailAttachmentUrl(token ?? '', companyId, emailDetail.id, att, 'attachment')}
                        mimeType={att.mimeType}
                        filename={att.filename}
                        size={att.size}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            {!replyOpen && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => handleOpenReply(emailDetail)}
                >
                  <Reply size={14} /> Reply
                </Button>
                {selectedMsgIsRead && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-muted-foreground"
                    disabled={markUnreadMutation.isPending}
                    onClick={() => {
                      markUnreadMutation.mutate(emailDetail.id, {
                        onSuccess: () => { setSelectedMsgId(null); setReplyOpen(false); },
                      });
                    }}
                  >
                    <MailOpen size={14} /> Mark as unread
                  </Button>
                )}
              </div>
            )}

            {/* Inline reply form */}
            {replyOpen && (
              <div className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reply</p>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    value={replyForm.to}
                    onChange={(e) => setReplyForm((f) => ({ ...f, to: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">CC</Label>
                  <Input
                    value={replyForm.cc}
                    onChange={(e) => setReplyForm((f) => ({ ...f, cc: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={replyForm.subject}
                    onChange={(e) => setReplyForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Message</Label>
                  <textarea
                    className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={replyForm.body}
                    onChange={(e) => setReplyForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Write your reply…"
                    rows={5}
                  />
                </div>
                {sendMutation.isError && (
                  <p className="text-xs text-destructive">
                    {(sendMutation.error as Error)?.message ?? 'Failed to send'}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={sendMutation.isPending}
                    onClick={handleSendReply}
                    className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                  >
                    <Send size={13} />
                    {sendMutation.isPending ? 'Sending…' : 'Send Reply'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setReplyOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Inbox / folder view ───────────────────────────────────────────────────

  const isLoading = isInbox ? (emailsLoading || chatsLoading) : emailsLoading;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-teal-600" />
          <Badge variant="outline" className="text-teal-700 border-teal-200 bg-teal-50">
            {account.gmailAddress}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                size="sm"
                onClick={() => setComposeOpen(true)}
                className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              >
                <Plus size={14} /> Compose
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1"
                onClick={() => setDisconnectConfirmOpen(true)}
              >
                <Trash2 size={14} /> Disconnect
              </Button>
            </>
          )}
        </div>
      </div>

      {/* New email banner */}
      {newEmailBanner && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-sm">
          <span className="flex items-center gap-2">
            <Mail size={14} className="text-teal-600" />
            New email received
          </span>
          <button onClick={() => setNewEmailBanner(false)} className="text-teal-600 hover:text-teal-800">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Re-connect notice for missing Chat scopes */}
      {chatData?.needsReconnect && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <span>
            Google Chat messages are unavailable.{' '}
            {isAdmin
              ? 'Re-connect the Gmail account to restore them.'
              : 'An admin needs to re-connect the Gmail account.'}
          </span>
          {isAdmin && (
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs" onClick={() => void handleConnect()}>
              Re-connect
            </Button>
          )}
        </div>
      )}

      {/* No Chat spaces notice */}
      {!chatData?.needsReconnect && chatData?.chatStatus === 'no_spaces' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border text-muted-foreground text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>No Google Chat spaces found for this account. Chat messages will appear here once conversations exist.</span>
        </div>
      )}

      {/* Chat disabled notice */}
      {chatData?.chatStatus === 'chat_disabled' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border text-muted-foreground text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>Google Chat is not enabled for this account. Email messages are still available.</span>
        </div>
      )}

      {/* Chat app not configured in Google Cloud Console */}
      {chatData?.chatStatus === 'app_not_configured' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>Google Chat app is not configured. In Google Cloud Console → Google Chat API → Configuration, fill in the app name and set status to Enabled.</span>
        </div>
      )}

      {/* Chat API error notice */}
      {chatData?.chatStatus === 'error' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>Could not load Google Chat messages. Email messages are still available.</span>
        </div>
      )}

      {/* Chat query failed entirely (network error / 5xx — chatData stays undefined) */}
      {!!chatsError && !chatData && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <span className="flex items-center gap-2">
            <MessageSquare size={13} className="shrink-0" />
            Could not load Google Chat messages. Email messages are still available.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs"
            onClick={() => void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] })}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Chat fetched ok but no messages found (history may be off) */}
      {chatData?.chatStatus === 'ok' && chatData.messages.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border text-muted-foreground text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>No recent Google Chat messages found. History may be disabled for your chat spaces.</span>
        </div>
      )}

      {/* Folder tabs */}
      <div className="flex items-center gap-1 border-b">
        {FOLDERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleSelectFolder(id)}
            className={[
              'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
              selectedLabel === id
                ? 'text-teal-700 border-b-2 border-teal-600 font-medium -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Icon size={13} />
            {label}
            {id === 'INBOX' && (unreadData?.count ?? 0) > 0 && (
              <span className="ml-0.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-semibold leading-none">
                {unreadData!.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Email / unified list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : isInbox ? (
        /* ── Unified inbox (emails + chats) ── */
        <Card className="overflow-hidden gap-0 py-0 rounded-lg">
          {unifiedItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Inbox is empty</div>
          ) : (
            unifiedItems.map((item, idx) =>
              item.kind === 'email' ? (
                <div
                  key={item.data.id}
                  className={[
                    'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer group',
                    !item.data.isRead ? 'bg-white hover:bg-blue-50/60' : 'bg-muted/10 hover:bg-muted/30',
                    idx > 0 ? 'border-t border-border/60' : '',
                  ].join(' ')}
                  onClick={() => handleOpenEmail(item.data)}
                >
                  {/* Unread accent bar */}
                  {!item.data.isRead && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-teal-500 rounded-l-lg" />
                  )}
                  {/* Read/unread toggle dot */}
                  <button
                    className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
                    title={item.data.isRead ? 'Mark as unread' : 'Mark as read'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.data.isRead) markUnreadMutation.mutate(item.data.id);
                      else markReadMutation.mutate(item.data.id);
                    }}
                  >
                    <span className={[
                      'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                      !item.data.isRead ? 'bg-teal-500 border-teal-500' : 'bg-transparent border-muted-foreground/40',
                    ].join(' ')} />
                  </button>
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                    {senderInitial(item.data.from)}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={['text-sm truncate', !item.data.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'].join(' ')}>
                        {item.data.from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || item.data.from}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200 font-medium">
                          Email
                        </Badge>
                        <span className={['text-xs', !item.data.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>
                          {formatEmailDate(item.data.date)}
                        </span>
                      </div>
                    </div>
                    <span className={['text-sm truncate', !item.data.isRead ? 'font-semibold' : 'text-foreground/80'].join(' ')}>
                      {item.data.subject || '(no subject)'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{item.data.snippet}</span>
                  </div>
                </div>
              ) : (
                <div
                  key={item.data.id}
                  className={[
                    'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer',
                    !item.data.isRead ? 'bg-white hover:bg-purple-50/60' : 'bg-muted/10 hover:bg-purple-50/40',
                    idx > 0 ? 'border-t border-border/60' : '',
                  ].join(' ')}
                  onClick={() => handleOpenChat(item.data)}
                >
                  {/* Unread accent bar */}
                  {!item.data.isRead && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-purple-500 rounded-l-lg" />
                  )}
                  {/* Read/unread toggle dot */}
                  <button
                    className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
                    title={item.data.isRead ? 'Mark as unread' : 'Mark as read'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.data.isRead) markChatUnreadMutation.mutate(item.data.id);
                      else markChatReadMutation.mutate(item.data.id);
                    }}
                  >
                    <span className={[
                      'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                      !item.data.isRead ? 'bg-purple-500 border-purple-500' : 'bg-transparent border-muted-foreground/40',
                    ].join(' ')} />
                  </button>
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                    {(item.data.sender[0] ?? '?').toUpperCase()}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={['text-sm truncate flex items-center gap-1.5', !item.data.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'].join(' ')}>
                        <MessageSquare size={11} className="text-purple-500 shrink-0" />
                        {item.data.sender}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 font-medium">
                          Chat
                        </Badge>
                        <span className={['text-xs', !item.data.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>
                          {formatEmailDate(item.data.createTime)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground truncate">{item.data.spaceName}</span>
                    <span className={['text-xs truncate flex items-center gap-1', !item.data.isRead ? 'font-medium text-foreground/80' : 'text-muted-foreground'].join(' ')}>
                      {item.data.hasAttachments && <Paperclip size={11} className="shrink-0" />}
                      {item.data.text || (item.data.hasAttachments ? 'Attachment' : '(no text)')}
                    </span>
                  </div>
                </div>
              ),
            )
          )}
        </Card>
      ) : (
        /* ── Email-only folder view (Sent / Spam / Trash) ── */
        <>
          <Card className="overflow-hidden gap-0 py-0 rounded-lg">
            {(emailList?.messages ?? []).length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No messages</div>
            ) : (
              (emailList?.messages ?? []).map((msg: EmailSummary, idx: number) => (
                <div
                  key={msg.id}
                  className={[
                    'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer group',
                    !msg.isRead ? 'bg-white hover:bg-blue-50/60' : 'bg-muted/10 hover:bg-muted/30',
                    idx > 0 ? 'border-t border-border/60' : '',
                  ].join(' ')}
                  onClick={() => handleOpenEmail(msg)}
                >
                  {!msg.isRead && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-teal-500 rounded-l-lg" />
                  )}
                  <button
                    className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
                    title={msg.isRead ? 'Mark as unread' : 'Mark as read'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (msg.isRead) markUnreadMutation.mutate(msg.id);
                      else markReadMutation.mutate(msg.id);
                    }}
                  >
                    <span className={[
                      'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                      !msg.isRead ? 'bg-teal-500 border-teal-500' : 'bg-transparent border-muted-foreground/40',
                    ].join(' ')} />
                  </button>
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                    {senderInitial(msg.from)}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={['text-sm truncate', !msg.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'].join(' ')}>
                        {msg.from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || msg.from}
                      </span>
                      <span className={['text-xs shrink-0', !msg.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>
                        {formatEmailDate(msg.date)}
                      </span>
                    </div>
                    <span className={['text-sm truncate', !msg.isRead ? 'font-semibold' : 'text-foreground/80'].join(' ')}>
                      {msg.subject || '(no subject)'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{msg.snippet}</span>
                  </div>
                </div>
              ))
            )}
          </Card>

          {/* Pagination (email-only folders) */}
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={pageHistory.length === 0}
              onClick={handlePrevPage}
              className="gap-1"
            >
              <ChevronLeft size={14} /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!emailList?.nextPageToken}
              onClick={handleNextPage}
              className="gap-1"
            >
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </>
      )}

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={16} /> New Email
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">To</Label>
              <Input
                value={composeForm.to}
                onChange={(e) => setComposeForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="recipient@example.com"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">CC</Label>
              <Input
                value={composeForm.cc}
                onChange={(e) => setComposeForm((f) => ({ ...f, cc: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Subject</Label>
              <Input
                value={composeForm.subject}
                onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Subject"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Message</Label>
              <textarea
                className="w-full min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={composeForm.body}
                onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Write your message…"
                rows={8}
              />
            </div>
            {sendMutation.isError && (
              <p className="text-xs text-destructive">
                {(sendMutation.error as Error)?.message ?? 'Failed to send'}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={sendMutation.isPending}
              onClick={handleSend}
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            >
              <Send size={14} />
              {sendMutation.isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect confirm dialog */}
      <Dialog open={disconnectConfirmOpen} onOpenChange={setDisconnectConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Gmail?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove access to <strong>{account.gmailAddress}</strong>. You can reconnect
            anytime from the Billing section.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDisconnectConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnectMutation.isPending}
              onClick={handleDisconnect}
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
