import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ChevronRight, Circle, Forward, Inbox, ListChecks,
  Loader2, MailOpen, Paperclip, Pencil, Phone, Printer, Reply, SendHorizonal, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/SearchInput';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserAutocomplete } from './UserAutocomplete';
import { InternalMessageRow } from './InternalMessageRow';
import { InternalCallRow } from './InternalCallRow';
import { InternalCallDetail } from './InternalCallDetail';
import { useComposer, useComposerSignals } from '@/context/ComposerContext';
import { EmailBodyFrame } from './EmailBodyFrame';
import { Linkified } from './Linkified';
import { AttachmentPreview } from './AttachmentPreview';
import { CompleteConfirmDialog } from './CompleteConfirmDialog';
import { InlineComposerPanel } from './InlineComposerPanel';
import { AdvancedSearchPanel } from './communications/AdvancedSearchPanel';
import { clampSources } from './communications/inbox-clamp';
import { showListSpinner } from './communications/inbox-loading';
import {
  INTERNAL_KIND_FILTER_LABELS,
  getInternalItemTimestamp,
  internalItemId,
  isInternalKindFilter,
  matchesInternalItem,
  type InternalItem,
  type InternalKindFilter,
} from './communications/internal-inbox';
import {
  EMPTY_FILTERS,
  filterKey,
  filterParams,
  hasActiveFilters,
  isStructuredSearch,
  type SearchFilters,
} from './communications/search-filters';
import {
  ForwardPreviewCard, ForwardPreviewLoading, ForwardPreviewMissing,
} from './ForwardPreviewCard';
import {
  buildForwardedBody, dedupeById, escapeHtml, formatEmailDate, formatForwardTime,
  htmlToText, joinPolishedBody, mergeAttachments, openPrintWindow, prefixFwdSubject,
  prefixReSubject, senderInitial, splitSignature,
} from './message-utils';
import { RecipientDetails } from './RecipientDetails';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { useInternalMessage } from '@/hooks/useInternalMessage';
import { useInternalMessages } from '@/hooks/useInternalMessages';
import { useInternalCalls, useInternalCallCounts } from '@/hooks/useInternalCalls';
import { useInternalCallState } from '@/hooks/useInternalCallState';
import { useStartInternalCall } from '@/hooks/useStartInternalCall';
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
import type { InternalCall } from '@/api/internalCalls';

interface Props {
  /**
   * Communications is the visible tab. The component stays MOUNTED while hidden so an
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
 * Ceiling for RE-ATTACHING an original on forward, which is a different problem
 * from the send cap: the browser has to pull the file all the way down and push it
 * all the way back up. Worth doing for a document, not for a 200 MB video — those
 * are named in the "not forwarded" notice so the user can link or re-send them
 * deliberately.
 */
const MAX_FORWARD_HYDRATE_BYTES = 50 * 1024 * 1024;

/**
 * What was actually sent on a forward, expanded under the banner. The card itself
 * is shared with the company mailbox's ForwardPreview; only the data source and
 * the attachment URLs differ.
 */
function InternalForwardPreview({ messageId }: { messageId: number }) {
  const { token } = useAuth();
  const { data: fwd, isLoading, isError } = useInternalMessage(messageId);

  if (isLoading) return <ForwardPreviewLoading />;
  if (isError || !fwd) return <ForwardPreviewMissing />;

  return (
    <ForwardPreviewCard
      from={fwd.from.name}
      to={fwd.to.map((u) => u.name).join(', ') || '—'}
      date={fwd.date}
      bodyHtml={fwd.bodyHtml}
      bodyText={fwd.bodyText}
      attachments={
        fwd.attachments.length > 0
          ? fwd.attachments.map((att) => (
              <AttachmentPreview
                key={att.id}
                url={internalAttachmentUrl(token ?? '', att.id, 'inline')}
                downloadUrl={internalAttachmentUrl(token ?? '', att.id, 'attachment')}
                mimeType={att.mimeType}
                filename={att.filename}
                size={att.size}
              />
            ))
          : undefined
      }
    />
  );
}

interface StoredUI {
  folder?: InternalFolder;
  openThreadId?: number | null;
  search?: string;
  filter?: InternalKindFilter;
}

function getStoredUI(): StoredUI {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') as StoredUI;
  } catch {
    return {};
  }
}

/**
 * The internal "Cyg Finance" workspace inbox — staff messages and staff-to-staff calls
 * in ONE time-ordered list, the same contract a client company's Communications tab has
 * for email, chat, calls and texts.
 *
 * It is deliberately still a separate implementation from `CommunicationsTab`: the two
 * inboxes share their PURE rules (`clampSources`, `showListSpinner`, `formatEmailDate`,
 * `CallSummaryPanel`) and nothing else, because a workspace has no mailbox, no provider,
 * no phone number in either direction, and its read/completed state is per-USER rather
 * than per-company. Folding the two together would mean carrying every one of those
 * differences as a branch through `InboxView`.
 */
export function InternalCommunicationsTab({ active }: Props) {
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
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  // Which channels the list shows — the workspace's twin of the company tab's kind
  // dropdown. Only two kinds here, so no `voicemail` pseudo-kind: an internal <Dial>
  // has no <Record> fallthrough and therefore no voicemail to filter for.
  const [filter, setFilter] = useState<InternalKindFilter>(
    isInternalKindFilter(stored.filter) ? stored.filter : 'all',
  );
  // The open CALL, if any. Deliberately separate from `openThreadId` rather than one
  // union: a call has no thread, no reply and no forward, so every piece of thread state
  // below would need a "not for calls" branch. Exactly one can be set — `openCall` is
  // cleared when a thread opens and vice versa.
  const [openCall, setOpenCall] = useState<InternalCall | null>(null);
  // The row awaiting "mark complete" confirmation, mirroring the Communications
  // tab. `fromDetail` closes the open view afterwards. null = no confirm dialog open.
  const [completeTarget, setCompleteTarget] = useState<
    | { kind: 'message'; id: number; fromDetail?: boolean }
    | { kind: 'call'; sid: string; fromDetail?: boolean }
    | null
  >(null);
  // "New call" — the dial dialog, lifted from the retired InternalCallsTab.
  const [dialOpen, setDialOpen] = useState(false);
  const [dialPicked, setDialPicked] = useState<number[]>([]);
  const [dialError, setDialError] = useState<string | null>(null);

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
  const [replyBcc, setReplyBcc] = useState<number[]>([]);
  const [replyShowBcc, setReplyShowBcc] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  // The message being forwarded, captured when the form opened (same reason as
  // `replyTarget`) — it's what `parentId` links the forward back to.
  const [forwardSource, setForwardSource] = useState<InternalMessageDetail | null>(null);
  const [forwardBody, setForwardBody] = useState('');
  const [forwardTo, setForwardTo] = useState<number[]>([]);
  const [forwardCc, setForwardCc] = useState<number[]>([]);
  const [forwardBcc, setForwardBcc] = useState<number[]>([]);
  const [forwardShowBcc, setForwardShowBcc] = useState(false);
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
  const listScrollRef = useRef<HTMLDivElement>(null);
  // Bumped on every new forward so a slow attachment download from a previous
  // one can't land in the form the user is looking at now.
  const forwardReqRef = useRef(0);
  const threadInitKeyRef = useRef<string | null>(null);

  // Advanced-search fields. Committed as a unit from the panel; the plain box
  // above stays a free-text search.
  const searchParams = filterParams(filters);
  const listQuery = useInternalMessages(
    folder,
    search || undefined,
    active,
    searchParams,
    filterKey(filters),
  );
  // Calls are the second source of the merged inbox. They page on their own cursor, so
  // the clamp below can tell whether either stream still has older rows to give.
  //
  // Not fetched at all in SENT: that is a mailbox-only folder and the server answers it
  // with an empty page, so asking would be a round trip and a 15s poll for nothing. A
  // DISABLED query reports `isLoading: false` in TanStack v5, which is what keeps the
  // spinner check below honest without a special case.
  const callQuery = useInternalCalls(folder, active && folder !== 'SENT');
  const { data: callCounts } = useInternalCallCounts(active);
  const callStateMutation = useInternalCallState();
  const startCall = useStartInternalCall();
  const threadQuery = useInternalMessageThread(openThreadId, active);
  const stateMutation = useInternalMessageState();
  const sendMutation = useSendInternalMessage();
  // Compose fetches the directory itself now that it lives in the docked composer.
  // Also gated on the dial dialog now: "New call" picks its colleague from the very
  // same directory the composer does, so a typo can never become a callee.
  const { data: directory = [] } = useUserDirectory(
    forwardOpen || replyOpen || dialOpen,
  );
  const { data: uncompleted } = useInternalUncompletedCount();
  const { data: unread } = useInternalUnreadCount();
  const { lastInternalEventAt } = useNotifications();

  const messages = useMemo(
    () => dedupeById(listQuery.data?.pages.flatMap((p) => p.messages) ?? []),
    [listQuery.data],
  );
  const calls = useMemo(
    () => dedupeById(callQuery.data?.pages.flatMap((p) => p.calls) ?? []),
    [callQuery.data],
  );

  const structuredSearch = isStructuredSearch(filters);

  /**
   * The one time-ordered list, messages and calls together.
   *
   * ── THE CLAMP ────────────────────────────────────────────────────────────────
   * The two streams page independently, so at any moment they have loaded back to
   * different points in time. Concatenating and sorting is correct at the top and wrong
   * at the bottom, where the shallower stream's rows are simply missing — and scrolling
   * then makes rows appear ABOVE ones already on screen. `clampSources` cuts the list at
   * the newest "oldest-loaded" boundary among the streams that still have more; the
   * shared implementation and the reasoning live in `communications/inbox-clamp.ts`.
   *
   * UNREAD / UNCOMPLETED skip the clamp — those folders mean to show every matching row
   * so the list backs up the number on the chip — expressed as "nothing may pin" rather
   * than a second code path, exactly as `useUnifiedInbox` does it.
   */
  const { visible: mergedItems, clampSource } = useMemo(() => {
    const isFiltered = folder === 'UNREAD' || folder === 'UNCOMPLETED';
    return clampSources<'message' | 'call', InternalItem>(
      [
        {
          kind: 'message',
          items: messages.map((data) => ({ kind: 'message', data })),
          hasNext: !isFiltered && listQuery.hasNextPage,
          enabled: true,
        },
        {
          kind: 'call',
          items: calls.map((data) => ({ kind: 'call', data })),
          // SENT is mailbox-only: the server returns an empty call page there, and
          // saying so here keeps a folder with no calls from pinning the list.
          hasNext: !isFiltered && folder !== 'SENT' && callQuery.hasNextPage,
          enabled: folder !== 'SENT',
        },
      ],
      getInternalItemTimestamp,
    );
  }, [messages, calls, folder, listQuery.hasNextPage, callQuery.hasNextPage]);

  // The kind dropdown and the call-side search, applied over the merged list. Messages
  // were already searched server-side and are never re-tested — see matchesInternalItem.
  const items = useMemo(
    () =>
      mergedItems.filter((it) =>
        matchesInternalItem(it, { filter, search, structuredSearch }),
      ),
    [mergedItems, filter, search, structuredSearch],
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
      JSON.stringify({ folder, openThreadId, search, filter } satisfies StoredUI),
    );
  }, [folder, openThreadId, search, filter]);

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
  // Advances the source PINNING the clamp, not simply "messages". Paging the other one
  // loads rows that stay clamped out of view, so the list would stop growing while the
  // observer kept firing. Each successful page of the pinning source strictly lowers the
  // cutoff, which is what makes this terminate.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || openThreadId || openCall) return;
    const advance = () => {
      const order =
        clampSource === 'call'
          ? ([callQuery, listQuery] as const)
          : ([listQuery, callQuery] as const);
      for (const q of order) {
        if (q.hasNextPage && !q.isFetchingNextPage) {
          void q.fetchNextPage();
          return;
        }
      }
    };
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) advance();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [openThreadId, openCall, clampSource, listQuery, callQuery]);

  // ── List scroll position ──────────────────────────────────────────────────
  // Opening a thread early-returns above the list, unmounting its scroll box and
  // destroying its scrollTop — so the offset is captured on the way in and put back
  // when the list returns, landing the user on the row they opened.
  const listScrollTop = useRef(0);
  const restoreListScroll = useRef(false); // armed on open, consumed on the way back

  useLayoutEffect(() => {
    if (!active || openThreadId) return;
    if (!restoreListScroll.current) return; // only after a thread was opened, not on every re-render
    const el = listScrollRef.current;
    if (!el) return;
    el.scrollTop = listScrollTop.current;
    restoreListScroll.current = false;
  }, [active, openThreadId]);

  // ── Opening a thread ──────────────────────────────────────────────────────
  const openMessage = useCallback(
    (message: InternalMessageSummary) => {
      // The list is still laid out at this point; once the thread renders it's gone.
      if (listScrollRef.current) {
        listScrollTop.current = listScrollRef.current.scrollTop;
        restoreListScroll.current = true;
      }
      setOpenThreadId(message.threadId);
      setOpenMsgId(message.id);
      setOpenCall(null);
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

  /**
   * Open one call, full-tab, the same way a message opens its thread.
   *
   * Saves and re-arms the list scroll offset through the same two refs the thread uses,
   * so coming Back lands on the row that was clicked either way.
   */
  const openCallRow = useCallback(
    (call: InternalCall) => {
      if (listScrollRef.current) {
        listScrollTop.current = listScrollRef.current.scrollTop;
        restoreListScroll.current = true;
      }
      setOpenCall(call);
      setOpenThreadId(null);
      setOpenMsgId(null);
      // Opening marks it read — but only a call you RECEIVED has any read state; your
      // own is read by definition and the server would no-op the write anyway.
      if (!call.isRead && call.direction === 'inbound') {
        callStateMutation.mutate({ sid: call.sid, action: 'read' });
      }
    },
    [callStateMutation],
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
    if (completeTarget.kind === 'message') {
      stateMutation.mutate({ id: completeTarget.id, action: 'complete' });
    } else {
      callStateMutation.mutate({ sid: completeTarget.sid, action: 'complete' });
    }
    const { fromDetail } = completeTarget;
    setCompleteTarget(null);
    if (fromDetail) {
      closeThread();
      setOpenCall(null);
    }
  };

  const toggleComplete = (
    message: { id: number; isCompleted: boolean },
    fromDetail?: boolean,
  ) => {
    if (message.isCompleted) {
      stateMutation.mutate({ id: message.id, action: 'uncomplete' });
    } else {
      setCompleteTarget({ kind: 'message', id: message.id, fromDetail });
    }
  };

  const toggleCallComplete = (call: InternalCall, fromDetail?: boolean) => {
    if (call.isCompleted) {
      callStateMutation.mutate({ sid: call.sid, action: 'uncomplete' });
    } else {
      setCompleteTarget({ kind: 'call', sid: call.sid, fromDetail });
    }
  };

  const completeConfirmDialog = (
    <CompleteConfirmDialog
      open={completeTarget !== null}
      onOpenChange={(open) => { if (!open) setCompleteTarget(null); }}
      onConfirm={confirmComplete}
      description={
        completeTarget?.kind === 'call'
          ? "Confirm you've dealt with this call. It stays in your inbox with a blue check."
          : "Confirm you've completed this message. It stays in your inbox with a blue check."
      }
    />
  );

  // ── Placing a call ────────────────────────────────────────────────────────
  // The overlay takes over the moment this succeeds — it is mounted above the router, so
  // it follows the user anywhere for the rest of the call.
  const placeCall = (calleeId: number | undefined) => {
    if (!calleeId) return;
    setDialError(null);
    startCall.mutate(calleeId, {
      onSuccess: () => {
        setDialOpen(false);
        setDialPicked([]);
      },
      onError: (e: unknown) =>
        setDialError(e instanceof Error ? e.message : 'Could not place the call'),
    });
  };

  const dialDialog = (
    <Dialog open={dialOpen} onOpenChange={setDialOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Call a colleague</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <UserAutocomplete
            // One person per call. Committing a second replaces the first, so the
            // control cannot get into a state the API would reject.
            value={dialPicked.slice(0, 1)}
            onChange={(next) => setDialPicked(next.slice(-1))}
            users={directory.filter((u) => u.id !== user?.id)}
            placeholder="Type a name…"
          />
          {dialError && <p className="text-sm text-red-600">{dialError}</p>}
          {!token && <p className="text-sm text-red-600">You are signed out.</p>}
        </div>

        <DialogFooter>
          <DialogClose>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => placeCall(dialPicked[0])}
            disabled={!dialPicked.length || startCall.isPending}
            className="bg-teal-600 text-white hover:bg-teal-500"
          >
            {startCall.isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Phone size={14} className="mr-1.5" />
            )}
            Call
          </Button>
        </DialogFooter>
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
    setReplyBcc([]);
    setReplyShowBcc(false);
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
    setForwardBcc([]);
    setForwardShowBcc(false);
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
    setForwardBcc([]);
    setForwardShowBcc(false);
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
      if (att.size > MAX_FORWARD_HYDRATE_BYTES) {
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
      setForwardFiles((manual) => [...files, ...manual]);
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
    // FileList from the picker, File[] from a drop or paste.
    incoming: FileList | File[] | null,
    current: File[],
    set: (files: File[]) => void,
  ) => {
    if (!incoming || incoming.length === 0) return;
    // No count cap — same as outbound email. Only the per-file ceiling applies.
    const { files, notice } = mergeAttachments(current, Array.from(incoming));
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
        bcc: replyBcc,
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
        bcc: forwardBcc,
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
            header is itself a <button> and nesting one inside it is invalid HTML.
            Same reason the recipient disclosure sits in its own row below. */}
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
              {!expanded && (
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
          // pl-14 lines the details up under the sender name: px-3 (12) + avatar
          // w-8 (32) + gap-3 (12) = 56px.
          <div className="pl-14 pr-3 pb-2 -mt-1.5">
            <RecipientDetails
              from={{ name: m.from.name, email: m.from.email }}
              to={m.to.map((u) => ({ name: u.name, email: u.email }))}
              cc={m.cc.map((u) => ({ name: u.name, email: u.email }))}
              bcc={m.bcc.map((u) => ({ name: u.name, email: u.email }))}
              date={m.date}
              selfEmail={user?.email}
            />
          </div>
        )}

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
                <pre className="p-4 text-sm whitespace-pre-wrap font-[Arial,Helvetica,sans-serif]">
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

  // ── Call detail view ──────────────────────────────────────────────────────
  // Above the thread view and below every hook, so the two detail views are mutually
  // exclusive by construction rather than by keeping two ids in step.
  //
  // The row is read off the LIVE list when it is still loaded, so an optimistic
  // read/complete flip shows on the buttons immediately; `openCall` is the fallback for
  // a row the poll has since paged away.
  if (openCall) {
    const live = calls.find((c) => c.sid === openCall.sid) ?? openCall;
    return (
      <div className="flex flex-col h-full">
        <InternalCallDetail
          call={live}
          onClose={() => setOpenCall(null)}
          onCallBack={(peerId) => placeCall(peerId)}
          onMarkUnread={() =>
            callStateMutation.mutate({ sid: live.sid, action: 'unread' })
          }
          onRequestComplete={() => toggleCallComplete(live, true)}
          onUncomplete={() =>
            callStateMutation.mutate({ sid: live.sid, action: 'uncomplete' })
          }
        />
        {completeConfirmDialog}
      </div>
    );
  }

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
            <InlineComposerPanel
              variant="reply"
              formRef={replyRef}
              // The form sits below the dimmed later messages — name the one
              // being answered rather than leaving it implied.
              subtitle={
                replyTarget
                  ? `Replying to ${replyTarget.from.name} · ${formatEmailDate(replyTarget.date)}`
                  : undefined
              }
              toField={
                <UserAutocomplete
                  value={replyTo}
                  onChange={setReplyTo}
                  users={directory}
                  placeholder="Start typing a name…"
                />
              }
              ccField={
                <UserAutocomplete
                  value={replyCc}
                  onChange={setReplyCc}
                  users={directory}
                  placeholder="Optional"
                />
              }
              onShowBcc={replyShowBcc ? undefined : () => setReplyShowBcc(true)}
              bccField={
                replyShowBcc ? (
                  <UserAutocomplete
                    value={replyBcc}
                    onChange={setReplyBcc}
                    users={directory}
                    placeholder="Hidden from other recipients"
                  />
                ) : undefined
              }
              subject={replySubject}
              onSubjectChange={setReplySubject}
              body={replyBody}
              onBodyChange={setReplyBody}
              bodyPlaceholder="Write your reply…"
              messageLabel="Message"
              minHeight={140}
              maxHeight={320}
              files={replyFiles}
              setFiles={setReplyFiles}
              onPickFiles={(picked) => pickFiles(picked, replyFiles, setReplyFiles)}
              onDropFiles={(dropped) => pickFiles(dropped, replyFiles, setReplyFiles)}
              attachmentNotice={attachmentNotice}
              // Internal attachments are stored by us at any size, never off-loaded
              // to Drive, so `null` suppresses the "sent as … link" badge.
              cloudLabel={null}
              uploadProgress={sendMutation.uploadProgress}
              error={sendError}
              polish={replyPolish}
              polishContext={POLISH_CONTEXT}
              polishDraftPlain={htmlToText(splitSignature(replyBody).body)}
              onPolishAccept={(t) => {
                // Same shape as the forward handler below, so the two can't drift
                // if internal messages ever gain a signature or a quoted tail.
                const { sig } = splitSignature(replyBody);
                setReplyBody(joinPolishedBody(t, sig));
              }}
              sendLabel="Send Reply"
              sendDisabled={
                sendMutation.isPending ||
                (!htmlToText(replyBody).trim() && replyFiles.length === 0)
              }
              isSending={sendMutation.isPending}
              onSend={submitReply}
              onCancel={closeReply}
            />
          )}

          {forwardOpen && (
            <InlineComposerPanel
              variant="forward"
              formRef={forwardRef}
              // The form sits below the dimmed later messages, so name the
              // message being forwarded rather than leaving it implied.
              subtitle={
                forwardSource
                  ? `Forwarding ${forwardSource.from.name} · ${formatEmailDate(forwardSource.date)}`
                  : undefined
              }
              toField={
                <UserAutocomplete
                  value={forwardTo}
                  onChange={setForwardTo}
                  users={directory}
                  placeholder="Start typing a name…"
                />
              }
              ccField={
                <UserAutocomplete
                  value={forwardCc}
                  onChange={setForwardCc}
                  users={directory}
                  placeholder="Optional"
                />
              }
              onShowBcc={forwardShowBcc ? undefined : () => setForwardShowBcc(true)}
              bccField={
                forwardShowBcc ? (
                  <UserAutocomplete
                    value={forwardBcc}
                    onChange={setForwardBcc}
                    users={directory}
                    placeholder="Hidden from other recipients"
                  />
                ) : undefined
              }
              subject={forwardSubject}
              onSubjectChange={setForwardSubject}
              body={forwardBody}
              onBodyChange={setForwardBody}
              bodyPlaceholder="Add a note…"
              messageLabel="Message"
              minHeight={200}
              maxHeight={360}
              files={forwardFiles}
              setFiles={setForwardFiles}
              onPickFiles={(picked) => pickFiles(picked, forwardFiles, setForwardFiles)}
              onDropFiles={(dropped) => pickFiles(dropped, forwardFiles, setForwardFiles)}
              attachmentNotice={attachmentNotice}
              attachNotices={
                <>
                  {forwardAttLoading && (
                    <p className="text-xs text-muted-foreground">Loading attachments…</p>
                  )}
                  {forwardSkipped.length > 0 && (
                    <p className="text-xs text-amber-600">
                      Not re-attached (too large to forward):{' '}
                      {forwardSkipped.join(', ')}
                    </p>
                  )}
                </>
              }
              cloudLabel={null}
              uploadProgress={sendMutation.uploadProgress}
              error={sendError}
              polish={forwardPolish}
              polishContext={POLISH_CONTEXT}
              polishDraftPlain={htmlToText(splitSignature(forwardBody).body)}
              onPolishAccept={(t) => {
                // Keep the quoted block; polish only rewrites the note above it.
                const { sig } = splitSignature(forwardBody);
                setForwardBody(joinPolishedBody(t, sig));
              }}
              sendLabel="Send"
              sendDisabled={
                sendMutation.isPending || forwardTo.length === 0 || forwardAttLoading
              }
              isSending={sendMutation.isPending}
              onSend={submitForward}
              onCancel={closeForward}
            />
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
          // Both channels feed one chip, the same way the company tab adds the phone
          // contribution onto the mailbox's.
          const count =
            id === 'UNCOMPLETED'
              ? (uncompleted?.count ?? 0) + (callCounts?.uncompleted ?? 0)
              : id === 'UNREAD'
                ? (unread?.count ?? 0) + (callCounts?.unread ?? 0)
                : 0;
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
            placeholder="Search…"
            className="h-8 w-48"
          />
          {/* Size and mail-folder scope are hidden for this variant: internal
              messages store no size and have no mail folders. */}
          <AdvancedSearchPanel
            filters={filters}
            onApply={setFilters}
            variant="internal"
          />
          <Select
            items={INTERNAL_KIND_FILTER_LABELS}
            value={filter}
            onValueChange={(v) =>
              setFilter(isInternalKindFilter(v) ? v : 'all')
            }
          >
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INTERNAL_KIND_FILTER_LABELS).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              setDialError(null);
              setDialOpen(true);
            }}
          >
            <Phone size={14} /> New call
          </Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            onClick={() => openInternal()}
          >
            <Pencil size={14} /> New message
          </Button>
        </div>
      </div>

      <div ref={listScrollRef} className="flex-1 overflow-y-auto rounded-lg border">
        {/*
          `showListSpinner`, not `messagesLoading || callsLoading`. The two sources
          resolve independently, so ORing their flags replaces a list that has already
          painted — the exact defect that helper documents for the company inbox, and it
          arrived here the moment this tab gained a second source.
        */}
        {showListSpinner({
          isInboxLike: true,
          emailLoading: listQuery.isLoading,
          chatLoading: false,
          phoneLoading: folder !== 'SENT' && callQuery.isLoading,
          loadedRowCount: items.length,
        }) ? (
          <p className="text-sm text-muted-foreground p-6 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Inbox size={32} />
            <p className="text-sm">
              {search || hasActiveFilters(filters) || filter !== 'all'
                ? 'Nothing matches your search.'
                : 'Nothing here yet.'}
            </p>
          </div>
        ) : (
          <>
            {items.map((item, idx) =>
              item.kind === 'message' ? (
                <InternalMessageRow
                  key={internalItemId(item)}
                  message={item.data}
                  sentView={folder === 'SENT'}
                  isFirst={idx === 0}
                  onOpen={() => openMessage(item.data)}
                  onToggleRead={() =>
                    stateMutation.mutate({
                      id: item.data.id,
                      action: item.data.isRead ? 'unread' : 'read',
                    })
                  }
                  onToggleComplete={() => toggleComplete(item.data)}
                />
              ) : (
                <InternalCallRow
                  key={internalItemId(item)}
                  call={item.data}
                  isFirst={idx === 0}
                  onOpen={() => openCallRow(item.data)}
                  onToggleRead={() =>
                    callStateMutation.mutate({
                      sid: item.data.sid,
                      action: item.data.isRead ? 'unread' : 'read',
                    })
                  }
                  onToggleComplete={() => toggleCallComplete(item.data)}
                />
              ),
            )}
            <div ref={loadMoreRef} className="h-8" />
            {(listQuery.isFetchingNextPage || callQuery.isFetchingNextPage) && (
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
      {dialDialog}
    </div>
  );
}
