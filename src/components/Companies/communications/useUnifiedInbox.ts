import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EmailSummary, ChatInboxMessage } from '@/api/gmail';
import type { useGmailEmails } from '@/hooks/useGmailEmails';
import type { useGmailChats } from '@/hooks/useGmailChats';
import { dedupeById } from '../message-utils';
import { getItemTimestamp, type KindFilter, type UnifiedItem } from './types';

type EmailQuery = ReturnType<typeof useGmailEmails>;
type ChatQuery = ReturnType<typeof useGmailChats>;

/**
 * Merges the independently-paged email and chat streams into one time-ordered
 * inbox, and drives the pagination that keeps it honest.
 *
 * Three separate mechanisms live here, and they are easier to reason about
 * together than apart:
 *  1. the watermark CLAMP, so a half-loaded tail is never shown out of order;
 *  2. the scroll-sentinel observer, which advances whichever source is pinning
 *     the clamp;
 *  3. the badge-driven AUTO-FILL for the filtered folders, which pages to
 *     completion so the list matches the count on the tab.
 */
export function useUnifiedInbox({
  emailQuery,
  chatQuery,
  isInboxLike,
  isFilteredFolder,
  selectedLabel,
  activeSearch,
  filter,
  targetCount,
  selectedMsgId,
  selectedSpaceId,
}: {
  emailQuery: EmailQuery;
  chatQuery: ChatQuery;
  isInboxLike: boolean;
  /** UNREAD / UNCOMPLETED — the clamp is relaxed and auto-fill runs. */
  isFilteredFolder: boolean;
  selectedLabel: string;
  activeSearch: string | undefined;
  filter: KindFilter;
  /** The badge total to page towards in a filtered folder. */
  targetCount: number | undefined;
  /**
   * The open message/space. Not used for filtering — they re-arm the scroll
   * observer, whose sentinel node unmounts with the list while a detail view is
   * open and is a different element when the user comes back.
   */
  selectedMsgId: string | null;
  selectedSpaceId: string | null;
}) {
  // Flattened, de-duped items across all loaded pages.
  const emailItems: EmailSummary[] = dedupeById(
    (emailQuery.data?.pages ?? []).flatMap((p) => p.messages),
  );
  const chatItems: ChatInboxMessage[] = dedupeById(
    (chatQuery.data?.pages ?? []).flatMap((p) => p.messages),
  );

  const emailHasNext = emailQuery.hasNextPage;
  const emailFetchingNext = emailQuery.isFetchingNextPage;
  const chatHasNext = chatQuery.hasNextPage;
  const chatFetchingNext = chatQuery.isFetchingNextPage;

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Build unified sorted list for INBOX (emails + one row per incoming chat msg),
  // newest first. Because emails and chats page independently, the visible tail is
  // clamped to a watermark — the newest "oldest-loaded" boundary among sources that
  // still have more — so the list never shows a half-loaded (out-of-order) tail.
  // `clampSource` is whichever source's tail == the cutoff (the one PINNING the
  // list); advancing it is the only way to lower the cutoff and reveal more.
  const { visible: unifiedItems, hiddenCount, clampSource } = useMemo(() => {
    if (!isInboxLike)
      return { visible: [] as UnifiedItem[], hiddenCount: 0, clampSource: null as 'email' | 'chat' | null };
    const emailUnified = emailItems.map((e): UnifiedItem => ({ kind: 'email', data: e }));
    const chatUnified = chatItems.map((c): UnifiedItem => ({ kind: 'chat', data: c }));
    const merged = [...emailUnified, ...chatUnified].sort(
      (a, b) => getItemTimestamp(b) - getItemTimestamp(a),
    );

    // Filtered folders (UNREAD/UNCOMPLETED) intend to show EVERY matching row so the
    // list backs up the badge, so skip the clamp — it would hide already-loaded matches
    // older than the oldest-loaded chat. Chat matches are all on page 1, so showing the
    // full merged set can't drop a badge-counted item. Plain INBOX keeps the clamp.
    if (isFilteredFolder)
      return { visible: merged, hiddenCount: 0, clampSource: null as 'email' | 'chat' | null };

    // True oldest-loaded timestamp of a source (arrays aren't globally sorted).
    const minTs = (arr: UnifiedItem[]) =>
      arr.length ? Math.min(...arr.map(getItemTimestamp)) : -Infinity;
    const emailTail = emailQuery.hasNextPage ? minTs(emailUnified) : -Infinity;
    const chatTail = chatQuery.hasNextPage ? minTs(chatUnified) : -Infinity;
    const cutoff = Math.max(emailTail, chatTail);
    const visible =
      cutoff === -Infinity
        ? merged
        : merged.filter((it) => getItemTimestamp(it) >= cutoff);
    const clampSource: 'email' | 'chat' | null =
      cutoff === -Infinity ? null : emailTail >= chatTail ? 'email' : 'chat';
    return { visible, hiddenCount: merged.length - visible.length, clampSource };
  }, [isInboxLike, isFilteredFolder, emailItems, chatItems, emailQuery.hasNextPage, chatQuery.hasNextPage]);

  // Advance the PINNING source only (advancing the other loads pages that stay
  // clamped out of view). Each successful page strictly lowers the cutoff, so the
  // list provably grows and the observer loop below terminates.
  const loadMore = useCallback(() => {
    if (!isInboxLike) {
      if (emailHasNext && !emailFetchingNext) void emailQuery.fetchNextPage();
      return;
    }
    if (clampSource === 'chat') {
      if (chatHasNext && !chatFetchingNext) void chatQuery.fetchNextPage();
    } else {
      // 'email' or null (the other side is exhausted) — walk email, then chat.
      if (emailHasNext && !emailFetchingNext) void emailQuery.fetchNextPage();
      else if (chatHasNext && !chatFetchingNext) void chatQuery.fetchNextPage();
    }
  }, [
    isInboxLike,
    clampSource,
    emailHasNext,
    emailFetchingNext,
    chatHasNext,
    chatFetchingNext,
    emailQuery,
    chatQuery,
  ]);

  // Runaway guard for the auto-fill loop: the observer re-fires while the sentinel
  // stays inside rootMargin, so a bottomless pinning chat space (or a page that
  // returns only duplicates so the tail can't move) could spin. Cap per burst and
  // bail when the loaded count stalls; reset once the clamp is fully released.
  const fillGuard = useRef({ lastTotal: -1, stalls: 0, fetches: 0 });
  useEffect(() => {
    if (hiddenCount === 0) fillGuard.current = { lastTotal: -1, stalls: 0, fetches: 0 };
  }, [hiddenCount]);

  // Infinite scroll: when the bottom sentinel nears the scroll container, load the
  // next (older) page of the pinning source. `rootMargin` prefetches slightly early.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const root = el.closest('.overflow-y-auto') as HTMLElement | null;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        const g = fillGuard.current;
        const total = emailItems.length + chatItems.length;
        if (total !== g.lastTotal) {
          g.lastTotal = total;
          g.stalls = 0;
        } else {
          g.stalls++;
        }
        if (g.stalls >= 2) return; // pages returned no new rows (overlap) — stop
        if (g.fetches >= 12) return; // per-burst cap
        g.fetches++;
        loadMore();
      },
      { root, rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isInboxLike,
    selectedLabel,
    selectedMsgId,
    selectedSpaceId,
    loadMore,
    emailHasNext,
    emailFetchingNext,
    chatHasNext,
    chatFetchingNext,
  ]);

  // Apply the kind/state filter dropdown over the merged inbox. Search itself is
  // already applied server-side (Gmail `q` for email, text match for chat).
  const visibleItems = unifiedItems.filter((it) => {
    if (filter === 'email' && it.kind !== 'email') return false;
    if (filter === 'chat' && it.kind !== 'chat') return false;
    // Tab-forced state filter: UNCOMPLETED hides completed, UNREAD hides read.
    if (selectedLabel === 'UNCOMPLETED' && it.data.isCompleted) return false;
    if (selectedLabel === 'UNREAD' && it.data.isRead) return false;
    return true;
  });

  // Filtered folders show EVERY matching row so the list backs up the badge count.
  // Count matches across the whole loaded set (ignore the kind dropdown — the badge
  // counts email+chat regardless) and auto-load pages until we reach the badge total.
  const matchedCount = unifiedItems.filter((it) =>
    selectedLabel === 'UNREAD'
      ? !it.data.isRead
      : selectedLabel === 'UNCOMPLETED'
        ? !it.data.isCompleted
        : false,
  ).length;

  // Drive pagination to completion so the user never has to scroll to make the list
  // match the badge. Runs only in a filtered folder with no active search (the badge
  // counts the whole folder, not the search subset, so it isn't a valid stop target).
  // Own runaway guard (mirrors fillGuard): stop on target met, sources exhausted,
  // matches stalled for 2 rounds, or a hard page cap. Reset on folder/search change.
  const autoFillGuard = useRef({ fetches: 0, lastMatched: -1, stalls: 0 });
  useEffect(() => {
    autoFillGuard.current = { fetches: 0, lastMatched: -1, stalls: 0 };
  }, [selectedLabel, activeSearch]);
  useEffect(() => {
    if (!isFilteredFolder || activeSearch) return;
    if (targetCount == null || matchedCount >= targetCount) return;
    if (emailFetchingNext || chatFetchingNext) return; // wait for the in-flight page
    if (!emailHasNext && !chatHasNext) return;
    const g = autoFillGuard.current;
    // Only settled rounds reach here, so an unchanged count means the last page
    // yielded no new matches — two such rounds and we stop (badge may over-count).
    if (matchedCount === g.lastMatched) g.stalls++;
    else {
      g.lastMatched = matchedCount;
      g.stalls = 0;
    }
    if (g.stalls >= 2) return;
    if (g.fetches >= 20) return; // hard page cap
    g.fetches++;
    // Prioritise email (the diverging source); fall back to chat once it's exhausted.
    if (emailHasNext) void emailQuery.fetchNextPage();
    else void chatQuery.fetchNextPage();
  }, [
    isFilteredFolder,
    activeSearch,
    targetCount,
    matchedCount,
    emailHasNext,
    emailFetchingNext,
    chatHasNext,
    chatFetchingNext,
    emailQuery,
    chatQuery,
  ]);

  return {
    emailItems,
    chatItems,
    visibleItems,
    loadMoreRef,
    emailHasNext,
    chatHasNext,
    emailFetchingNext,
    chatFetchingNext,
  };
}
