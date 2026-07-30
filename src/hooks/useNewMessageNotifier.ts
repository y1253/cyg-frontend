import { useEffect, useRef } from 'react';
import { useCompanies } from '@/hooks/useCompanies';
import { useGmailUncompletedCounts } from '@/hooks/useGmailUncompletedCounts';
import { useInternalUnreadCount } from '@/hooks/useInternalUncompletedCount';

/**
 * Detects new email / Google Chat / Outlook messages anywhere in the app by watching
 * the unified uncompleted-count map for a rise.
 *
 * This is the only cross-company signal that exists: the Gmail push stream is
 * per-company (so it only covers the company page you happen to have open), and
 * Google Chat and Outlook have no stream at all — the server only learns of a chat
 * message when someone asks it. Latency is therefore bounded by the server's 60s
 * per-company count cache, not by the poll interval.
 */
export interface RisenCompany {
  id: number;
  name: string | null;
}

export function useNewMessageNotifier({
  onCompaniesRose,
  onInternalUnreadRose,
  isSuppressed,
  onInternalWorkspaceId,
}: {
  /** Fires once per poll response, with every company whose count went up. */
  onCompaniesRose: (companies: RisenCompany[]) => void;
  /** Fallback for internal messages when the SSE stream is down. */
  onInternalUnreadRose: () => void;
  /** True while a push event has already covered this source (see NotificationContext). */
  isSuppressed: (source: string) => boolean;
  /** Reports the caller's own workspace id, so notifications can deep-link to it. */
  onInternalWorkspaceId: (id: number | null) => void;
}) {
  const counts = useGmailUncompletedCounts();
  const internalUnread = useInternalUnreadCount();
  const companies = useCompanies();

  // Anything cached from before this mount belongs to a previous session — possibly
  // a different user, since logout does not clear the query cache. Baselining off it
  // would fire a phantom notification on the first real fetch. Stamped in an effect
  // (not at render time) so the hook stays pure; effects run in declaration order,
  // so it is always set before the diff effects below read it.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const internalCompanyId = companies.data?.find((c) => c.isInternal)?.id;
  // Read names through a ref so the diff effect doesn't re-run (and re-notify)
  // just because the company list refetched.
  const companiesRef = useRef(companies.data);
  useEffect(() => {
    companiesRef.current = companies.data;
  }, [companies.data]);

  useEffect(() => {
    onInternalWorkspaceId(internalCompanyId ?? null);
  }, [internalCompanyId, onInternalWorkspaceId]);

  const baselineRef = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const data = counts.data;
    if (!data) return;
    if (counts.dataUpdatedAt < mountedAt.current) return;

    const previous = baselineRef.current;
    // Merged, not rebuilt: the server omits any company whose count computation
    // threw, and a company flapping out and back in must not read as a rise.
    const next = new Map(previous ?? []);
    const rose: number[] = [];

    for (const [key, value] of Object.entries(data)) {
      const before = previous?.get(key);
      next.set(key, value);
      // The caller's internal workspace is folded into this same map server-side.
      // It has its own instant path, so counting it here would notify twice.
      if (internalCompanyId != null && Number(key) === internalCompanyId) continue;
      if (previous && before !== undefined && value > before) {
        rose.push(Number(key));
      }
    }

    baselineRef.current = next;
    // First observation only establishes the baseline.
    if (!previous || rose.length === 0) return;

    const unsuppressed = rose.filter((id) => !isSuppressed(`company:${id}`));
    if (unsuppressed.length === 0) return;

    onCompaniesRose(
      unsuppressed.map((id) => ({
        id,
        name: companiesRef.current?.find((c) => c.id === id)?.businessName ?? null,
      })),
    );
  }, [
    counts.data,
    counts.dataUpdatedAt,
    internalCompanyId,
    onCompaniesRose,
    isSuppressed,
  ]);

  const internalBaselineRef = useRef<number | null>(null);
  useEffect(() => {
    const count = internalUnread.data?.count;
    if (count === undefined) return;
    if (internalUnread.dataUpdatedAt < mountedAt.current) return;

    const previous = internalBaselineRef.current;
    internalBaselineRef.current = count;
    if (previous === null || count <= previous) return;
    if (isSuppressed('internal')) return;

    onInternalUnreadRose();
  }, [
    internalUnread.data?.count,
    internalUnread.dataUpdatedAt,
    onInternalUnreadRose,
    isSuppressed,
  ]);
}
