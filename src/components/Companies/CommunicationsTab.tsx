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
import { fetchAuthUrl } from '@/api/gmail';
import type { EmailProvider } from '@/api/gmail';
import { useAttachmentViewer } from './AttachmentViewerContext';
import { CompleteConfirmDialog } from './CompleteConfirmDialog';
import { ChatThreadView } from './communications/ChatThreadView';
import { ConnectAccountPanel } from './communications/ConnectAccountPanel';
import { EmailThreadView } from './communications/EmailThreadView';
import { InboxView } from './communications/InboxView';
import { usePersistCommUi, useRestoredCommUi } from './communications/useCommUiState';
import { useListScrollRestore } from './communications/useListScrollRestore';
import { useUnifiedInbox } from './communications/useUnifiedInbox';
import {
  ALL_LABELS, FOLDERS, INBOX_TABS,
  type CompleteTarget, type KindFilter, type UnifiedItem,
} from './communications/types';

interface Props {
  companyId: number;
  isAdmin: boolean;
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
export function CommunicationsTab({ companyId, isAdmin, active }: Props) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { notifyPush } = useNotifications();
  const { openEmail } = useComposer();

  const [connecting, setConnecting] = useState(false);
  const [newEmailBanner, setNewEmailBanner] = useState(false);
  // The message awaiting "mark complete" confirmation (carries kind so the right
  // endpoint is hit). null = no confirm dialog open.
  const [completeTarget, setCompleteTarget] = useState<CompleteTarget | null>(null);

  // ── Which message / folder is open (the restore point) ─────────────────────
  const restored = useRestoredCommUi(companyId);

  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(restored.selectedMsgId ?? null);
  // Conversation id of the opened email, captured from the clicked list row so the
  // whole thread loads in one request. Falls back to the opened message's own
  // threadId when restored from storage (where only the message id is persisted).
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(restored.selectedSpaceId ?? null);
  // The clicked chat message — its createTime freezes the thread at that moment,
  // and its id is the per-message read/unread target for the open thread.
  const [openedChatMsgId, setOpenedChatMsgId] = useState<string | null>(restored.openedChatMsgId ?? null);
  const [openedChatMsgTime, setOpenedChatMsgTime] = useState<string | null>(restored.openedChatMsgTime ?? null);
  const [selectedLabel, setSelectedLabel] = useState<string>(
    ALL_LABELS.includes(restored.selectedLabel ?? '') ? restored.selectedLabel! : 'INBOX',
  );
  // Gates the "Mark as unread" button. Opening an email always marks it read, so a
  // restored open email is read by definition — otherwise the button would silently
  // go missing from the toolbar after a reload. (Not worth persisting on its own.)
  const [selectedMsgIsRead, setSelectedMsgIsRead] = useState(!!restored.selectedMsgId);
  // Inbox search + filter. `searchInput` is the raw box; `searchQuery` is the
  // debounced/committed term sent to the server. `filter` narrows by kind/state.
  const [searchInput, setSearchInput] = useState(restored.searchInput ?? '');
  // Seeded from the restored term too — otherwise the debounce below would render
  // one unfiltered frame before catching up.
  const [searchQuery, setSearchQuery] = useState((restored.searchInput ?? '').trim());
  const [filter, setFilter] = useState<KindFilter>(restored.filter ?? 'all');
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  usePersistCommUi(companyId, {
    selectedLabel,
    selectedMsgId,
    selectedSpaceId,
    openedChatMsgId,
    openedChatMsgTime,
    filter,
    searchInput,
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
  const emailQuery = useGmailEmails(companyId, emailLabel, activeSearch, active && !!account);
  const chatQuery = useGmailChats(
    companyId,
    account,
    isInboxLike ? activeSearch : undefined,
    active && chatSupported,
  );

  const { data: unreadData } = useGmailUnreadCount(companyId, account);
  const { data: uncompletedData } = useGmailUncompletedCount(companyId, account);

  const {
    emailItems, chatItems, visibleItems, loadMoreRef,
    emailHasNext, chatHasNext, emailFetchingNext, chatFetchingNext,
  } = useUnifiedInbox({
    emailQuery,
    chatQuery,
    isInboxLike,
    isFilteredFolder,
    selectedLabel,
    activeSearch,
    filter,
    targetCount:
      selectedLabel === 'UNREAD'
        ? unreadData?.count
        : selectedLabel === 'UNCOMPLETED'
          ? uncompletedData?.count
          : undefined,
    selectedMsgId,
    selectedSpaceId,
  });

  const { listRootRef, saveListScroll } = useListScrollRestore({
    active,
    listOpen: !selectedMsgId && !selectedSpaceId,
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
          notifyPush({
            source: `company:${companyId}`,
            title: 'New email',
            body: account?.emailAddress ?? account?.gmailAddress ?? 'New message',
            tag: `cyg-company-${companyId}`,
          });
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [active, account, companyId, token, qc, provider, notifyPush]);

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
  const closeEmail = () => setSelectedMsgId(null);

  const closeChat = () => {
    setSelectedSpaceId(null);
    setOpenedChatMsgId(null);
    setOpenedChatMsgTime(null);
  };

  const handleOpenItem = (item: UnifiedItem) => {
    saveListScroll();
    if (item.kind === 'email') {
      const msg = item.data;
      if (!msg.isRead) markReadMutation.mutate(msg.id);
      setSelectedMsgId(msg.id);
      setSelectedThreadId(msg.threadId || null);
      setSelectedMsgIsRead(true); // always read after opening (auto-marked or was already read)
      setSelectedSpaceId(null);
    } else {
      const msg = item.data;
      if (!msg.isRead) markChatReadMutation.mutate(msg.id); // mark THIS message read, not the whole space
      setSelectedSpaceId(msg.spaceId);
      setOpenedChatMsgId(msg.id);
      setOpenedChatMsgTime(msg.createTime); // anchor: messages after this are dimmed
      setSelectedMsgId(null);
    }
  };

  const handleToggleRead = (item: UnifiedItem) => {
    const { isRead, id } = item.data;
    if (item.kind === 'email') {
      (isRead ? markUnreadMutation : markReadMutation).mutate(id);
    } else {
      (isRead ? markChatUnreadMutation : markChatReadMutation).mutate(id);
    }
  };

  // Marking complete asks for confirmation first; un-completing is a direct toggle.
  const uncomplete = (kind: 'email' | 'chat', id: string) => {
    if (kind === 'email') markEmailUncompleteMutation.mutate(id);
    else markChatUncompleteMutation.mutate(id);
  };

  const confirmComplete = () => {
    if (!completeTarget) return;
    const { kind, id, fromDetail } = completeTarget;
    if (kind === 'email') markEmailCompleteMutation.mutate(id);
    else markChatCompleteMutation.mutate(id);
    setCompleteTarget(null);
    // If confirmed from inside an open message, also exit back to the inbox
    // (so we don't re-prompt on the row).
    if (fromDetail) {
      if (kind === 'chat') closeChat();
      else closeEmail();
    }
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
    for (const it of items) {
      const email = it.kind === 'email';
      if (action === 'read') (email ? markReadMutation : markChatReadMutation).mutate(it.data.id);
      else if (action === 'unread') (email ? markUnreadMutation : markChatUnreadMutation).mutate(it.data.id);
      else if (action === 'complete') (email ? markEmailCompleteMutation : markChatCompleteMutation).mutate(it.data.id);
      else if (action === 'uncomplete') (email ? markEmailUncompleteMutation : markChatUncompleteMutation).mutate(it.data.id);
    }
  };

  const handleSelectFolder = (folderId: string) => {
    setSelectedLabel(folderId);
    setSelectedMsgId(null);
    setSelectedSpaceId(null);
    // Drop the term rather than carry it into the new folder. Clear the debounced
    // value too, or it drives the new folder's query for another 350ms.
    setSearchInput('');
    setSearchQuery('');
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
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!account) {
    return (
      <ConnectAccountPanel
        isAdmin={isAdmin}
        connecting={connecting}
        onConnect={(prov, kind) => void handleConnect(prov, kind)}
      />
    );
  }

  // ── Chat conversation view ────────────────────────────────────────────────

  if (selectedSpaceId) {
    return (
      <>
        <ChatThreadView
          companyId={companyId}
          token={token}
          isAdmin={isAdmin}
          account={account}
          provider={provider}
          providerLabels={providerLabels}
          connecting={connecting}
          onConnect={(prov) => void handleConnect(prov)}
          spaceId={selectedSpaceId}
          openedChatMsgId={openedChatMsgId}
          openedChatMsgTime={openedChatMsgTime}
          inboxRow={chatItems.find((m) => m.id === openedChatMsgId) ?? null}
          active={active}
          pollEnabled={active && !viewerItem}
          onClose={closeChat}
          onAnchorChange={(m) => {
            setOpenedChatMsgId(m.id);
            setOpenedChatMsgTime(m.createTime);
          }}
          onRequestComplete={setCompleteTarget}
          onUncomplete={uncomplete}
        />
        {completeConfirm}
      </>
    );
  }

  // ── Email detail view ─────────────────────────────────────────────────────

  if (selectedMsgId) {
    return (
      <>
        <EmailThreadView
          companyId={companyId}
          token={token}
          account={account}
          accountAddress={accountAddress}
          provider={provider}
          active={active}
          pollEnabled={active && !viewerItem}
          selectedMsgId={selectedMsgId}
          selectedThreadId={selectedThreadId}
          selectedMsgIsRead={selectedMsgIsRead}
          inboxIsCompleted={emailItems.find((m) => m.id === selectedMsgId)?.isCompleted ?? false}
          cloudLabel={cloudLabel}
          onAnchorChange={setSelectedMsgId}
          onClose={closeEmail}
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

  return (
    <>
      <InboxView
        companyId={companyId}
        token={token}
        isAdmin={isAdmin}
        account={account}
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
        filter={filter}
        onFilterChange={setFilter}
        isInboxLike={isInboxLike}
        // Whether the inbox is currently narrowed by search/kind.
        isFiltering={filter !== 'all' || activeSearch != null}
        activeSearch={activeSearch}
        isLoading={isInboxLike ? (emailQuery.isLoading || chatQuery.isLoading) : emailQuery.isLoading}
        visibleItems={visibleItems}
        emailItems={emailItems}
        emailHasNext={emailHasNext}
        chatHasNext={chatHasNext}
        emailFetchingNext={emailFetchingNext}
        chatFetchingNext={chatFetchingNext}
        emailNeedsReconnect={!!emailFirst?.needsReconnect}
        chatNeedsReconnect={!!chatFirst?.needsReconnect}
        chatStatus={chatFirst?.chatStatus}
        chatsFailed={!!chatQuery.error && !chatFirst}
        chatItemCount={chatItems.length}
        unreadCount={unreadData?.count ?? 0}
        uncompletedCount={uncompletedData?.count ?? 0}
        newEmailBanner={newEmailBanner}
        onDismissNewEmailBanner={() => setNewEmailBanner(false)}
        stateError={stateError}
        onResetStateError={resetStateErrors}
        onConnect={(prov) => void handleConnect(prov)}
        onRetryChats={() => void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] })}
        onCompose={() =>
          openEmail({
            companyId,
            fromAddress: accountAddress,
            cloudLabel,
            signatureHtml: account.signatureHtml,
          })
        }
        onOpenItem={handleOpenItem}
        onToggleRead={handleToggleRead}
        onToggleComplete={(target, isCompleted) => {
          if (isCompleted) uncomplete(target.kind, target.id);
          else setCompleteTarget(target);
        }}
        onBulk={runBulk}
      />
      {completeConfirm}
    </>
  );
}
