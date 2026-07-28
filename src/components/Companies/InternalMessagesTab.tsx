import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, Circle, Forward, Inbox, ListChecks, MailOpen,
  Paperclip, Pencil, Printer, Reply, Send, SendHorizonal, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { RichTextEditor } from './RichTextEditor';
import { UserAutocomplete } from './UserAutocomplete';
import { InternalMessageRow } from './InternalMessageRow';
import { InternalComposeDialog } from './InternalComposeDialog';
import { PolishButton, PolishPanel } from './PolishPanel';
import { EmailBodyFrame } from './EmailBodyFrame';
import {
  dedupeById, escapeHtml, formatBytes, formatEmailDate, htmlToText,
  openPrintWindow, prefixFwdSubject, prefixReSubject, senderInitial, textToHtml,
} from './message-utils';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { useInternalMessages } from '@/hooks/useInternalMessages';
import { useInternalMessageThread } from '@/hooks/useInternalMessageThread';
import { useInternalMessageState } from '@/hooks/useInternalMessageState';
import { useSendInternalMessage } from '@/hooks/useSendInternalMessage';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import {
  useInternalUncompletedCount,
  useInternalUnreadCount,
} from '@/hooks/useInternalUncompletedCount';
import { internalAttachmentUrl, internalEventsUrl } from '@/api/internalMessages';
import type {
  InternalFolder,
  InternalMessageDetail,
  InternalMessageSummary,
} from '@/api/internalMessages';

interface Props {
  /**
   * Messages is the visible tab. The component stays MOUNTED while hidden so an
   * open thread and a half-typed reply survive a tab switch — polling and the SSE
   * subscription are gated on this, not on mount.
   */
  active: boolean;
}

const FOLDERS: { id: InternalFolder; label: string; icon: typeof Inbox }[] = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'UNCOMPLETED', label: 'Uncompleted', icon: ListChecks },
  { id: 'UNREAD', label: 'Unread', icon: MailOpen },
  { id: 'SENT', label: 'Sent', icon: SendHorizonal },
];

const UI_KEY = 'internal-msgs-ui';
const POLISH_CONTEXT = 'An internal message between colleagues at a bookkeeping firm.';

interface StoredUI {
  folder?: InternalFolder;
  openThreadId?: number | null;
  search?: string;
}

function getStoredUI(): StoredUI {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') as StoredUI;
  } catch {
    return {};
  }
}

export function InternalMessagesTab({ active }: Props) {
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const stored = useRef(getStoredUI()).current;

  const [folder, setFolder] = useState<InternalFolder>(stored.folder ?? 'INBOX');
  const [search, setSearch] = useState(stored.search ?? '');
  const [openThreadId, setOpenThreadId] = useState<number | null>(
    stored.openThreadId ?? null,
  );
  const [composeOpen, setComposeOpen] = useState(false);
  const [banner, setBanner] = useState(false);

  // Reply / forward are inline forms below the thread, not dialogs.
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardBody, setForwardBody] = useState('');
  const [forwardTo, setForwardTo] = useState<number[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  const replyPolish = useDraftPolish();
  const forwardPolish = useDraftPolish();
  const replyRef = useRef<HTMLDivElement>(null);
  const forwardRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const listQuery = useInternalMessages(folder, search || undefined, active);
  const threadQuery = useInternalMessageThread(openThreadId, active);
  const stateMutation = useInternalMessageState();
  const sendMutation = useSendInternalMessage();
  const { data: directory = [] } = useUserDirectory(forwardOpen || composeOpen);
  const { data: uncompleted } = useInternalUncompletedCount();
  const { data: unread } = useInternalUnreadCount();

  const messages = useMemo(
    () => dedupeById(listQuery.data?.pages.flatMap((p) => p.messages) ?? []),
    [listQuery.data],
  );
  const threadMessages = threadQuery.data?.messages ?? [];
  const lastMessage: InternalMessageDetail | undefined =
    threadMessages[threadMessages.length - 1];

  // Persist view state (never drafts — a half-typed reply shouldn't outlive the session).
  useEffect(() => {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({ folder, openThreadId, search } satisfies StoredUI),
    );
  }, [folder, openThreadId, search]);

  // ── SSE: instant delivery ─────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !token) return;
    const es = new EventSource(internalEventsUrl(token));
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data as string) as { type?: string };
        if (payload.type !== 'new-message') return;
      } catch {
        return;
      }
      void qc.invalidateQueries({ queryKey: ['internal-messages'] });
      void qc.invalidateQueries({ queryKey: ['internal-uncompleted-count'] });
      void qc.invalidateQueries({ queryKey: ['internal-unread-count'] });
      void qc.invalidateQueries({ queryKey: ['gmail-uncompleted-counts'] });
      if (openThreadId) {
        void qc.invalidateQueries({
          queryKey: ['internal-message-thread', openThreadId],
        });
      }
      setBanner(true);
      setTimeout(() => setBanner(false), 5000);
    };
    // The 15s poll on the list query is the fallback if the stream drops.
    es.onerror = () => es.close();
    return () => es.close();
  }, [active, token, qc, openThreadId]);

  // ── Infinite scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || openThreadId) return;
    const io = new IntersectionObserver((entries) => {
      if (
        entries[0].isIntersecting &&
        listQuery.hasNextPage &&
        !listQuery.isFetchingNextPage
      ) {
        void listQuery.fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [openThreadId, listQuery]);

  // ── Opening a thread ──────────────────────────────────────────────────────
  const openMessage = useCallback(
    (message: InternalMessageSummary) => {
      setOpenThreadId(message.threadId);
      setReplyOpen(false);
      setForwardOpen(false);
      setSendError(null);
      replyPolish.reset();
      forwardPolish.reset();
      // Opening marks only THIS message read — an older unread message in the
      // same thread stays unread, mirroring the chat inbox's per-message model.
      if (!message.isRead && !message.isOwn) {
        stateMutation.mutate({ id: message.id, action: 'read' });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stateMutation],
  );

  const closeThread = () => {
    setOpenThreadId(null);
    setReplyOpen(false);
    setForwardOpen(false);
    replyPolish.reset();
    forwardPolish.reset();
  };

  // ── Reply / forward ───────────────────────────────────────────────────────
  const startReply = () => {
    if (!lastMessage) return;
    setForwardOpen(false);
    setReplyBody('');
    setSendError(null);
    replyPolish.reset();
    setReplyOpen(true);
    setTimeout(
      () => replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      50,
    );
  };

  const startForward = () => {
    if (!lastMessage) return;
    setReplyOpen(false);
    setForwardTo([]);
    setSendError(null);
    forwardPolish.reset();
    // Quote the original below a marked block so AI polish leaves it alone.
    setForwardBody(
      '<div><br></div><div data-cyg-forward>' +
        '<div>---------- Forwarded message ----------</div>' +
        `<div>From: ${escapeHtml(lastMessage.from.name)} &lt;${escapeHtml(lastMessage.from.email)}&gt;</div>` +
        `<div>Date: ${escapeHtml(new Date(lastMessage.date).toLocaleString())}</div>` +
        `<div>Subject: ${escapeHtml(lastMessage.subject || '(no subject)')}</div>` +
        '<div><br></div>' +
        (lastMessage.bodyHtml ??
          `<div>${escapeHtml(lastMessage.bodyText ?? '').replace(/\n/g, '<br>')}</div>`) +
        '</div>',
    );
    setForwardOpen(true);
    setTimeout(
      () => forwardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      50,
    );
  };

  const submitReply = () => {
    if (!lastMessage) return;
    const text = htmlToText(replyBody);
    if (!text.trim()) return;
    setSendError(null);
    // Reply-all minus me: everyone who was on the thread stays on it.
    const recipients = [
      lastMessage.from.id,
      ...lastMessage.to.map((u) => u.id),
    ].filter((id) => id !== user?.id);
    sendMutation.mutate(
      {
        to: [...new Set(recipients)],
        cc: lastMessage.cc.map((u) => u.id).filter((id) => id !== user?.id),
        subject: prefixReSubject(lastMessage.subject),
        body: text,
        bodyHtml: replyBody,
        parentId: lastMessage.id,
      },
      {
        onSuccess: () => {
          setReplyOpen(false);
          setReplyBody('');
          replyPolish.reset();
        },
        onError: (e: unknown) =>
          setSendError((e as Error)?.message ?? 'Failed to send reply'),
      },
    );
  };

  const submitForward = () => {
    if (!lastMessage) return;
    const text = htmlToText(forwardBody);
    if (forwardTo.length === 0) {
      setSendError('Add at least one recipient.');
      return;
    }
    setSendError(null);
    sendMutation.mutate(
      {
        to: forwardTo,
        subject: prefixFwdSubject(lastMessage.subject),
        body: text,
        bodyHtml: forwardBody,
        parentId: lastMessage.id,
        isForward: true,
      },
      {
        onSuccess: () => {
          setForwardOpen(false);
          setForwardBody('');
          setForwardTo([]);
          forwardPolish.reset();
        },
        onError: (e: unknown) =>
          setSendError((e as Error)?.message ?? 'Failed to forward message'),
      },
    );
  };

  const printThread = () => {
    if (!threadMessages.length) return;
    const rows = threadMessages
      .map(
        (m) =>
          `<div class="chat-msg"><div class="who">${escapeHtml(m.from.name)}` +
          `<span class="when">${escapeHtml(new Date(m.date).toLocaleString())}</span></div>` +
          `<div class="print-body">${m.bodyHtml ?? `<div class="text">${escapeHtml(m.bodyText ?? '')}</div>`}</div></div>`,
      )
      .join('');
    const title = threadMessages[0]?.subject || 'Internal message';
    openPrintWindow(
      title,
      `<div class="print-header"><h1>${escapeHtml(title)}</h1></div>${rows}`,
    );
  };

  // ── Thread view ───────────────────────────────────────────────────────────
  if (openThreadId) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 z-10 bg-background border-b flex items-center gap-2 px-1 py-2 flex-wrap">
          <Button variant="ghost" size="sm" className="gap-1" onClick={closeThread}>
            <ArrowLeft size={14} /> Back
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={startReply}>
            <Reply size={14} /> Reply
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={startForward}>
            <Forward size={14} /> Forward
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={printThread}>
            <Printer size={14} /> Print
          </Button>
          {lastMessage && !lastMessage.isOwn && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  stateMutation.mutate({ id: lastMessage.id, action: 'unread' });
                  closeThread();
                }}
              >
                <MailOpen size={14} /> Mark as unread
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() =>
                  stateMutation.mutate({
                    id: lastMessage.id,
                    action: lastMessage.isCompleted ? 'uncomplete' : 'complete',
                  })
                }
              >
                {lastMessage.isCompleted ? (
                  <>
                    <CheckCircle2 size={14} className="text-blue-600" /> Completed
                  </>
                ) : (
                  <>
                    <Circle size={14} /> Mark complete
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3">
          {threadQuery.isLoading && (
            <p className="text-sm text-muted-foreground px-1">Loading…</p>
          )}
          {threadMessages.map((m) => (
            <div key={m.id} className="rounded-lg border bg-background">
              <div className="flex items-start gap-3 px-4 py-3 border-b bg-muted/20">
                <div className="shrink-0 w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-semibold">
                  {senderInitial(m.from.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {m.from.name}
                      {m.isOwn && (
                        <span className="text-xs text-muted-foreground font-normal"> (you)</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatEmailDate(m.date)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    To: {m.to.map((u) => u.name).join(', ') || '—'}
                    {m.cc.length > 0 && ` · Cc: ${m.cc.map((u) => u.name).join(', ')}`}
                  </p>
                </div>
              </div>
              <div className="px-4 py-3">
                {/* Bodies are user-authored HTML — render in the sandboxed iframe,
                    never into this document. */}
                {m.bodyHtml ? (
                  <EmailBodyFrame html={m.bodyHtml} />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {m.bodyText}
                  </pre>
                )}
                {m.attachments.length > 0 && (
                  <div className="mt-3 pt-3 border-t flex flex-col gap-1.5">
                    {m.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={internalAttachmentUrl(token!, att.id, 'attachment')}
                        className="flex items-center gap-2 text-xs text-teal-700 hover:underline"
                      >
                        <Paperclip size={12} />
                        <span className="truncate">{att.filename}</span>
                        <span className="text-muted-foreground">
                          {formatBytes(att.size)}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {replyOpen && (
            <div ref={replyRef} className="rounded-lg border p-3 flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Replying to {lastMessage?.from.name}
              </p>
              <RichTextEditor
                html={replyBody}
                onChange={setReplyBody}
                placeholder="Write your reply…"
                minHeight={140}
                maxHeight={320}
              />
              <PolishPanel
                polish={replyPolish}
                context={POLISH_CONTEXT}
                onAccept={(t) => setReplyBody(textToHtml(t))}
              />
              {sendError && <p className="text-xs text-destructive">{sendError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                  disabled={sendMutation.isPending || !htmlToText(replyBody).trim()}
                  onClick={submitReply}
                >
                  <Send size={14} />
                  {sendMutation.isPending ? 'Sending…' : 'Send'}
                </Button>
                <PolishButton
                  polish={replyPolish}
                  draftPlain={htmlToText(replyBody)}
                  context={POLISH_CONTEXT}
                />
                <Button size="sm" variant="outline" onClick={() => setReplyOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {forwardOpen && (
            <div ref={forwardRef} className="rounded-lg border p-3 flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Forward to</p>
              <UserAutocomplete
                value={forwardTo}
                onChange={setForwardTo}
                users={directory}
                placeholder="Start typing a name…"
              />
              <RichTextEditor
                html={forwardBody}
                onChange={setForwardBody}
                placeholder="Add a note…"
                minHeight={140}
                maxHeight={320}
              />
              <PolishPanel
                polish={forwardPolish}
                context={POLISH_CONTEXT}
                onAccept={(t) => {
                  // Keep the quoted block; polish only rewrites the note above it.
                  const idx = forwardBody.search(/<div[^>]*data-cyg-forward/i);
                  const quote = idx === -1 ? '' : forwardBody.slice(idx);
                  setForwardBody(
                    quote ? `${textToHtml(t)}<div><br></div>${quote}` : textToHtml(t),
                  );
                }}
              />
              {sendError && <p className="text-xs text-destructive">{sendError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                  disabled={sendMutation.isPending || forwardTo.length === 0}
                  onClick={submitForward}
                >
                  <Send size={14} />
                  {sendMutation.isPending ? 'Sending…' : 'Forward'}
                </Button>
                <PolishButton
                  polish={forwardPolish}
                  draftPlain={htmlToText(
                    forwardBody.slice(
                      0,
                      forwardBody.search(/<div[^>]*data-cyg-forward/i) === -1
                        ? undefined
                        : forwardBody.search(/<div[^>]*data-cyg-forward/i),
                    ),
                  )}
                  context={POLISH_CONTEXT}
                />
                <Button size="sm" variant="outline" onClick={() => setForwardOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {banner && (
        <div className="mb-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800 flex items-center justify-between">
          <span>New message received</span>
          <button type="button" onClick={() => setBanner(false)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pb-3">
        {FOLDERS.map(({ id, label, icon: Icon }) => {
          const count =
            id === 'UNCOMPLETED' ? uncompleted?.count : id === 'UNREAD' ? unread?.count : 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFolder(id)}
              className={[
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                folder === id
                  ? 'bg-teal-600 text-white'
                  : 'text-muted-foreground hover:bg-muted',
              ].join(' ')}
            >
              <Icon size={13} />
              {label}
              {!!count && count > 0 && (
                <Badge
                  variant="outline"
                  className={[
                    'text-[10px] px-1 py-0 border-0',
                    folder === id ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700',
                  ].join(' ')}
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search messages…"
            className="h-8 w-48"
          />
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            onClick={() => setComposeOpen(true)}
          >
            <Pencil size={14} /> New message
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border">
        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground p-6 text-center">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Inbox size={32} />
            <p className="text-sm">
              {search ? 'No messages match your search.' : 'No messages here yet.'}
            </p>
          </div>
        ) : (
          <>
            {messages.map((m, idx) => (
              <InternalMessageRow
                key={m.id}
                message={m}
                sentView={folder === 'SENT'}
                isFirst={idx === 0}
                onOpen={() => openMessage(m)}
                onToggleRead={() =>
                  stateMutation.mutate({
                    id: m.id,
                    action: m.isRead ? 'unread' : 'read',
                  })
                }
                onToggleComplete={() =>
                  stateMutation.mutate({
                    id: m.id,
                    action: m.isCompleted ? 'uncomplete' : 'complete',
                  })
                }
              />
            ))}
            <div ref={loadMoreRef} className="h-8" />
            {listQuery.isFetchingNextPage && (
              <p className="text-xs text-muted-foreground text-center pb-3">
                Loading more…
              </p>
            )}
          </>
        )}
      </div>

      <InternalComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onSent={() => setFolder('SENT')}
      />
    </div>
  );
}
