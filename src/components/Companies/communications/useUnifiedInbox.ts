import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EmailSummary, ChatInboxMessage } from '@/api/gmail';
import type { PhoneItem } from '@/api/phone';
import type { useGmailEmails } from '@/hooks/useGmailEmails';
import type { useGmailChats } from '@/hooks/useGmailChats';
import type { usePhoneTimeline } from '@/hooks/usePhoneTimeline';
import { dedupeById } from '../message-utils';
import {
  getItemTimestamp,
  type KindFilter,
  type SourceKind,
  type UnifiedItem,
} from './types';

type EmailQuery = ReturnType<typeof useGmailEmails>;
type ChatQuery = ReturnType<typeof useGmailChats>;
type PhoneQuery = ReturnType<typeof usePhoneTimeline>;

/**
 * One independently-paged stream feeding the merged inbox.
 *
 * Built INSIDE this hook rather than taken as a prop. `loadMore` is a `useCallback`
 * over these flags and the IntersectionObserver effect depends on its identity, so an
 * un-memoised array arriving from the caller would give `loadMore` a new identity every
 * render → the observer disconnects and reconnects every render → it fires on connect →
 * runaway paging. Deriving them here keeps the dependency list made of primitives.
 */
interface InboxSource {
  kind: SourceKind;
  items: UnifiedItem[];
  hasNext: boolean;
  fetchingNext: boolean;
  fetchNext: () => void;
  /** A source with nothing connected is skipped entirely rather than pinning. */
  enabled: boolean;
}

/**
 * Merges the independently-paged email, chat and phone streams into one time-ordered
 * inbox, and drives the pagination that keeps it honest.
 *
 * Three separate mechanisms live here, and they are easier to reason about
 * together than apart:
 *  1. the watermark CLAMP, so a half-loaded tail is never shown out of order;
 *  2. the scroll-sentinel observer, which advances whichever source is pinning
 *     the clamp;
 *  3. the badge-driven AUTO-FILL for the filtered folders, which pages to
 *     completion so the list matches the count on the tab.
 *
 * Written over an ARRAY of sources rather than named pairs. Calls and texts share one
 * source because they arrive from one endpoint with one cursor — see `SourceKind`.
 */
export function useUnifiedInbox({
  emailQuery,
  chatQuery,
  phoneQuery,
  phoneEnabled,
  isInboxLike,
  isFilteredFolder,
  selectedLabel,
  activeSearch,
  filter,
  targetCount,
  detailOpenKey,
}: {
  emailQuery: EmailQuery;
  chatQuery: ChatQuery;
  phoneQuery: PhoneQuery;
  /** False when the company has no support number — hides the source completely. */
  phoneEnabled: boolean;
  isInboxLike: boolean;
  /** UNREAD / UNCOMPLETED — the clamp is relaxed and auto-fill runs. */
  isFilteredFolder: boolean;
  selectedLabel: string;
  activeSearch: string | undefined;
  filter: KindFilter;
  /** The badge total to page towards in a filtered folder. */
  targetCount: number | undefined;
  /**
   * Identifies the open message/thread. Not used for filtering — it re-arms the
   * scroll observer, whose sentinel node unmounts with the list while a detail view
   * is open and is a different element when the user comes back.
   */
  detailOpenKey: string | null;
}) {
  // Flattened, de-duped items across all loaded pages.
  const emailItems: EmailSummary[] = dedupeById(
    (emailQuery.data?.pages ?? []).flatMap((p) => p.messages),
  );
  const chatItems: ChatInboxMessage[] = dedupeById(
    (chatQuery.data?.pages ?? []).flatMap((p) => p.messages),
  );
  const phoneItems: PhoneItem[] = dedupeById(
    (phoneQuery.data?.pages ?? []).flatMap((p) => p.items),
  );

  const emailHasNext = emailQuery.hasNextPage;
  const emailFetchingNext = emailQuery.isFetchingNextPage;
  const chatHasNext = chatQuery.hasNextPage;
  const chatFetchingNext = chatQuery.isFetchingNextPage;
  const phoneHasNext = phoneEnabled && phoneQuery.hasNextPage;
  const phoneFetchingNext = phoneQuery.isFetchingNextPage;

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // ORDER IS LOAD-BEARING. The clamp's tie-break keeps the FIRST maximum, so email
  // first reproduces the original `emailTail >= chatTail ? 'email' : 'chat'` exactly,
  // and `loadMore`'s fallback walks the array in this order — which is what preserved
  // "walk email, then chat" when neither pins the list.
  const sources: InboxSource[] = useMemo(
    () => [
      {
        kind: 'email',
        items: emailItems.map((data) => ({ kind: 'email', data })),
        hasNext: emailHasNext,
        fetchingNext: emailFetchingNext,
        fetchNext: () => void emailQuery.fetchNextPage(),
        enabled: true,
      },
      {
        kind: 'chat',
        items: chatItems.map((data) => ({ kind: 'chat', data })),
        hasNext: chatHasNext,
        fetchingNext: chatFetchingNext,
        fetchNext: () => void chatQuery.fetchNextPage(),
        enabled: true,
      },
      {
        kind: 'phone',
        items: phoneItems.map((data) =>
          data.kind === 'call'
            ? ({ kind: 'call', data } as UnifiedItem)
            : ({ kind: 'sms', data } as UnifiedItem),
        ),
        hasNext: phoneHasNext,
        fetchingNext: phoneFetchingNext,
        fetchNext: () => void phoneQuery.fetchNextPage(),
        enabled: phoneEnabled,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      emailItems.length, chatItems.length, phoneItems.length,
      emailHasNext, chatHasNext, phoneHasNext,
      emailFetchingNext, chatFetchingNext, phoneFetchingNext,
      phoneEnabled, emailQuery, chatQuery, phoneQuery,
    ],
  );

  // Build unified sorted list for INBOX, newest first. Because the sources page
  // independently, the visible tail is clamped to a watermark — the newest
  // "oldest-loaded" boundary among sources that still have more — so the list never
  // shows a half-loaded (out-of-order) tail. `clampSource` is whichever source's tail
  // == the cutoff (the one PINNING the list); advancing it is the only way to lower
  // the cutoff and reveal more.
  const { visible: unifiedItems, hiddenCount, clampSource } = useMemo(() => {
    if (!isInboxLike)
      return { visible: [] as UnifiedItem[], hiddenCount: 0, clampSource: null as SourceKind | null };

    const active = sources.filter((s) => s.enabled);
    const merged = active
      .flatMap((s) => s.items)
      .sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a));

    // Filtered folders (UNREAD/UNCOMPLETED) intend to show EVERY matching row so the
    // list backs up the badge, so skip the clamp — it would hide already-loaded matches
    // older than the oldest-loaded chat. Chat matches are all on page 1, so showing the
    // full merged set can't drop a badge-counted item. Plain INBOX keeps the clamp.
    if (isFilteredFolder)
      return { visible: merged, hiddenCount: 0, clampSource: null as SourceKind | null };

    // True oldest-loaded timestamp of a source (arrays aren't globally sorted).
    const minTs = (arr: UnifiedItem[]) =>
      arr.length ? Math.min(...arr.map(getItemTimestamp)) : -Infinity;
    // A source that is exhausted can never reveal older rows, so it cannot pin.
    const tails = active.map((s) => ({
      kind: s.kind,
      tail: s.hasNext ? minTs(s.items) : -Infinity,
    }));
    const cutoff = tails.length
      ? Math.max(...tails.map((t) => t.tail))
      : -Infinity;
    const visible =
      cutoff === -Infinity
        ? merged
        : merged.filter((it) => getItemTimestamp(it) >= cutoff);
    // STRICT `>` keeps the FIRST maximum, which with email first in `sources`
    // reproduces the original two-source tie-break. `>=` would flip it and silently
    // change which stream advances.
    const clampSource: SourceKind | null =
      cutoff === -Infinity
        ? null
        : tails.reduce((a, b) => (b.tail > a.tail ? b : a)).kind;
    return { visible, hiddenCount: merged.length - visible.length, clampSource };
  }, [isInboxLike, isFilteredFolder, sources]);

  // Advance the PINNING source only (advancing another loads pages that stay
  // clamped out of view). Each successful page strictly lowers the cutoff, so the
  // list provably grows and the observer loop below terminates.
  const loadMore = useCallback(() => {
    const advance = (s: InboxSource | undefined): boolean => {
      if (!s?.enabled || !s.hasNext || s.fetchingNext) return false;
      s.fetchNext();
      return true;
    };
    if (!isInboxLike) {
      // The email-only folders (Sent/Spam/Trash) page email and nothing else.
      advance(sources.find((s) => s.kind === 'email'));
      return;
    }
    if (advance(sources.find((s) => s.kind === clampSource))) return;
    // Nothing pins the list, or the pinning source is mid-flight: walk the rest in
    // array order (email first, as before).
    for (const s of sources) if (advance(s)) return;
  }, [isInboxLike, clampSource, sources]);

  // Runaway guard for the auto-fill loop: the observer re-fires while the sentinel
  // stays inside rootMargin, so a bottomless pinning chat space (or a page that
  // returns only duplicates so the tail can't move) could spin. Cap per burst and
  // bail when the loaded count stalls; reset once the clamp is fully released.
  const fillGuard = useRef({ lastTotal: -1, stalls: 0, fetches: 0 });
  useEffect(() => {
    if (hiddenCount === 0) fillGuard.current = { lastTotal: -1, stalls: 0, fetches: 0 };
  }, [hiddenCount]);

  // Summed across EVERY source. Leave one out and the pages that only advance it look
  // like stalls — two of those stop the observer and that source never pages again.
  const loadedTotal = sources.reduce((n, s) => n + s.items.length, 0);
  const anyFetchingNext = sources.some((s) => s.enabled && s.fetchingNext);
  const allExhausted = !sources.some((s) => s.enabled && s.hasNext);

  // A single string over every source's paging flags. The observer effect below is
  // eslint-disabled for exhaustive-deps, so a per-source flag list would silently go
  // stale the next time a source is added — leaving the observer holding an old
  // `loadMore` that pages the wrong stream forever.
  const flagKey = sources
    .map((s) => `${s.kind}:${s.enabled}:${s.hasNext}:${s.fetchingNext}`)
    .join('|');

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
        if (loadedTotal !== g.lastTotal) {
          g.lastTotal = loadedTotal;
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
    // No eslint-disable here any more, and that is the point: this effect used to
    // suppress exhaustive-deps and name each source's two paging flags by hand, so
    // adding a source silently left it holding a stale `loadMore` that paged the
    // wrong stream forever. `flagKey` and `loadedTotal` fold every source into two
    // primitives, so the list is complete and stays complete.
  }, [isInboxLike, selectedLabel, detailOpenKey, loadMore, flagKey, loadedTotal]);

  // Apply the kind/state filter dropdown over the merged inbox. Search itself is
  // already applied server-side (Gmail `q` for email, text match for chat) — phone has
  // no server-side search at all, which the caller handles by not passing it one.
  const visibleItems = unifiedItems.filter((it) => {
    if (filter !== 'all' && it.kind !== filter) return false;
    // Tab-forced state filter: UNCOMPLETED hides completed, UNREAD hides read.
    if (selectedLabel === 'UNCOMPLETED' && it.data.isCompleted) return false;
    if (selectedLabel === 'UNREAD' && it.data.isRead) return false;
    return true;
  });

  // Filtered folders show EVERY matching row so the list backs up the badge count.
  // Count matches across the whole loaded set (ignore the kind dropdown — the badge
  // counts every channel regardless) and auto-load pages until we reach the total.
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
    if (anyFetchingNext) return; // wait for the in-flight page
    if (allExhausted) return;
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
    // Prioritise email (the diverging source); fall through to the rest in order.
    for (const s of sources) {
      if (s.enabled && s.hasNext && !s.fetchingNext) {
        s.fetchNext();
        return;
      }
    }
  }, [
    isFilteredFolder,
    activeSearch,
    targetCount,
    matchedCount,
    anyFetchingNext,
    allExhausted,
    sources,
  ]);

  return {
    emailItems,
    chatItems,
    phoneItems,
    visibleItems,
    loadMoreRef,
    emailHasNext,
    emailFetchingNext,
    anyFetchingNext,
    allExhausted,
  };
}
