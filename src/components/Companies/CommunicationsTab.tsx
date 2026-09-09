import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useComposer } from '@/context/ComposerContext';
import { useGmailAccount } from '@/hooks/useGmailAccount';
import { useGmailEmails } from '@/hooks/useGmailEmails';
import { useGmailChats } from '@/hooks/useGmailChats';
import { useMarkEmailRead } from '@/hooks/useMarkEmailRead';
import { useMarkEmailUnread } from '@/hooks/useMarkEmailUnread';
import { useMarkChatRead } from '@/hooks/useMarkChatRead';
import { useMarkChatUnread } from '@/hooks/useMarkChatUnread';
import { useMarkEmailComplete } from '@/hooks/useMarkEmailComplete';
import { useMarkEmailUncomplete } from '@/hooks/useMarkEmailUncomplete';
import { useMarkChatComplete } from '@/hooks/useMarkChatComplete';
import { useMarkChatUncomplete } from '@/hooks/useMarkChatUncomplete';
import { useGmailUnreadCount } from '@/hooks/useGmailUnreadCount';
import { useGmailUncompletedCount } from '@/hooks/useGmailUncompletedCount';
import { useCompany } from '@/hooks/useCompany';
import { usePhoneNumber } from '@/hooks/usePhoneNumber';
import { usePhoneTimeline } from '@/hooks/usePhoneTimeline';
import { usePhoneCounts } from '@/hooks/usePhoneCounts';
import { useMarkPhoneItem } from '@/hooks/useMarkPhoneItem';
import { useStartCall } from '@/hooks/useStartCall';
import { useRingingCall } from '@/hooks/useRingingCall';
import { useSoftphone, useSoftphoneActions } from '@/context/SoftphoneContext';
import { unlockAudio } from '@/lib/notificationSound';
import { fetchAuthUrl } from '@/api/gmail';
import { fetchLatestPreview } from '@/api/communications';
import { messagePreview } from '@/lib/notificationText';
import type { EmailProvider } from '@/api/gmail';
import { useAttachmentViewer } from './AttachmentViewerContext';
import { CompleteConfirmDialog } from './CompleteConfirmDialog';
import { ChatThreadView } from './communications/ChatThreadView';
import { ConnectAccountPanel } from './communications/ConnectAccountPanel';
import { EmailThreadView } from './communications/EmailThreadView';
import { SmsThreadView } from './communications/SmsThreadView';
import { CallDetailView } from './communications/CallDetailView';
import { ComposeSmsDialog } from './communications/ComposeSmsDialog';
import { RingingCallBanner } from './communications/RingingCallBanner';
import { DialCallDialog } from './communications/DialCallDialog';
import { InboxView } from './communications/InboxView';
import { usePersistCommUi, useRestoredCommUi } from './communications/useCommUiState';
import { useListScrollRestore } from './communications/useListScrollRestore';
import { useUnifiedInbox } from './communications/useUnifiedInbox';
import { showListSpinner } from './communications/inbox-loading';
import {
  ALL_LABELS, FOLDERS, INBOX_TABS,
  type CompleteTarget, type ItemKind, type KindFilter,
  type Selection, type UnifiedItem,
} from './communications/types';
import {
  EMPTY_FILTERS,
  filterKey,
  filterParams,
  isStructuredSearch,
  type SearchFilters,
} from './communications/search-filters';

interface Props {
  companyId: number;
  isAdmin: boolean;
  /**
   * This company is assigned to the signed-in user. Gates the new-email popup only:
   * a mailbox someone else works should not interrupt you, admin or not. The in-tab
   * banner is unaffected — that is feedback on a screen you are already looking at.
   */
  assignedToMe: boolean;
  /**
   * Communications is the visible tab. The component is kept mounted while hidden
   * (so the open message, folder, search and any in-progress draft survive a tab
   * switch), so anything that should only happen while the user is *looking* at the
   * tab — polling, the SSE stream, scroll restoration — is gated on this, not mount.
   */
  active: boolean;
}

/**
 * The company mailbox: a unified Gmail/Outlook + Chat/Teams inbox, an email
 * conversation view and a chat conversation view.
 *
 * This component is the shell. It owns what all three screens share — which
 * message is open, which folder, the search term, the account itself and the
 * per-message read/complete mutations — and hands the rest to the view that
 * actually renders it. Drafts belong to the view they are typed in, so they reset
 * by unmounting rather than by hand.
 */
export function CommunicationsTab({ companyId, isAdmin, assignedToMe, active }: Props) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { notifyPush, suppressSource } = useNotifications();
  const { openEmail } = useComposer();

  const [connecting, setConnecting] = useState(false);
  const [newEmailBanner, setNewEmailBanner] = useState(false);
  // "Connect a mailbox" is a banner now, not a wall — so it needs to be dismissable,
  // and to stay dismissed for the session rather than reappearing on every render.
  const [connectDismissed, setConnectDismissed] = useState(false);
  const [composeSmsOpen, setComposeSmsOpen] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
  // The message awaiting "mark complete" confirmation (carries kind so the right
  // endpoint is hit). null = no confirm dialog open.
  const [completeTarget, setCompleteTarget] = useState<CompleteTarget | null>(null);

  // ── Which message / folder is open (the restore point) ─────────────────────
  const restored = useRestoredCommUi(companyId);

  /**
   * Which detail view is open, if any — ONE discriminated union rather than a
   * nullable id per kind.
   *
   * With four channels, "exactly one thing is open" maintained by hand across every
   * open/close handler is quadratic and drifts; here the wrong combination cannot be
   * constructed, and each render branch is narrowed to its own fields.
   */
  const [selected, setSelected] = useState<Selection | null>(restored.selected ?? null);
  const [selectedLabel, setSelectedLabel] = useState<string>(
    ALL_LABELS.includes(restored.selectedLabel ?? '') ? restored.selectedLabel! : 'INBOX',
  );
  // Gates the "Mark as unread" button. Opening an email always marks it read, so a
  // restored open email is read by definition — otherwise the button would silently
  // go missing from the toolbar after a reload. (Not worth persisting on its own.)
  const [selectedMsgIsRead, setSelectedMsgIsRead] = useState(
    restored.selected?.kind === 'email',
  );
  // The email thread id, captured from the clicked row so the whole conversation
  // loads in one request. Not persisted: a restored selection falls back to the
  // opened message's own threadId.
  const [restoredThreadId, setRestoredThreadId] = useState<string | null>(null);
  // Inbox search + filter. `searchInput` is the raw box; `searchQuery` is the
  // debounced/committed term sent to the server. `filter` narrows by kind/state.
  const [searchInput, setSearchInput] = useState(restored.searchInput ?? '');
  // Seeded from the restored term too — otherwise the debounce below would render
  // one unfiltered frame before catching up.
  const [searchQuery, setSearchQuery] = useState((restored.searchInput ?? '').trim());
  const [filter, setFilter] = useState<KindFilter>(restored.filter ?? 'all');
  // Advanced-search fields. Committed as a unit when the panel's Search is pressed
  // (the panel holds its own draft), so no debounce is needed here.
  const [filters, setFilters] = useState<SearchFilters>(
    restored.filters ?? EMPTY_FILTERS,
  );
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  usePersistCommUi(companyId, {
    selectedLabel,
    selected,
    filter,
    searchInput,
    filters,
  });

  // An open attachment preview pauses the thread polls. The overlay itself is
  // immune to refetches (it lives in the app-level provider), but a poll hands the
  // strip new Gmail attachment ids — which would re-fetch a playing audio/video.
  const { item: viewerItem } = useAttachmentViewer();

  const { data: account, isLoading: accountLoading } = useGmailAccount(companyId);
  // Which provider is connected (drives the API base — via the registry in
  // api/gmail.ts — plus all user-facing labels). Defaults to Google when unknown
  // (nothing connected / still loading), which is harmless: no request fires then.
  const provider: EmailProvider = account?.provider ?? 'GOOGLE';
  const providerLabels =
    provider === 'MICROSOFT'
      ? { name: 'Outlook', chat: 'Teams' }
      : { name: 'Gmail', chat: 'Google Chat' };
  const accountAddress = account?.emailAddress ?? account?.gmailAddress ?? '';
  const cloudLabel = provider === 'MICROSOFT' ? 'OneDrive' : 'Drive';
  // Teams/Chat support. Personal Outlook accounts connect with mail-only scopes
  // (Microsoft Graph doesn't expose personal Teams), so hasChatScope is false —
  // suppress the chat query + banners entirely for them. Gmail always supports chat.
  const chatSupported = provider !== 'MICROSOFT' || account?.hasChatScope !== false;
  // INBOX, UNCOMPLETED and UNREAD all render the unified email+chat inbox.
  const isInboxLike = INBOX_TABS.includes(selectedLabel);
  // UNREAD/UNCOMPLETED are filtered folders whose badge counts the WHOLE mailbox;
  // they get the clamp relaxed + a target-driven auto-load so the list backs the badge.
  const isFilteredFolder = selectedLabel === 'UNREAD' || selectedLabel === 'UNCOMPLETED';
  // The Gmail label to actually fetch. UNREAD fetches the unread-filtered inbox
  // directly (Gmail ANDs the labels) so every unread row arrives in ~1 page. UNCOMPLETED
  // has no Gmail label (completed is app state), so it hits a server virtual folder that
  // pages the "INBOX minus completed" id list — every page holds only uncompleted rows,
  // so the list matches the badge exactly. Plain INBOX loads the full inbox.
  const emailLabel =
    selectedLabel === 'UNREAD'
      ? 'INBOX,UNREAD'
      : selectedLabel === 'UNCOMPLETED'
        ? 'UNCOMPLETED'
        : isInboxLike
          ? 'INBOX'
          : selectedLabel;
  const searchPlaceholder = isInboxLike
    ? 'Search inbox…'
    : `Search ${(FOLDERS.find((f) => f.id === selectedLabel)?.label ?? '').toLowerCase()}…`;

  // Search is server-side (Gmail `q`), so it covers the whole folder, not just
  // the pages loaded so far. Every folder has a search box.
  const activeSearch = searchQuery || undefined;

  // Emails + chats are infinite queries; older pages load on scroll. Chats only
  // exist in the inbox, and searching them costs a server-side in-memory scan —
  // so don't pay for it while the user is sitting in Sent/Spam/Trash.
  // Gated on `account` too so the very first fetch waits until the provider is
  // known (the api base is chosen from it), avoiding a stray /api/gmail hit for an
  // Outlook company on mount.
  // Advanced filters override the folder's own label when a mail scope is picked
  // ("All Mail", "Sent"…) — the server maps it onto the label both providers read.
  const searchParams = filterParams(filters);
  const searchKey = filterKey(filters);
  const emailQuery = useGmailEmails(
    companyId,
    emailLabel,
    activeSearch,
    active && !!account,
    searchParams,
    searchKey,
  );
  const chatQuery = useGmailChats(
    companyId,
    account,
    // A structured query is Gmail/Graph operator syntax. Chat search is a plain
    // substring scan over sender/space/text, so handing it one could only ever
    // produce garbage matches — search chats by free text alone.
    isInboxLike && !isStructuredSearch(filters) ? activeSearch : undefined,
    active && chatSupported && !filters.excludeChats,
  );

  const { data: unreadData } = useGmailUnreadCount(companyId, account);
  const { data: uncompletedData } = useGmailUncompletedCount(companyId, account);

  // Phone lives beside the mailbox, not inside it: a company can have a support
  // number and no mailbox, or the reverse. `hasNumber` gates the query so a company
  // without one never pays for a request that can only ever return an empty page.
  /**
   * The support number, WITHOUT waiting a round trip to learn it.
   *
   * `usePhoneTimeline` and `usePhoneCounts` are gated on this, so while
   * `usePhoneNumber` was in flight the phone source sat disabled and only began
   * loading once it answered — a serialized hop in front of the request that
   * matters, and the reason phone rows always arrived last on a cold open.
   *
   * `Company.supportNumber` is a server-written MIRROR of the active
   * SupportNumber row, and the parent page has already loaded the company, so
   * this is a cache read costing nothing. The authoritative row still wins the
   * moment it lands — `undefined` means "not answered yet", which is what
   * distinguishes it from a company that genuinely has no number.
   */
  const { data: company } = useCompany(companyId);
  const { data: supportNumberRow } = usePhoneNumber(companyId);
  const supportNumber =
    supportNumberRow !== undefined
      ? (supportNumberRow?.phoneNumber ?? null)
      : (company?.supportNumber ?? null);
  const phoneQuery = usePhoneTimeline(companyId, !!supportNumber, active);
  const { data: phoneCountData } = usePhoneCounts(companyId, !!supportNumber, active);

  // Badges count every channel, so the phone contribution is added to the mailbox's.
  const unreadCount = (unreadData?.count ?? 0) + (phoneCountData?.unread ?? 0);
  const uncompletedCount =
    (uncompletedData?.count ?? 0) + (phoneCountData?.uncompleted ?? 0);

  const {
    emailItems, chatItems, phoneItems, visibleItems, loadMoreRef,
    emailHasNext, emailFetchingNext, anyFetchingNext, allExhausted,
  } = useUnifiedInbox({
    emailQuery,
    chatQuery,
    phoneQuery,
    phoneEnabled: !!supportNumber,
    isInboxLike,
    isFilteredFolder,
    selectedLabel,
    activeSearch,
    filter,
    targetCount:
      selectedLabel === 'UNREAD'
        ? unreadCount
        : selectedLabel === 'UNCOMPLETED'
          ? uncompletedCount
          : undefined,
    // One key instead of one dep per kind: the observer only needs to know that the
    // list unmounted and came back, not which view was open.
    detailOpenKey: selected ? `${selected.kind}:${JSON.stringify(selected)}` : null,
  });

  const { listRootRef, saveListScroll } = useListScrollRestore({
    active,
    listOpen: selected === null,
  });

  // ── Per-message state mutations (shared by the list, both detail views and bulk) ──
  const markReadMutation = useMarkEmailRead(companyId);
  const markUnreadMutation = useMarkEmailUnread(companyId);
  const markChatReadMutation = useMarkChatRead(companyId);
  const markChatUnreadMutation = useMarkChatUnread(companyId);
  const markEmailCompleteMutation = useMarkEmailComplete(companyId);
  const markEmailUncompleteMutation = useMarkEmailUncomplete(companyId);
  const markChatCompleteMutation = useMarkChatComplete(companyId);
  const markChatUncompleteMutation = useMarkChatUncomplete(companyId);
  const markPhoneRead = useMarkPhoneItem(companyId, 'read');
  const markPhoneUnread = useMarkPhoneItem(companyId, 'unread');
  const markPhoneComplete = useMarkPhoneItem(companyId, 'complete');
  const markPhoneUncomplete = useMarkPhoneItem(companyId, 'uncomplete');
  const startCallMutation = useStartCall(companyId);

  // ── A call ringing THIS company, answerable from here ─────────────────────
  // Gated on the softphone actually holding an unpaired INVITE. Every registered
  // browser receives every INVITE (one shared SIP credential), but only a browser that
  // has one can accept it — so with nothing held there is nothing to ask about, and the
  // query stays idle. `phase !== 'idle'` means this browser is already showing the call
  // in the floating overlay, or is on another call.
  const { phase: callPhase, hasHeldInvite } = useSoftphone();
  const { answerHeld } = useSoftphoneActions();
  const [ignoredCallSid, setIgnoredCallSid] = useState<string | null>(null);

  const { data: ringingCall } = useRingingCall(
    companyId,
    hasHeldInvite && callPhase === 'idle' && active && !!supportNumber,
  );
  const showRinging =
    !!ringingCall &&
    hasHeldInvite &&
    callPhase === 'idle' &&
    ringingCall.callSid !== ignoredCallSid;

  /**
   * Rendered in EVERY branch below, not just the inbox.
   *
   * The tab is an early-return router — loading, connect panel, four detail views, the
   * inbox — so a banner wired only into `InboxView` would vanish the moment somebody
   * opened an email, which is exactly when a call is most likely to arrive unnoticed.
   */
  const ringingBanner = showRinging ? (
    <RingingCallBanner
      call={ringingCall}
      onAnswer={() => answerHeld(ringingCall)}
      onDecline={() => setIgnoredCallSid(ringingCall.callSid)}
    />
  ) : null;

  /**
   * Dial a number from a row or a detail view.
   *
   * `unlockAudio()` runs HERE, synchronously inside the click, and not when the call
   * connects: browsers only grant audio playback and microphone access off a real user
   * gesture, and by the time SignalWire rings this browser back the click is seconds
   * old. Skipping it produces a call that connects with no sound and no obvious cause.
   */
  const handleCall = useCallback(
    (number: string) => {
      unlockAudio();
      startCallMutation.mutate(number);
    },
    [startCallMutation],
  );

  // First error across the per-message state toggles. These calls silently ignored
  // non-OK responses until now, which is what made a failed "mark complete" look
  // like it had worked until the next refresh.
  const stateError =
    (
      markEmailCompleteMutation.error ??
      markEmailUncompleteMutation.error ??
      markChatCompleteMutation.error ??
      markChatUncompleteMutation.error ??
      markReadMutation.error ??
      markUnreadMutation.error
    )?.message ?? null;

  const resetStateErrors = () => {
    markEmailCompleteMutation.reset();
    markEmailUncompleteMutation.reset();
    markChatCompleteMutation.reset();
    markChatUncompleteMutation.reset();
    markReadMutation.reset();
    markUnreadMutation.reset();
  };

  // ── SSE: real-time inbox updates ───────────────────────────────────────────
  // Closed while the tab is hidden — all it does then is mark a disabled query
  // stale (which re-enabling does anyway) and flash a banner nobody can see. The
  // unread/uncompleted badges are driven by their own count queries, which keep
  // polling from CompanyDetailPage regardless.
  useEffect(() => {
    // SSE is a Gmail-only push channel (Pub/Sub). Outlook has no equivalent here —
    // it relies on the 15s polling on the email/chat queries instead.
    if (!active || !account || !token || provider !== 'GOOGLE') return;
    const es = new EventSource(
      `/api/gmail/companies/${companyId}/events?token=${encodeURIComponent(token)}`,
    );
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as { type: string };
        if (data.type === 'new-email') {
          void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
          void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
          // The dashboard badge reads this map, and it wasn't being refreshed here —
          // so a pushed email only showed up on the badge a poll cycle later.
          void qc.invalidateQueries({ queryKey: ['gmail-uncompleted-counts'] });
          setNewEmailBanner(true);
          setTimeout(() => setNewEmailBanner(false), 5000);
          // Sound/desktop alert. Fires even though this tab is what's on screen —
          // the banner above and the alert are deliberately not exclusive. Stamping
          // the company as the source also stops the slower count poll from
          // announcing this same email a second time.
          if (assignedToMe) {
            // Stamp the source NOW, not after the await below. notifyPush stamps it
            // too, but the preview fetch can take seconds, and the 60s count poll
            // landing inside that window would announce this same email twice.
            suppressSource(`company:${companyId}`);
            // Same preview fetch the cross-company poll uses, so a pushed popup and
            // a polled one read identically. The body used to be the mailbox
            // address, which said nothing about the message that just landed.
            void (async () => {
              const preview = await fetchLatestPreview(token, companyId);
              notifyPush({
                source: `company:${companyId}`,
                title: 'New email',
                body: preview ? messagePreview(preview) : 'New message',
                tag: `cyg-company-${companyId}`,
              });
            })();
          }
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [
    active,
    account,
    assignedToMe,
    companyId,
    token,
    qc,
    provider,
    notifyPush,
    suppressSource,
  ]);

  const handleConnect = useCallback(
    async (prov: EmailProvider = 'GOOGLE', kind: 'work' | 'personal' = 'work') => {
      if (!token) return;
      setConnecting(true);
      try {
        const { authUrl } = await fetchAuthUrl(token, companyId, prov, kind);
        const popup = window.open(authUrl, `${prov}-oauth`, 'width=500,height=600');
        // The server sweeps the backlog to "completed" on every connect, so refresh
        // the account, lists and badges. The sweep is async and may still be running;
        // the 15s poll on emails/chats catches the remainder.
        const refreshAfterConnect = () => {
          for (const key of [
            ['gmail-account', companyId],
            ['gmail-emails', companyId],
            ['gmail-chats', companyId],
            ['gmail-unread-count', companyId],
            ['gmail-uncompleted-count', companyId],
            ['gmail-uncompleted-counts'],
          ]) {
            void qc.invalidateQueries({ queryKey: key });
          }
        };
        let settled = false;
        const teardown = () => {
          clearInterval(poll);
          clearTimeout(safety);
          window.removeEventListener('message', onMessage);
          window.removeEventListener('focus', onReturn);
          document.removeEventListener('visibilitychange', onVisible);
        };
        // Terminal: a definitive connect signal — refetch, stop, and clean up.
        const finish = () => {
          if (settled) return;
          settled = true;
          refreshAfterConnect();
          setConnecting(false);
          teardown();
        };
        // Non-terminal: the user returned to the app (focus / tab visible). Re-check
        // the account — if OAuth finished, the refetch flips the UI to the inbox; if
        // not yet, keep listening (a later return will catch it). Deliberately does
        // NOT tear down, so an early focus (before OAuth completes) can't drop the
        // real completion. This is the COOP-proof path: when a production
        // Cross-Origin-Opener-Policy header severs window.opener, both postMessage
        // and popup.closed silently fail, so returning focus is the only signal.
        const onReturn = () => {
          if (settled) return;
          refreshAfterConnect();
          setConnecting(false);
        };
        const onMessage = (e: MessageEvent<{ type: string }>) => {
          if (e.origin !== window.location.origin) return;
          const t = e.data?.type;
          if (
            t === 'gmail-connected' ||
            t === 'gmail-error' ||
            t === 'microsoft-connected' ||
            t === 'microsoft-error'
          ) {
            finish();
          }
        };
        const onVisible = () => {
          if (document.visibilityState === 'visible') onReturn();
        };
        window.addEventListener('message', onMessage);
        window.addEventListener('focus', onReturn);
        document.addEventListener('visibilitychange', onVisible);
        const poll = setInterval(() => {
          // Fallback: the postMessage from the success page can be missed (origin
          // guard, or the popup closing before the message is delivered).
          if (popup?.closed) finish();
        }, 500);
        // Safety net so the focus/visibility listeners can't leak if no terminal
        // signal ever arrives (e.g. COOP + the user never reopens the popup).
        const safety = setTimeout(teardown, 10 * 60 * 1000);
      } catch {
        setConnecting(false);
      }
    },
    [token, companyId, qc],
  );

  // ── Open / close handlers ──────────────────────────────────────────────────
  const closeDetail = () => setSelected(null);

  /**
   * Per-kind state mutations, looked up rather than chained through `kind === 'x' ?`.
   *
   * Four channels × four actions is sixteen combinations; as nested ternaries that is
   * unreadable, and every new channel would have to be threaded through five separate
   * call sites. Adding a row to this table is the whole change instead.
   */
  const stateMutations: Record<
    ItemKind,
    { read: (id: string) => void; unread: (id: string) => void;
      complete: (id: string) => void; uncomplete: (id: string) => void }
  > = {
    email: {
      read: (id) => markReadMutation.mutate(id),
      unread: (id) => markUnreadMutation.mutate(id),
      complete: (id) => markEmailCompleteMutation.mutate(id),
      uncomplete: (id) => markEmailUncompleteMutation.mutate(id),
    },
    chat: {
      read: (id) => markChatReadMutation.mutate(id),
      unread: (id) => markChatUnreadMutation.mutate(id),
      complete: (id) => markChatCompleteMutation.mutate(id),
      uncomplete: (id) => markChatUncompleteMutation.mutate(id),
    },
    call: {
      read: (id) => markPhoneRead.mutate(id),
      unread: (id) => markPhoneUnread.mutate(id),
      complete: (id) => markPhoneComplete.mutate(id),
      uncomplete: (id) => markPhoneUncomplete.mutate(id),
    },
    // Calls and texts share one endpoint and one set of mutations — the item id
    // already carries which it is.
    sms: {
      read: (id) => markPhoneRead.mutate(id),
      unread: (id) => markPhoneUnread.mutate(id),
      complete: (id) => markPhoneComplete.mutate(id),
      uncomplete: (id) => markPhoneUncomplete.mutate(id),
    },
  };

  const handleOpenItem = (item: UnifiedItem) => {
    saveListScroll();
    if (!item.data.isRead) stateMutations[item.kind].read(item.data.id);
    switch (item.kind) {
      case 'email':
        setRestoredThreadId(item.data.threadId || null);
        // Always read after opening (auto-marked, or was already read).
        setSelectedMsgIsRead(true);
        setSelected({
          kind: 'email',
          msgId: item.data.id,
          threadId: item.data.threadId || null,
        });
        break;
      case 'chat':
        setSelected({
          kind: 'chat',
          spaceId: item.data.spaceId,
          msgId: item.data.id,
          // Anchor: messages after this are dimmed.
          msgTime: item.data.createTime,
        });
        break;
      case 'sms':
        setSelected({
          kind: 'sms',
          peer: item.data.counterparty,
          msgId: item.data.id,
          msgTime: item.data.at,
        });
        break;
      case 'call':
        setSelected({ kind: 'call', sid: item.data.sid, itemId: item.data.id });
        break;
    }
  };

  const handleToggleRead = (item: UnifiedItem) => {
    const { isRead, id } = item.data;
    const m = stateMutations[item.kind];
    (isRead ? m.unread : m.read)(id);
  };

  // Marking complete asks for confirmation first; un-completing is a direct toggle.
  const uncomplete = (kind: ItemKind, id: string) =>
    stateMutations[kind].uncomplete(id);

  const confirmComplete = () => {
    if (!completeTarget) return;
    const { kind, id, fromDetail } = completeTarget;
    stateMutations[kind].complete(id);
    setCompleteTarget(null);
    // If confirmed from inside an open message, also exit back to the inbox
    // (so we don't re-prompt on the row).
    if (fromDetail) closeDetail();
  };

  // Fan a single action out over the selected messages, dispatching the matching
  // existing (optimistic, self-invalidating) mutation per id by its kind. Note:
  // email read/unread hits the Gmail API once per message — fine for this small
  // admin tool; there is no batch endpoint. read/unread run immediately;
  // complete/uncomplete are routed through a confirm dialog first (in InboxView).
  const runBulk = (
    action: 'read' | 'unread' | 'complete' | 'uncomplete',
    items: UnifiedItem[],
  ) => {
    // Dispatched off each item's own `kind`, which the caller already carries — the
    // id shape is never inspected to work out what a row is.
    for (const it of items) stateMutations[it.kind][action](it.data.id);
  };

  const handleSelectFolder = (folderId: string) => {
    setSelectedLabel(folderId);
    setSelected(null);
    // Drop the term rather than carry it into the new folder. Clear the debounced
    // value too, or it drives the new folder's query for another 350ms.
    setSearchInput('');
    setSearchQuery('');
    // Same reasoning for the advanced filters — and its scope would otherwise
    // silently override the folder the user just picked.
    setFilters(EMPTY_FILTERS);
  };

  // Mark-complete confirmation — shared across the inbox and both detail views
  // so it can appear in-place wherever "Mark complete" is clicked.
  const completeConfirm = (
    <CompleteConfirmDialog
      open={completeTarget !== null}
      onOpenChange={(open) => { if (!open) setCompleteTarget(null); }}
      onConfirm={confirmComplete}
      description="Confirm you've completed this message. It stays in the inbox with a blue check, visible to everyone."
    />
  );

  // ── Loading / not connected ───────────────────────────────────────────────

  if (accountLoading) {
    return (
      <>
        {ringingBanner}
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Loading…
        </div>
      </>
    );
  }

  // Nothing connected AND no number: there is genuinely nothing to show, so the
  // full-page panel is still right. With a support number the tab renders calls and
  // texts instead, and the mailbox prompt becomes a banner above the list.
  if (!account && !supportNumber) {
    return (
      <>
        {ringingBanner}
        <ConnectAccountPanel
          isAdmin={isAdmin}
          connecting={connecting}
          onConnect={(prov, kind) => void handleConnect(prov, kind)}
        />
      </>
    );
  }

  // ── Detail views ──────────────────────────────────────────────────────────
  // A switch over `selected.kind` rather than a chain of "if (someId)". Each branch
  // is narrowed to its own fields, so it cannot read another kind's.

  if (selected?.kind === 'chat' && account) {
    return (
      <>
        {ringingBanner}
        <ChatThreadView
          companyId={companyId}
          token={token}
          isAdmin={isAdmin}
          account={account}
          provider={provider}
          providerLabels={providerLabels}
          connecting={connecting}
          onConnect={(prov) => void handleConnect(prov)}
          spaceId={selected.spaceId}
          openedChatMsgId={selected.msgId}
          openedChatMsgTime={selected.msgTime}
          inboxRow={chatItems.find((m) => m.id === selected.msgId) ?? null}
          active={active}
          pollEnabled={active && !viewerItem}
          onClose={closeDetail}
          onAnchorChange={(m) =>
            setSelected({
              kind: 'chat',
              // The space cannot change by re-anchoring within it, and the callback
              // only carries the message.
              spaceId: selected.spaceId,
              msgId: m.id,
              msgTime: m.createTime,
            })
          }
          onRequestComplete={setCompleteTarget}
          onUncomplete={uncomplete}
        />
        {completeConfirm}
      </>
    );
  }

  if (selected?.kind === 'email' && account) {
    return (
      <>
        {ringingBanner}
        <EmailThreadView
          companyId={companyId}
          token={token}
          account={account}
          accountAddress={accountAddress}
          provider={provider}
          active={active}
          pollEnabled={active && !viewerItem}
          selectedMsgId={selected.msgId}
          selectedThreadId={selected.threadId ?? restoredThreadId}
          selectedMsgIsRead={selectedMsgIsRead}
          inboxIsCompleted={
            emailItems.find((m) => m.id === selected.msgId)?.isCompleted ?? false
          }
          cloudLabel={cloudLabel}
          onAnchorChange={(msgId) =>
            setSelected({ kind: 'email', msgId, threadId: selected.threadId })
          }
          onClose={closeDetail}
          onRequestComplete={setCompleteTarget}
          onUncomplete={uncomplete}
        />
        {completeConfirm}
      </>
    );
  }

  if (selected?.kind === 'sms') {
    const row = phoneItems.find((i) => i.id === selected.msgId);
    return (
      <>
        {ringingBanner}
        <SmsThreadView
          companyId={companyId}
          peer={selected.peer}
          anchorMsgId={selected.msgId}
          anchorTime={selected.msgTime}
          supportNumber={supportNumber}
          isCompleted={row?.isCompleted ?? false}
          active={active}
          onClose={closeDetail}
          onCall={handleCall}
          onRequestComplete={setCompleteTarget}
          onUncomplete={uncomplete}
        />
        {completeConfirm}
      </>
    );
  }

  if (selected?.kind === 'call') {
    const row = phoneItems.find((i) => i.id === selected.itemId);
    return (
      <>
        {ringingBanner}
        <CallDetailView
          companyId={companyId}
          sid={selected.sid}
          itemId={selected.itemId}
          call={row?.kind === 'call' ? row : null}
          onClose={closeDetail}
          onCall={handleCall}
          onRequestComplete={setCompleteTarget}
          onUncomplete={uncomplete}
        />
        {completeConfirm}
      </>
    );
  }

  // ── Inbox / folder view ───────────────────────────────────────────────────

  const chatFirst = chatQuery.data?.pages?.[0];
  const emailFirst = emailQuery.data?.pages?.[0];

  // Mirrors InboxView's own `rows`: the unified list in the inbox, email alone in a folder.
  const loadedRowCount = isInboxLike ? visibleItems.length : emailItems.length;
  const listSpinner = showListSpinner({
    isInboxLike,
    emailLoading: emailQuery.isLoading,
    chatLoading: chatQuery.isLoading,
    phoneLoading: phoneQuery.isLoading,
    loadedRowCount,
  });

  return (
    <>
      {ringingBanner}
      <InboxView
        companyId={companyId}
        token={token}
        isAdmin={isAdmin}
        account={account ?? null}
        accountAddress={accountAddress}
        provider={provider}
        providerLabels={providerLabels}
        listRootRef={listRootRef}
        loadMoreRef={loadMoreRef}
        selectedLabel={selectedLabel}
        onSelectFolder={handleSelectFolder}
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        onFiltersChange={setFilters}
        relevanceOrderWarning={provider === 'MICROSOFT'}
        filter={filter}
        onFilterChange={setFilter}
        isInboxLike={isInboxLike}
        // Whether the inbox is currently narrowed by search/kind.
        isFiltering={filter !== 'all' || activeSearch != null}
        activeSearch={activeSearch}
        // See `showListSpinner`: the list is only replaced when there is nothing to
        // replace, so a late source (phone especially, gated behind the support-number
        // query) merges in behind the rows instead of wiping them.
        isLoading={listSpinner}
        // Separate from the spinner: while phone has not returned its first page it
        // reports hasNextPage:false, so the sentinel would claim "You're all caught up"
        // with a whole source still in flight.
        phoneLoading={isInboxLike && !!supportNumber && phoneQuery.isLoading}
        visibleItems={visibleItems}
        emailItems={emailItems}
        emailHasNext={emailHasNext}
        emailFetchingNext={emailFetchingNext}
        anyFetchingNext={anyFetchingNext}
        allExhausted={allExhausted}
        emailNeedsReconnect={!!emailFirst?.needsReconnect}
        chatNeedsReconnect={!!chatFirst?.needsReconnect}
        chatStatus={chatFirst?.chatStatus}
        chatsFailed={!!chatQuery.error && !chatFirst}
        chatItemCount={chatItems.length}
        unreadCount={unreadCount}
        uncompletedCount={uncompletedCount}
        newEmailBanner={newEmailBanner}
        onDismissNewEmailBanner={() => setNewEmailBanner(false)}
        stateError={stateError}
        onResetStateError={resetStateErrors}
        onConnect={(prov) => void handleConnect(prov)}
        onRetryChats={() => void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] })}
        onCompose={() =>
          account &&
          openEmail({
            companyId,
            fromAddress: accountAddress,
            cloudLabel,
            signatureHtml: account.signatureHtml,
          })
        }
        supportNumber={supportNumber}
        onCall={supportNumber ? handleCall : undefined}
        onComposeSms={supportNumber ? () => setComposeSmsOpen(true) : undefined}
        onNewCall={supportNumber ? () => setDialOpen(true) : undefined}
        connecting={connecting}
        connectDismissed={connectDismissed}
        onDismissConnect={() => setConnectDismissed(true)}
        onOpenItem={handleOpenItem}
        onToggleRead={handleToggleRead}
        onToggleComplete={(target, isCompleted) => {
          if (isCompleted) uncomplete(target.kind, target.id);
          else setCompleteTarget(target);
        }}
        onBulk={runBulk}
      />
      {completeConfirm}
      {supportNumber && (
        <DialCallDialog
          open={dialOpen}
          onOpenChange={setDialOpen}
          supportNumber={supportNumber}
          onDial={handleCall}
          pending={startCallMutation.isPending}
          error={(startCallMutation.error as Error)?.message ?? null}
        />
      )}
      {supportNumber && (
        <ComposeSmsDialog
          open={composeSmsOpen}
          onOpenChange={setComposeSmsOpen}
          companyId={companyId}
          supportNumber={supportNumber}
          onSent={(peer, at) => {
            setComposeSmsOpen(false);
            // Drop straight into the conversation just started, the way sending an
            // email opens nothing but sending a chat leaves you in the thread.
            setSelected({ kind: 'sms', peer, msgId: '', msgTime: at });
          }}
        />
      )}
    </>
  );
}
