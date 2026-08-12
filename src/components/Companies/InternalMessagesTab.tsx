import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ChevronRight, Circle, Forward, Inbox, ListChecks,
  MailOpen, Paperclip, Pencil, Printer, Reply, Send, SendHorizonal, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { RichTextEditor } from './RichTextEditor';
import { UserAutocomplete } from './UserAutocomplete';
import { InternalMessageRow } from './InternalMessageRow';
import { useComposer, useComposerSignals } from '@/context/ComposerContext';
import { PolishButton, PolishPanel } from './PolishPanel';
import { EmailBodyFrame } from './EmailBodyFrame';
import { Linkified } from './Linkified';
import { AttachmentPreview } from './AttachmentPreview';
import { UploadProgressBar } from './ComposerBits';
import {
  MAX_FILE_BYTES,
  buildForwardedBody, dedupeById, escapeHtml, formatBytes, formatEmailDate,
  htmlToText, mergeAttachments, openPrintWindow, prefixFwdSubject,
  prefixReSubject, senderInitial, splitSignature, textToHtml,
} from './message-utils';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { useInternalMessage } from '@/hooks/useInternalMessage';
import { useInternalMessages } from '@/hooks/useInternalMessages';
import { useInternalMessageThread } from '@/hooks/useInternalMessageThread';
import { useInternalMessageState } from '@/hooks/useInternalMessageState';
import { useSendInternalMessage } from '@/hooks/useSendInternalMessage';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import {
  useInternalUncompletedCount,
  useInternalUnreadCount,
} from '@/hooks/useInternalUncompletedCount';
import { internalAttachmentUrl } from '@/api/internalMessages';
import { useNotifications } from '@/context/NotificationContext';
import type {
  InternalFolder,
  InternalForward,
  InternalMessageDetail,
  InternalMessageSummary,
} from '@/api/internalMessages';

interface Props {
  /**
   * Messages is the visible tab. The component stays MOUNTED while hidden so an
   * open thread and a half-typed reply survive a tab switch — polling is gated on
   * this, not on mount.
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

/**
 * Mirrors the server's multer limits (internal-messages/uploads.ts). The per-file
 * byte cap is `MAX_FILE_BYTES` from message-utils — the same 250 MB email uses.
 */
const MAX_ATTACHMENTS = 10;

/**
 * Ceiling for RE-ATTACHING an original on forward, which is a different problem
 * from the send cap: the browser has to pull the file all the way down and push it
 * all the way back up. Worth doing for a document, not for a 200 MB video — those
 * are named in the "not forwarded" notice so the user can link or re-send them
 * deliberately.
 */
const MAX_FORWARD_HYDRATE_BYTES = 50 * 1024 * 1024;

/** Forward rows use a full timestamp — "2:14 PM" alone reads as today. */
function formatForwardTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * What was actually sent on a forward, expanded under the banner. Mirrors
 * `ForwardPreview` in CommunicationsTab — same card, different data source (the
 * internal store rather than Gmail, so the attachment URLs differ too).
 */
function InternalForwardPreview({ messageId }: { messageId: number }) {
  const { token } = useAuth();
  const { data: fwd, isLoading, isError } = useInternalMessage(messageId);

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground py-2">Loading forwarded message…</p>
    );
  }
  if (isError || !fwd) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        This forwarded message is no longer available.
      </p>
    );
  }
  return (
    <div className="mt-1 border rounded-md bg-muted/10 p-3 flex flex-col gap-2">
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>
          <span className="font-medium">From:</span> {fwd.from.name}
        </div>
        <div>
          <span className="font-medium">To:</span>{' '}
          {fwd.to.map((u) => u.name).join(', ') || '—'}
        </div>
        <div>
          <span className="font-medium">Date:</span> {formatEmailDate(fwd.date)}
        </div>
      </div>
      {fwd.attachments.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {fwd.attachments.map((att) => (
            <AttachmentPreview
              key={att.id}
              url={internalAttachmentUrl(token ?? '', att.id, 'inline')}
              downloadUrl={internalAttachmentUrl(token ?? '', att.id, 'attachment')}
              mimeType={att.mimeType}
              filename={att.filename}
              size={att.size}
            />
          ))}
        </div>
      )}
      <div className="border rounded-md overflow-hidden bg-background">
        {fwd.bodyHtml ? (
          <EmailBodyFrame html={fwd.bodyHtml} />
        ) : (
          <pre className="p-4 text-sm whitespace-pre-wrap font-sans">
            <Linkified text={fwd.bodyText ?? '(empty)'} />
          </pre>
        )}
      </div>
    </div>
  );
}

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
  const { openInternal } = useComposer();
  const { internalSentAt } = useComposerSignals();
  const stored = useRef(getStoredUI()).current;

  const [folder, setFolder] = useState<InternalFolder>(stored.folder ?? 'INBOX');
  const [search, setSearch] = useState(stored.search ?? '');
  const [openThreadId, setOpenThreadId] = useState<number | null>(
    stored.openThreadId ?? null,
  );
  const [banner, setBanner] = useState(false);
  // The message awaiting "mark complete" confirmation, mirroring the Communications
  // tab. `fromDetail` closes the thread afterwards. null = no confirm dialog open.
  const [completeTarget, setCompleteTarget] = useState<
    { id: number; fromDetail?: boolean } | null
  >(null);

  // Jump to Sent once a compose window lands. Driven by a signal from the provider
  // rather than an `onSent` callback handed to it: a compose window outlives this
  // tab now (leaving the workspace and coming back remounts it by key), so a
  // captured `setFolder` would belong to an instance that no longer exists and the
  // jump would silently stop happening.
  useEffect(() => {
    if (internalSentAt > 0) setFolder('SENT');
  }, [internalSentAt]);

  // The message the user clicked to open the thread — expanded on arrival
  // alongside the newest one, like the Communications tab.
  const [openMsgId, setOpenMsgId] = useState<number | null>(null);
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<number>>(new Set());
  const [expandedForwardIds, setExpandedForwardIds] = useState<Set<number>>(new Set());

  // Reply / forward are inline forms below the thread, not dialogs.
  const [replyOpen, setReplyOpen] = useState(false);
  // The message the open reply answers, captured when the form opened — the
  // thread refetches while composing and must not move the target.
  const [replyTarget, setReplyTarget] = useState<InternalMessageDetail | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyTo, setReplyTo] = useState<number[]>([]);
  const [replyCc, setReplyCc] = useState<number[]>([]);
  const [replySubject, setReplySubject] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  // The message being forwarded, captured when the form opened (same reason as
  // `replyTarget`) — it's what `parentId` links the forward back to.
  const [forwardSource, setForwardSource] = useState<InternalMessageDetail | null>(null);
  const [forwardBody, setForwardBody] = useState('');
  const [forwardTo, setForwardTo] = useState<number[]>([]);
  const [forwardCc, setForwardCc] = useState<number[]>([]);
  const [forwardSubject, setForwardSubject] = useState('');
  const [forwardFiles, setForwardFiles] = useState<File[]>([]);
  const [forwardAttLoading, setForwardAttLoading] = useState(false);
  const [forwardSkipped, setForwardSkipped] = useState<string[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const replyPolish = useDraftPolish();
  const forwardPolish = useDraftPolish();
  const replyRef = useRef<HTMLDivElement>(null);
  const forwardRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const forwardFileInputRef = useRef<HTMLInputElement>(null);
  // Bumped on every new forward so a slow attachment download from a previous
  // one can't land in the form the user is looking at now.
  const forwardReqRef = useRef(0);
  const threadInitKeyRef = useRef<string | null>(null);

  const listQuery = useInternalMessages(folder, search || undefined, active);
  const threadQuery = useInternalMessageThread(openThreadId, active);
  const stateMutation = useInternalMessageState();
  const sendMutation = useSendInternalMessage();
  // Compose fetches the directory itself now that it lives in the docked composer.
  const { data: directory = [] } = useUserDirectory(forwardOpen || replyOpen);
  const { data: uncompleted } = useInternalUncompletedCount();
  const { data: unread } = useInternalUnreadCount();
  const { lastInternalEventAt } = useNotifications();

  const messages = useMemo(
    () => dedupeById(listQuery.data?.pages.flatMap((p) => p.messages) ?? []),
    [listQuery.data],
  );
  // Memoised so the `?? []` fallback doesn't hand the expand-init effect a fresh
  // array on every render.
  const threadMessages = useMemo(
    () => threadQuery.data?.messages ?? [],
    [threadQuery.data],
  );
  const lastMessage: InternalMessageDetail | undefined =
    threadMessages[threadMessages.length - 1];

  // Index of the message the user actually clicked. Everything after it is the
  // "future" of that moment — dimmed, mirroring the chat thread view. -1 when the
  // opened id isn't in the loaded thread: then nothing dims and the plain
  // newest-expanded behaviour stands.
  const anchorIdx = openMsgId
    ? threadMessages.findIndex((m) => m.id === openMsgId)
    : -1;
  // Which message to expand before the init effect below has run, so the pane is
  // never all-collapsed — the anchor when we have one, else the newest.
  const fallbackExpandId =
    anchorIdx >= 0 ? threadMessages[anchorIdx].id : (lastMessage?.id ?? null);
  // Reply/Forward act on the message the user opened, not on whatever has
  // arrived since — mirrors the company mailbox and the chat thread.
  const anchorMessage: InternalMessageDetail | undefined =
    anchorIdx >= 0 ? threadMessages[anchorIdx] : lastMessage;

  // Expand the message the user clicked, once per opened thread. Keyed so the 15s
  // poll (a new array each time) doesn't collapse what the user manually expanded;
  // a genuinely new message won't auto-expand. Messages newer than the clicked one
  // are the dimmed "future" and stay collapsed.
  useEffect(() => {
    if (threadMessages.length === 0) return;
    const key = `${openThreadId}|${openMsgId}|${threadMessages.length}`;
    if (threadInitKeyRef.current === key) return;
    threadInitKeyRef.current = key;
    const idx = openMsgId ? threadMessages.findIndex((m) => m.id === openMsgId) : -1;
    const initial = new Set<number>();
    if (idx >= 0) initial.add(threadMessages[idx].id);
    // No anchor in the thread (or the anchor *is* the newest) — expand the newest.
    if (idx === -1 || idx === threadMessages.length - 1) {
      initial.add(threadMessages[threadMessages.length - 1].id);
    }
    setExpandedThreadIds(initial);
  }, [threadMessages, openThreadId, openMsgId]);

  const toggleThreadMessage = (id: number) => {
    setExpandedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleForwardPreview = (id: number) => {
    setExpandedForwardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Persist view state (never drafts — a half-typed reply shouldn't outlive the session).
  useEffect(() => {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({ folder, openThreadId, search } satisfies StoredUI),
    );
  }, [folder, openThreadId, search]);

  // ── SSE: instant delivery ─────────────────────────────────────────────────
  // The connection itself is owned by NotificationProvider (one per tab, alive on
  // every page) — it does the invalidating. All that's left here is the banner.
  useEffect(() => {
    if (!lastInternalEventAt) return;
    setBanner(true);
    const t = setTimeout(() => setBanner(false), 5000);
    return () => clearTimeout(t);
  }, [lastInternalEventAt]);

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
      setOpenMsgId(message.id);
      // Let the init effect re-run for the newly opened thread.
      threadInitKeyRef.current = null;
      setExpandedThreadIds(new Set());
      setExpandedForwardIds(new Set());
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
    setOpenMsgId(null);
    threadInitKeyRef.current = null;
    setExpandedThreadIds(new Set());
    setExpandedForwardIds(new Set());
    closeReply();
    closeForward();
  };

  // ── Complete / uncomplete ─────────────────────────────────────────────────
  // Completing asks first (a stray click shouldn't clear a message); undoing it
  // applies straight away. Same asymmetry as the Communications tab.
  const confirmComplete = () => {
    if (!completeTarget) return;
    const { id, fromDetail } = completeTarget;
    stateMutation.mutate({ id, action: 'complete' });
    setCompleteTarget(null);
    if (fromDetail) closeThread();
  };

  const toggleComplete = (
    message: { id: number; isCompleted: boolean },
    fromDetail?: boolean,
  ) => {
    if (message.isCompleted) {
      stateMutation.mutate({ id: message.id, action: 'uncomplete' });
    } else {
      setCompleteTarget({ id: message.id, fromDetail });
    }
  };

  const completeConfirmDialog = (
    <Dialog
      open={completeTarget !== null}
      onOpenChange={(open) => {
        if (!open) setCompleteTarget(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark message complete?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Confirm you've completed this message. It stays in your inbox with a blue
          check.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setCompleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
            onClick={confirmComplete}
          >
            <CheckCircle2 size={14} /> Mark complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Reply / forward ───────────────────────────────────────────────────────
  const closeReply = () => {
    setReplyOpen(false);
    setReplyTarget(null);
    setReplyBody('');
    setReplyTo([]);
    setReplyCc([]);
    setReplySubject('');
    setReplyFiles([]);
    setAttachmentNotice(null);
    replyPolish.reset();
  };

  const closeForward = () => {
    // Supersede any attachment download still in flight for this form.
    forwardReqRef.current++;
    setForwardOpen(false);
    setForwardSource(null);
    setForwardBody('');
    setForwardTo([]);
    setForwardCc([]);
    setForwardSubject('');
    setForwardFiles([]);
    setForwardSkipped([]);
    setForwardAttLoading(false);
    setAttachmentNotice(null);
    forwardPolish.reset();
  };

  // `target` defaults to the message the user opened; the per-message buttons in
  // the thread pass an earlier one explicitly.
  const startReply = (target: InternalMessageDetail | undefined = anchorMessage) => {
    if (!target) return;
    closeForward();
    setReplyTarget(target);
    // Reply-all minus me: everyone who was on the thread stays on it.
    const recipients = [
      target.from.id,
      ...target.to.map((u) => u.id),
    ].filter((id) => id !== user?.id);
    setReplyTo([...new Set(recipients)]);
    setReplyCc(target.cc.map((u) => u.id).filter((id) => id !== user?.id));
    setReplySubject(prefixReSubject(target.subject));
    setReplyBody('');
    setReplyFiles([]);
    setAttachmentNotice(null);
    setSendError(null);
    replyPolish.reset();
    setReplyOpen(true);
    setTimeout(
      () => replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      50,
    );
  };

  const startForward = (target: InternalMessageDetail | undefined = anchorMessage) => {
    if (!target) return;
    closeReply();
    const reqId = ++forwardReqRef.current;
    setForwardTo([]);
    setForwardCc([]);
    setForwardSubject(prefixFwdSubject(target.subject));
    setForwardFiles([]);
    setForwardSkipped([]);
    // The superseded hydrate above skips its own cleanup, so clear the flag here
    // or a forward of an attachment-free message inherits a stuck "Loading…".
    setForwardAttLoading(false);
    setAttachmentNotice(null);
    setSendError(null);
    forwardPolish.reset();
    // Quote the original below a `data-cyg-forward` block so AI polish leaves it
    // alone. There is no signature for internal messages, hence the ''.
    setForwardBody(
      buildForwardedBody(
        {
          from: `${target.from.name} <${target.from.email}>`,
          to: target.to.map((u) => u.name).join(', '),
          date: target.date,
          subject: target.subject,
          bodyHtml: target.bodyHtml,
          bodyText: target.bodyText,
        },
        '',
      ),
    );
    setForwardSource(target);
    setForwardOpen(true);
    setTimeout(
      () => forwardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      50,
    );
    void hydrateForwardAttachments(target, reqId);
  };

  /**
   * Re-anchor the open thread to an earlier message and reply to / forward it
   * there — mirrors `handleNavigateToEmailMessage` in the company mailbox.
   *
   * Moving `openMsgId` re-points everything derived from it: the toolbar
   * Reply/Forward, and the dimming that marks later messages as the "future" of
   * this moment. The init effect keys on `openMsgId` and would collapse whatever
   * the user expanded, so claim its key first and fold the new anchor in.
   * `startReply`/`startForward` get `m` directly, because `anchorMessage` won't
   * reflect the new id until the next render.
   */
  const navigateToInternalMessage = (
    m: InternalMessageDetail,
    mode: 'reply' | 'forward',
  ) => {
    if (threadMessages.length > 0) {
      threadInitKeyRef.current = `${openThreadId}|${m.id}|${threadMessages.length}`;
      setExpandedThreadIds((prev) => new Set(prev).add(m.id));
    }
    setOpenMsgId(m.id);
    if (mode === 'reply') startReply(m);
    else startForward(m);
  };

  /**
   * Re-download the original's attachments so the forward carries them, the way
   * a mail client does. Anything too large or past the file cap is reported
   * rather than silently dropped.
   */
  const hydrateForwardAttachments = async (
    source: InternalMessageDetail,
    reqId: number,
  ) => {
    if (!token || source.attachments.length === 0) return;
    const skipped: string[] = [];
    const wanted: typeof source.attachments = [];
    for (const att of source.attachments) {
      if (att.size > MAX_FORWARD_HYDRATE_BYTES || wanted.length >= MAX_ATTACHMENTS) {
        skipped.push(att.filename);
      } else {
        wanted.push(att);
      }
    }
    if (skipped.length) setForwardSkipped(skipped);
    if (wanted.length === 0) return;

    setForwardAttLoading(true);
    try {
      const files = await Promise.all(
        wanted.map(async (att) => {
          const res = await fetch(
            internalAttachmentUrl(token, att.id, 'attachment'),
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return new File([blob], att.filename, { type: att.mimeType });
        }),
      );
      // A newer forward was started while this was in flight — drop the result.
      if (reqId !== forwardReqRef.current) return;
      // Originals first, then anything attached manually while downloading.
      setForwardFiles((manual) =>
        [...files, ...manual].slice(0, MAX_ATTACHMENTS),
      );
    } catch {
      if (reqId !== forwardReqRef.current) return;
      setSendError(
        "Couldn't load the original attachments. You can attach files manually.",
      );
    } finally {
      if (reqId === forwardReqRef.current) setForwardAttLoading(false);
    }
  };

  const pickFiles = (
    incoming: FileList | null,
    current: File[],
    set: (files: File[]) => void,
  ) => {
    if (!incoming?.length) return;
    const { files, notice } = mergeAttachments(
      current,
      Array.from(incoming),
      MAX_ATTACHMENTS,
      MAX_FILE_BYTES,
    );
    set(files);
    setAttachmentNotice(notice);
  };

  const submitReply = () => {
    const target = replyTarget ?? anchorMessage;
    if (!target) return;
    const text = htmlToText(replyBody);
    if (!text.trim() && replyFiles.length === 0) return;
    if (replyTo.length === 0) {
      setSendError('Add at least one recipient.');
      return;
    }
    setSendError(null);
    sendMutation.mutate(
      {
        to: replyTo,
        cc: replyCc,
        subject: replySubject,
        body: text,
        bodyHtml: replyBody,
        parentId: target.id,
        files: replyFiles,
      },
      {
        onSuccess: closeReply,
        onError: (e: unknown) =>
          setSendError((e as Error)?.message ?? 'Failed to send reply'),
      },
    );
  };

  const submitForward = () => {
    const target = forwardSource ?? anchorMessage;
    if (!target) return;
    const text = htmlToText(forwardBody);
    if (forwardTo.length === 0) {
      setSendError('Add at least one recipient.');
      return;
    }
    setSendError(null);
    sendMutation.mutate(
      {
        to: forwardTo,
        cc: forwardCc,
        subject: forwardSubject,
        body: text,
        bodyHtml: forwardBody,
        // parentId still links back to the original (it drives the "You forwarded
        // this message" banner) even though the server roots the forward as its
        // own conversation, exactly like email.
        parentId: target.id,
        isForward: true,
        files: forwardFiles,
      },
      {
        onSuccess: closeForward,
        onError: (e: unknown) =>
          setSendError((e as Error)?.message ?? 'Failed to forward message'),
      },
    );
  };

  // The Attach button + picked-file list, shared by the reply and forward forms.
  const renderAttachRow = (
    files: File[],
    setFiles: (files: File[]) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          pickFiles(e.target.files, files, setFiles);
          // Reset so picking the same file again still fires onChange.
          e.target.value = '';
        }}
      />
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip size={14} /> Attach
        </Button>
      </div>
      {attachmentNotice && (
        <p className="text-xs text-amber-600">{attachmentNotice}</p>
      )}
      <UploadProgressBar progress={sendMutation.uploadProgress} />
      {files.map((f, i) => (
        <div
          key={`${f.name}:${f.size}:${i}`}
          className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
        >
          <Paperclip size={12} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
          <button
            type="button"
            aria-label={`Remove ${f.name}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );

  // The teal "You forwarded this message" block, shown on a message that has been
  // forwarded on. Only forwards the viewer is party to reach the client, so the
  // wording names the forwarder whenever it wasn't the viewer themselves.
  const renderForwardBanner = (forwards: InternalForward[]) => {
    const allMine = forwards.every((f) => f.by.id === user?.id);
    const heading = allMine
      ? forwards.length > 1
        ? `You forwarded this message ${forwards.length} times`
        : 'You forwarded this message'
      : forwards.length > 1
        ? `This message was forwarded ${forwards.length} times`
        : `${forwards[0].by.name} forwarded this message`;
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-teal-600">
          <Forward size={13} />
          {heading}
        </div>
        <div className="pl-[18px] flex flex-col gap-0.5 text-muted-foreground">
          {forwards.map((f) => {
            const open = expandedForwardIds.has(f.messageId);
            return (
              <div key={f.messageId} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleForwardPreview(f.messageId)}
                  className="flex items-center gap-1 text-left hover:text-foreground"
                >
                  <ChevronRight
                    size={12}
                    className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                  />
                  <span>
                    {f.by.id !== user?.id && (
                      <>
                        by <span className="font-medium text-foreground">{f.by.name}</span>{' '}
                      </>
                    )}
                    to{' '}
                    <span className="font-medium text-foreground">
                      {f.to || 'unknown recipient'}
                    </span>{' '}
                    · {formatForwardTime(f.at)}
                  </span>
                </button>
                {open && <InternalForwardPreview messageId={f.messageId} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // One message in the opened conversation, Gmail-style: a clickable header
  // (sender · date, plus the snippet when collapsed) that toggles the full
  // body/attachments below. `isFuture` = newer than the message the user opened:
  // dimmed like the chat thread, and it stays dimmed while expanded.
  const renderThreadMessage = (m: InternalMessageDetail, isFuture: boolean) => {
    // Fall back to one message expanded before the init effect has run, so the
    // pane is never all-collapsed — and never auto-opens a dimmed message.
    const expanded =
      expandedThreadIds.has(m.id) ||
      (expandedThreadIds.size === 0 && m.id === fallbackExpandId);
    return (
      <div
        key={m.id}
        className={`group/msg border rounded-md overflow-hidden transition-opacity ${
          isFuture ? 'opacity-50' : ''
        }`}
      >
        {/* The action buttons are siblings of the header, not children — the
            header is itself a <button> and nesting one inside it is invalid HTML. */}
        <div className="flex items-start">
          <button
            type="button"
            onClick={() => toggleThreadMessage(m.id)}
            className="min-w-0 flex-1 flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-semibold">
              {senderInitial(m.from.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">
                  {m.from.name}
                  {m.isOwn && (
                    <span className="text-xs text-muted-foreground font-normal"> (you)</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {formatEmailDate(m.date)}
                </span>
              </div>
              {expanded ? (
                <div className="text-xs text-muted-foreground truncate">
                  To: {m.to.map((u) => u.name).join(', ') || '—'}
                  {m.cc.length > 0 && ` · Cc: ${m.cc.map((u) => u.name).join(', ')}`}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground truncate">{m.snippet}</div>
              )}
            </div>
          </button>
          {/* Reply to / forward THIS message even though newer ones follow it.
              Hidden on the message that is already the target, where the toolbar
              buttons do the same thing. */}
          {m.id !== openMsgId && (
            <div className="shrink-0 self-center mr-2 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                title="Reply to this message"
                onClick={() => navigateToInternalMessage(m, 'reply')}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Reply size={14} />
              </button>
              <button
                type="button"
                title="Forward this message"
                onClick={() => navigateToInternalMessage(m, 'forward')}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Forward size={14} />
              </button>
            </div>
          )}
        </div>

        {expanded && (
          <div className="px-3 pt-3 pb-3 flex flex-col gap-3 border-t">
            {m.isForwarded && renderForwardBanner(m.forwards)}
            {m.attachments.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attachments ({m.attachments.length})
                </div>
                <div className="flex flex-wrap gap-3">
                  {m.attachments.map((att) => (
                    <AttachmentPreview
                      key={att.id}
                      url={internalAttachmentUrl(token ?? '', att.id, 'inline')}
                      downloadUrl={internalAttachmentUrl(token ?? '', att.id, 'attachment')}
                      mimeType={att.mimeType}
                      filename={att.filename}
                      size={att.size}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="border rounded-md overflow-hidden">
              {/* Bodies are user-authored HTML — render in the sandboxed iframe,
                  never into this document. */}
              {m.bodyHtml ? (
                <EmailBodyFrame html={m.bodyHtml} />
              ) : (
                <pre className="p-4 text-sm whitespace-pre-wrap font-sans">
                  <Linkified text={m.bodyText ?? '(empty)'} />
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
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
          {/* Wrapped, not passed by reference: the handlers take an optional
              target and would otherwise receive the click event as one. */}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => startReply()}>
            <Reply size={14} /> Reply
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => startForward()}>
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
                onClick={() => toggleComplete(lastMessage, true)}
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
          {threadMessages.length > 0 && (
            <h2 className="font-semibold text-base px-1">
              {(lastMessage?.subject || threadMessages[0]?.subject) || '(no subject)'}
            </h2>
          )}

          {/* Conversation thread — the opened message expanded, anything newer
              than it collapsed and dimmed (still clickable to read). */}
          {threadMessages.map((m, i) =>
            renderThreadMessage(m, anchorIdx >= 0 && i > anchorIdx),
          )}

          {replyOpen && (
            <div
              ref={replyRef}
              className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10"
            >
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Reply
                </p>
                {/* The form sits below the dimmed later messages — name the one
                    being answered rather than leaving it implied. */}
                {replyTarget && (
                  <p className="text-xs text-muted-foreground">
                    Replying to {replyTarget.from.name} · {formatEmailDate(replyTarget.date)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">To</Label>
                <UserAutocomplete
                  value={replyTo}
                  onChange={setReplyTo}
                  users={directory}
                  placeholder="Start typing a name…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">CC</Label>
                <UserAutocomplete
                  value={replyCc}
                  onChange={setReplyCc}
                  users={directory}
                  placeholder="Optional"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Subject</Label>
                <Input
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                />
              </div>
              <RichTextEditor
                html={replyBody}
                onChange={setReplyBody}
                placeholder="Write your reply…"
                minHeight={140}
                maxHeight={320}
              />
              {renderAttachRow(
                replyFiles,
                setReplyFiles,
                replyFileInputRef,
              )}
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
                  disabled={
                    sendMutation.isPending ||
                    (!htmlToText(replyBody).trim() && replyFiles.length === 0)
                  }
                  onClick={submitReply}
                >
                  <Send size={14} />
                  {sendMutation.isPending ? 'Sending…' : 'Send Reply'}
                </Button>
                <PolishButton
                  polish={replyPolish}
                  draftPlain={htmlToText(replyBody)}
                  context={POLISH_CONTEXT}
                />
                <Button size="sm" variant="outline" onClick={closeReply}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {forwardOpen && (
            <div
              ref={forwardRef}
              className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10"
            >
              <div className="flex flex-col gap-0.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Forward size={13} /> Forward
                </p>
                {/* The form sits below the dimmed later messages, so name the
                    message being forwarded rather than leaving it implied. */}
                {forwardSource && (
                  <p className="text-xs text-muted-foreground">
                    Forwarding {forwardSource.from.name} · {formatEmailDate(forwardSource.date)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">To</Label>
                <UserAutocomplete
                  value={forwardTo}
                  onChange={setForwardTo}
                  users={directory}
                  placeholder="Start typing a name…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">CC</Label>
                <UserAutocomplete
                  value={forwardCc}
                  onChange={setForwardCc}
                  users={directory}
                  placeholder="Optional"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Subject</Label>
                <Input
                  value={forwardSubject}
                  onChange={(e) => setForwardSubject(e.target.value)}
                />
              </div>
              <RichTextEditor
                html={forwardBody}
                onChange={setForwardBody}
                placeholder="Add a note…"
                minHeight={200}
                maxHeight={360}
              />
              {forwardAttLoading && (
                <p className="text-xs text-muted-foreground">Loading attachments…</p>
              )}
              {forwardSkipped.length > 0 && (
                <p className="text-xs text-amber-600">
                  Not re-attached (too large to forward, or over the{' '}
                  {MAX_ATTACHMENTS}-file limit):{' '}
                  {forwardSkipped.join(', ')}
                </p>
              )}
              {renderAttachRow(
                forwardFiles,
                setForwardFiles,
                forwardFileInputRef,
              )}
              <PolishPanel
                polish={forwardPolish}
                context={POLISH_CONTEXT}
                onAccept={(t) => {
                  // Keep the quoted block; polish only rewrites the note above it.
                  const { sig } = splitSignature(forwardBody);
                  setForwardBody(
                    sig ? `${textToHtml(t)}<div><br></div>${sig}` : textToHtml(t),
                  );
                }}
              />
              {sendError && <p className="text-xs text-destructive">{sendError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                  disabled={
                    sendMutation.isPending ||
                    forwardTo.length === 0 ||
                    forwardAttLoading
                  }
                  onClick={submitForward}
                >
                  <Send size={14} />
                  {sendMutation.isPending ? 'Sending…' : 'Send'}
                </Button>
                <PolishButton
                  polish={forwardPolish}
                  draftPlain={htmlToText(splitSignature(forwardBody).body)}
                  context={POLISH_CONTEXT}
                />
                <Button size="sm" variant="outline" onClick={closeForward}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        {completeConfirmDialog}
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
            onClick={() => openInternal()}
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
                onToggleComplete={() => toggleComplete(m)}
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

      {/* "New message" is the app-level docked composer now (ComposerContext), so
          it survives leaving this tab. */}
      {completeConfirmDialog}
    </div>
  );
}
