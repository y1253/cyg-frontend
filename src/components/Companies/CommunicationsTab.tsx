import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Mail, Send, ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2,
  Inbox, SendHorizonal, AlertOctagon, Trash, X, MessageSquare, Reply, MailOpen,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGmailAccount } from '@/hooks/useGmailAccount';
import { useGmailEmails } from '@/hooks/useGmailEmails';
import { useGmailEmail } from '@/hooks/useGmailEmail';
import { useGmailChats } from '@/hooks/useGmailChats';
import { useSendEmail } from '@/hooks/useSendEmail';
import { useSendChatMessage } from '@/hooks/useSendChatMessage';
import { useMarkEmailUnread } from '@/hooks/useMarkEmailUnread';
import { useDisconnectGmail } from '@/hooks/useDisconnectGmail';
import { useMarkEmailRead } from '@/hooks/useMarkEmailRead';
import { useGmailUnreadCount } from '@/hooks/useGmailUnreadCount';
import { fetchAuthUrl } from '@/api/gmail';
import type { EmailSummary, ChatMessage, EmailDetail } from '@/api/gmail';
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
  | { kind: 'chat'; data: ChatMessage };

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

function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
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
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
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
  const sendMutation = useSendEmail(companyId);
  const sendChatMutation = useSendChatMessage(companyId);
  const disconnectMutation = useDisconnectGmail(companyId);
  const markReadMutation = useMarkEmailRead(companyId);
  const markUnreadMutation = useMarkEmailUnread(companyId);
  const { data: unreadData } = useGmailUnreadCount(companyId, account);

  // Build unified sorted list for INBOX
  const unifiedItems: UnifiedItem[] = isInbox
    ? [
        ...(emailList?.messages ?? []).map((e): UnifiedItem => ({ kind: 'email', data: e })),
        ...(chatData?.messages ?? []).map((c): UnifiedItem => ({ kind: 'chat', data: c })),
      ].sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a))
    : [];

  // Selected chat detail
  const selectedChat = selectedChatId
    ? (chatData?.messages ?? []).find((m) => m.id === selectedChatId) ?? null
    : null;

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
    setSelectedChatId(null);
  };

  const handleOpenEmail = (msg: EmailSummary) => {
    if (!msg.isRead) markReadMutation.mutate(msg.id);
    setSelectedMsgId(msg.id);
    setSelectedMsgIsRead(true); // always read after opening (auto-marked or was already read)
    setSelectedChatId(null);
    setReplyOpen(false);
  };

  const handleOpenChat = (msg: ChatMessage) => {
    setSelectedChatId(msg.id);
    setSelectedMsgId(null);
    setReplyOpen(false);
    setChatReplyOpen(false);
    setChatReplyText('');
  };

  const handleSendChatReply = () => {
    if (!selectedChat || !chatReplyText.trim()) return;
    sendChatMutation.mutate(
      { spaceId: selectedChat.spaceId, text: chatReplyText },
      {
        onSuccess: () => {
          setChatReplyOpen(false);
          setChatReplyText('');
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

  // ── Chat detail view ──────────────────────────────────────────────────────

  if (selectedChatId && selectedChat) {
    return (
      <div className="flex flex-col gap-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
          onClick={() => { setSelectedChatId(null); setChatReplyOpen(false); setChatReplyText(''); }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              Chat
            </span>
            <span className="text-xs text-muted-foreground">{selectedChat.spaceName}</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div><span className="font-medium">From:</span> {selectedChat.sender}</div>
            <div><span className="font-medium">Time:</span> {formatEmailDate(selectedChat.createTime)}</div>
          </div>
          <div className="border rounded-md p-4 text-sm whitespace-pre-wrap bg-muted/20">
            {selectedChat.text || '(empty message)'}
          </div>

          {/* Reply button */}
          {!chatReplyOpen && (
            <Button
              size="sm"
              variant="outline"
              className="w-fit gap-1"
              onClick={() => setChatReplyOpen(true)}
            >
              <Reply size={14} /> Reply
            </Button>
          )}

          {/* Inline chat reply form */}
          {chatReplyOpen && (
            <div className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reply in {selectedChat.spaceName}
              </p>
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
                <p className="text-xs text-destructive">
                  {(sendChatMutation.error as Error)?.message ?? 'Failed to send'}
                </p>
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
                <Button size="sm" variant="outline" onClick={() => { setChatReplyOpen(false); setChatReplyText(''); }}>
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
                  srcDoc={injectBaseTarget(emailDetail.bodyHtml)}
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
                    'flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer bg-muted/10 hover:bg-purple-50/40',
                    idx > 0 ? 'border-t border-border/60' : '',
                  ].join(' ')}
                  onClick={() => handleOpenChat(item.data)}
                >
                  {/* Placeholder dot width to align with email toggle */}
                  <span className="shrink-0 w-5 h-5 mt-1" />
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                    {(item.data.sender[0] ?? '?').toUpperCase()}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate font-medium text-foreground/80 flex items-center gap-1.5">
                        <MessageSquare size={11} className="text-purple-500 shrink-0" />
                        {item.data.sender}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 font-medium">
                          {item.data.spaceType === 'DIRECT_MESSAGE' ? 'DM' : 'Chat'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatEmailDate(item.data.createTime)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground truncate">{item.data.spaceName}</span>
                    <span className="text-xs text-muted-foreground truncate">{item.data.text}</span>
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
