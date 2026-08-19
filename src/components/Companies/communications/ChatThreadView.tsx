import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertOctagon, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, MailOpen, Printer, Reply, Send, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ChatInboxMessage, ChatMessage, EmailProvider, GmailAccount } from '@/api/gmail';
import { useGmailChatThread } from '@/hooks/useGmailChatThread';
import { useSendChatMessage } from '@/hooks/useSendChatMessage';
import { useMarkChatUnread } from '@/hooks/useMarkChatUnread';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { RichTextEditor } from '../RichTextEditor';
import { PolishButton, PolishPanel } from '../PolishPanel';
import { htmlToText, openPrintWindow, textToHtml } from '../message-utils';
import { ChatBubble } from './ChatBubble';
import { buildChatPrintHtml } from './print-html';
import { htmlToChatMarkdown } from './chat-markdown';
import type { CompleteTarget, QuoteTarget } from './types';

/**
 * A chat conversation, frozen at the message the user opened.
 *
 * Everything after that message is the "future" of that moment: dimmed, still
 * readable, and never the target of Reply. Re-anchoring to an earlier message
 * (clicking its reply arrow, or a quoted preview) moves that boundary.
 *
 * Reply state lives here rather than in the shell: this view unmounts on Back, and
 * that unmount is what used to be done by hand in `handleCloseChat`.
 */
export function ChatThreadView({
  companyId,
  token,
  isAdmin,
  account,
  provider,
  providerLabels,
  connecting,
  onConnect,
  spaceId,
  openedChatMsgId,
  openedChatMsgTime,
  inboxRow,
  active,
  pollEnabled,
  onClose,
  onAnchorChange,
  onRequestComplete,
  onUncomplete,
}: {
  companyId: number;
  token: string | null;
  isAdmin: boolean;
  account: GmailAccount;
  provider: EmailProvider;
  providerLabels: { name: string; chat: string };
  connecting: boolean;
  onConnect: (provider: EmailProvider) => void;
  spaceId: string;
  openedChatMsgId: string | null;
  openedChatMsgTime: string | null;
  /** The inbox row this was opened from — the fallback for space name / completion. */
  inboxRow: ChatInboxMessage | null;
  /** The tab is the visible one. Drives scroll positioning, which must NOT also
   *  depend on the attachment viewer — closing an overlay would re-fire the
   *  anchor scroll and yank the thread out from under the user. */
  active: boolean;
  /** False while the tab is hidden or an attachment preview is open. */
  pollEnabled: boolean;
  onClose: () => void;
  onAnchorChange: (m: { id: string; createTime: string }) => void;
  onRequestComplete: (target: CompleteTarget) => void;
  onUncomplete: (kind: 'email' | 'chat', id: string) => void;
}) {
  const {
    data: chatThread,
    isLoading: chatThreadLoading,
    isError: chatThreadError,
  } = useGmailChatThread(companyId, spaceId, pollEnabled);
  const sendChatMutation = useSendChatMessage(companyId);
  const markChatUnreadMutation = useMarkChatUnread(companyId);
  const polish = useDraftPolish('chat');

  const [chatReplyOpen, setChatReplyOpen] = useState(false);
  const [chatReplyHtml, setChatReplyHtml] = useState('');
  // The message the reply will natively quote (default = the opened/anchor
  // message; cleared → plain reply). Mirrors Google Chat's "Quote in reply".
  const [quoteTarget, setQuoteTarget] = useState<QuoteTarget | null>(null);

  const threadScrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const chatReplyFormRef = useRef<HTMLDivElement>(null);
  // Whether the anchor (opened) message is currently visible in the scroll
  // container — drives the floating "Back to message" button. `anchorDir` is
  // the direction to scroll to reach it when it's off-screen.
  const [anchorVisible, setAnchorVisible] = useState(true);
  const [anchorDir, setAnchorDir] = useState<'up' | 'down'>('up');

  const threadMessages = chatThread?.messages ?? [];
  // The anchor message object — prefer the freshly-fetched thread copy (has the
  // most up-to-date lastUpdateTime for quoting), fall back to the inbox row.
  const anchorMsg: QuoteTarget | null = openedChatMsgId
    ? threadMessages.find((m) => m.id === openedChatMsgId) ??
      (inboxRow
        ? {
            id: inboxRow.id,
            sender: inboxRow.sender,
            text: inboxRow.text,
            lastUpdateTime: inboxRow.lastUpdateTime,
          }
        : null)
    : null;
  // Display name for the open thread — prefer freshly-fetched thread metadata.
  const selectedSpaceName = chatThread?.spaceName ?? inboxRow?.spaceName ?? 'Conversation';

  const scrollToAnchor = useCallback(() => {
    anchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (chatReplyOpen) chatReplyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [chatReplyOpen]);

  // On open (or when the anchor / thread changes), position the anchor message
  // at the BOTTOM of the visible area so the view reads as if the conversation
  // ends there — the dimmed "future" messages sit just below (scroll to see).
  useLayoutEffect(() => {
    if (!active || !openedChatMsgId) return;
    const el = anchorRef.current;
    if (el) el.scrollIntoView({ block: 'end' });
    // Re-run when the loaded thread changes (anchor node mounts after fetch), and
    // when the tab becomes visible again — while hidden the node had no layout box,
    // so scrollIntoView was a no-op and the box's offset was reset to 0.
  }, [active, openedChatMsgId, chatThread?.messages?.length]);

  // Track anchor visibility to toggle the "Back to message" button.
  useEffect(() => {
    const root = threadScrollRef.current;
    const target = anchorRef.current;
    if (!active || !root || !target) return;
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
  }, [active, openedChatMsgId, chatThread?.messages?.length]);

  const resetReply = () => {
    setChatReplyOpen(false);
    setChatReplyHtml('');
    setQuoteTarget(null);
    polish.reset();
  };

  // Re-anchor the open conversation to an earlier message: it scrolls into focus,
  // later messages dim as "future", and the bottom Reply then quotes it. This is
  // how the user "navigates to" a previous message to reply there.
  const navigateToMessage = (m: { id: string; createTime: string }) => {
    onAnchorChange(m);
    // Reset any in-progress reply so the composer re-targets the new anchor.
    resetReply();
  };

  // Open the reply box, defaulting to natively quoting the anchor message
  // (Google Chat's "Quote in reply"). The user can clear the quote before send.
  const handleOpenChatReply = () => {
    setQuoteTarget(anchorMsg);
    setChatReplyOpen(true);
    polish.reset();
  };

  const handleSendChatReply = () => {
    if (!htmlToText(chatReplyHtml).trim()) return;
    sendChatMutation.mutate(
      {
        spaceId,
        // Google Chat renders its own markdown tokens; Teams takes HTML directly.
        // Quoting is Google-only (Teams ignores the quote metadata).
        text: provider === 'MICROSOFT' ? chatReplyHtml : htmlToChatMarkdown(chatReplyHtml),
        ...(provider !== 'MICROSOFT' && quoteTarget
          ? {
              quotedMessageName: quoteTarget.id,
              quotedMessageLastUpdateTime: quoteTarget.lastUpdateTime,
            }
          : {}),
      },
      {
        onSuccess: () => {
          setChatReplyOpen(false);
          setChatReplyHtml('');
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

  const chatContext = threadMessages
    .map((m) => `${m.isOwn ? 'You' : m.sender}: ${m.text}`)
    .join('\n');

  const handlePrintChat = () => {
    const name = chatThread?.spaceName || selectedSpaceName || 'Conversation';
    openPrintWindow(name, buildChatPrintHtml(name, threadMessages));
  };

  // ── Anchor / future / surfaced-reply bookkeeping ───────────────────────────
  const anchorTime = openedChatMsgTime ? new Date(openedChatMsgTime).getTime() : null;
  const isFutureTime = (createTime: string) =>
    anchorTime !== null && new Date(createTime).getTime() > anchorTime;
  const byId = new Map<string, ChatMessage>(threadMessages.map((m) => [m.id, m]));

  // My own future replies that answer a message currently in the REGULAR zone are
  // surfaced again in regular color right after that message, so a just-sent reply
  // isn't buried among later dimmed activity. A reply to a future/light message is
  // NOT surfaced — relative to the anchor it's future and stays light.
  const surfacedReplies = new Map<string, ChatMessage[]>();
  const surfacedIds = new Set<string>();
  if (anchorTime !== null) {
    for (const m of threadMessages) {
      if (!(m.isOwn && m.quotedMessageName && isFutureTime(m.createTime))) continue;
      const answered = byId.get(m.quotedMessageName);
      if (!answered || isFutureTime(answered.createTime)) continue;
      const arr = surfacedReplies.get(m.quotedMessageName) ?? [];
      arr.push(m);
      surfacedReplies.set(m.quotedMessageName, arr);
      surfacedIds.add(m.id);
    }
  }

  // A surfaced reply's dimmed chronological copy is only worth showing when its true
  // order differs from its surfaced spot — i.e. some light (future, non-surfaced)
  // message falls between the answered message and the reply. Otherwise the surfaced
  // copy already sits in the right place and the dimmed copy is a redundant duplicate.
  const showLightCopy = (r: ChatMessage) => {
    const answered = r.quotedMessageName ? byId.get(r.quotedMessageName) : undefined;
    if (!answered) return true;
    const xt = new Date(answered.createTime).getTime();
    const rt = new Date(r.createTime).getTime();
    return threadMessages.some((mm) => {
      if (mm.id === r.id || surfacedIds.has(mm.id) || !isFutureTime(mm.createTime))
        return false;
      const mt = new Date(mm.createTime).getTime();
      return mt > xt && mt < rt;
    });
  };

  const openedIsCompleted = inboxRow?.isCompleted ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-20 -mx-6 -mt-5 px-6 pt-5 pb-2 bg-background/95 backdrop-blur-sm">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
          onClick={onClose}
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium shrink-0">
              Chat
            </span>
            <span className="text-sm font-medium truncate">{selectedSpaceName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={threadMessages.length === 0}
              onClick={handlePrintChat}
            >
              <Printer size={14} /> Print
            </Button>
            {openedChatMsgId && (
              openedIsCompleted ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-blue-600 border-blue-200 hover:text-blue-700"
                  onClick={() => onUncomplete('chat', openedChatMsgId)}
                >
                  <CheckCircle2 size={14} className="fill-blue-100" /> Completed
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => onRequestComplete({ kind: 'chat', id: openedChatMsgId, fromDetail: true })}
                >
                  <CheckCircle2 size={14} /> Mark complete
                </Button>
              )
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-muted-foreground"
              disabled={markChatUnreadMutation.isPending || !openedChatMsgId}
              onClick={() => {
                if (!openedChatMsgId) return;
                markChatUnreadMutation.mutate(openedChatMsgId, { onSuccess: onClose });
              }}
            >
              <MailOpen size={14} /> Mark as unread
            </Button>
          </div>
        </div>

        {/* Conversation thread */}
        <div className="relative">
          <div ref={threadScrollRef} className="border rounded-md bg-muted/10 max-h-[28rem] overflow-y-auto p-4 flex flex-col gap-3">
            {chatThreadError && threadMessages.length === 0 ? (
              /* A restored thread may no longer be reachable (left the space, etc.). */
              <div className="py-6 flex flex-col items-center gap-3 text-sm text-muted-foreground">
                This conversation is no longer available.
                <Button size="sm" variant="outline" onClick={onClose}>
                  Back to inbox
                </Button>
              </div>
            ) : chatThreadLoading && threadMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading conversation…</p>
            ) : threadMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No messages in this conversation.</p>
            ) : (
              threadMessages.map((m) => {
                const isAnchor = m.id === openedChatMsgId;
                // Messages newer than the anchor are the "future" — dimmed.
                const isFuture = isFutureTime(m.createTime);
                const surfaced = surfacedReplies.get(m.id) ?? [];
                // A surfaced reply's own chronological bubble is dropped unless its
                // light copy conveys a different order (avoids redundant duplication).
                const skipChrono = surfacedIds.has(m.id) && !showLightCopy(m);
                return (
                  <Fragment key={m.id}>
                    {!skipChrono && (
                      <ChatBubble
                        message={m}
                        messages={threadMessages}
                        dimmed={isFuture}
                        isAnchor={isAnchor}
                        anchorRef={isAnchor ? anchorRef : undefined}
                        hideQuote={false}
                        companyId={companyId}
                        token={token}
                        onNavigateToMessage={navigateToMessage}
                      />
                    )}
                    {/* My own future replies to this message, surfaced here in
                        regular color right after the message they answer. */}
                    {surfaced.map((r) => (
                      <ChatBubble
                        key={`${r.id}:surfaced`}
                        message={r}
                        messages={threadMessages}
                        dimmed={false}
                        isAnchor={false}
                        hideQuote
                        surfaced
                        companyId={companyId}
                        token={token}
                        onNavigateToMessage={navigateToMessage}
                      />
                    ))}
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
          <Button size="sm" variant="outline" className="w-fit gap-1" onClick={handleOpenChatReply}>
            <Reply size={14} /> Reply
          </Button>
        )}

        {/* Inline chat reply form. Not built on InlineComposerPanel: it has no
            To/CC/Subject and carries a quote-in-reply chip instead. */}
        {chatReplyOpen && (
          <div ref={chatReplyFormRef} className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
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
              <RichTextEditor
                mode="chat"
                html={chatReplyHtml}
                onChange={setChatReplyHtml}
                placeholder="Write your reply…"
                minHeight={110}
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
                    onClick={() => onConnect(provider)}
                    disabled={connecting}
                  >
                    {connecting ? 'Opening…' : `Re-connect ${providerLabels.name} to fix permissions`}
                  </Button>
                )}
              </div>
            )}
            <PolishPanel
              polish={polish}
              context={chatContext}
              onAccept={(t) => setChatReplyHtml(textToHtml(t))}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={sendChatMutation.isPending || !htmlToText(chatReplyHtml).trim()}
                onClick={handleSendChatReply}
                className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              >
                <Send size={13} />
                {sendChatMutation.isPending ? 'Sending…' : 'Send Reply'}
              </Button>
              <PolishButton
                polish={polish}
                draftPlain={htmlToText(chatReplyHtml)}
                context={chatContext}
              />
              <Button size="sm" variant="outline" onClick={resetReply}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
