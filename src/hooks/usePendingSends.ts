import { useCallback, useEffect, useRef, useState } from 'react';
import {
  newPendingId,
  type PendingMeta,
} from '@/components/Companies/communications/pending-sends';

/**
 * The messages this view is still uploading.
 *
 * Owned by the thread component rather than a module store, deliberately: the thread is
 * where somebody watches a send, and component ownership means unmount revokes every
 * object URL with no sweep and no TTL to maintain. The trade is that closing the thread
 * mid-send throws the row away and the send finishes invisibly — acceptable, and the
 * upgrade path (a module store with TTL eviction, the `unreadFeedDismiss` shape) is only
 * worth taking if "send and navigate away" becomes a real requirement.
 */
export interface PendingSend<T> {
  row: T & PendingMeta & { id: string };
  /** Kept so Retry re-runs the same send rather than asking for the files again. */
  files: File[];
}

export function usePendingSends<T extends { id: string }>() {
  const [pending, setPending] = useState<PendingSend<T>[]>([]);
  // Every object URL this hook has minted, so unmount can revoke them all — including
  // those belonging to rows already dropped.
  const urls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    },
    [],
  );

  /** Mint previews for the local files. Safe with none. */
  const previewsFor = useCallback((files: File[]): string[] => {
    const made = files
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => URL.createObjectURL(f));
    urls.current.push(...made);
    return made;
  }, []);

  const add = useCallback(
    (build: (id: string, previews: string[]) => T & PendingMeta, files: File[]) => {
      const id = newPendingId();
      const row = { ...build(id, previewsFor(files)), id };
      setPending((prev) => [...prev, { row, files } as PendingSend<T>]);
      return id;
    },
    [previewsFor],
  );

  /** The send failed: keep the row, mark it, and let the user retry or discard it. */
  const fail = useCallback((id: string, error: string) => {
    setPending((prev) =>
      prev.map((p) =>
        p.row.id === id
          ? { ...p, row: { ...p.row, sendState: 'failed' as const, error } }
          : p,
      ),
    );
  }, []);

  /**
   * The send succeeded (or the user discarded it): drop the row.
   *
   * ⚠️ The object URL is NOT revoked here. The server's reply for a text carries no
   * `media` — `sendSms` builds its row without the `withMedia()` pass, which only runs
   * when a thread is listed — so the picture would blank out between the send landing and
   * the next successful refetch. They are revoked on unmount instead, which is cheap:
   * a handful of URLs for the life of one open conversation.
   */
  const drop = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.row.id !== id));
  }, []);

  return { pending, add, fail, drop };
}
