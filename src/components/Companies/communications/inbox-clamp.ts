/**
 * The watermark clamp — the rule that keeps a multi-source inbox in true time order
 * while its sources are still loading.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────────
 * Each source pages independently, so at any moment they have loaded back to DIFFERENT
 * points in time. Naively concatenating and sorting produces a list that is correct at
 * the top and wrong at the bottom: below the shallowest source's oldest loaded row, its
 * rows are simply missing, so a deeper source's older rows appear where they do not
 * belong. Scrolling then makes rows APPEAR ABOVE ones already on screen.
 *
 * So the visible list is cut at the newest "oldest-loaded" boundary among the sources
 * that still have more to give. `clampSource` names the one PINNING the list — the only
 * one whose next page can lower the cutoff and reveal anything.
 *
 * Extracted from `useUnifiedInbox`, which now calls it, so the company inbox's unchanged
 * behaviour is this function's regression proof. The internal workspace inbox merges two
 * of its own sources through the same function rather than a second copy of the rule.
 *
 * ⚠️ Two details are load-bearing and must not be "tidied":
 *  - An EXHAUSTED source pins with `-Infinity`. It can never reveal an older row, so
 *    letting its tail into the max would clamp the list at a boundary nothing can move.
 *  - The tie-break `reduce` uses STRICT `>`, which keeps the FIRST maximum. Source order
 *    is therefore meaningful: for the company inbox, email first reproduces the original
 *    two-source `emailTail >= chatTail` behaviour exactly. `>=` would flip it and
 *    silently change which stream advances.
 */
export interface ClampableSource<K extends string, T> {
  kind: K;
  items: T[];
  /** More pages exist. Only a source with more can pin the list. */
  hasNext: boolean;
  /** A source with nothing connected is skipped entirely rather than pinning. */
  enabled: boolean;
}

export interface ClampResult<K extends string, T> {
  /** Time-ordered, newest first, cut at the watermark. */
  visible: T[];
  /** Loaded rows the cutoff is withholding — 0 when nothing pins. */
  hiddenCount: number;
  /** Whose next page would lower the cutoff, or null when nothing pins. */
  clampSource: K | null;
}

export function clampSources<K extends string, T>(
  sources: ClampableSource<K, T>[],
  tsOf: (item: T) => number,
): ClampResult<K, T> {
  const active = sources.filter((s) => s.enabled);

  // Timestamp ONCE per item, then sort on the number. A comparator that called `tsOf` on
  // both operands would re-parse two date strings for every one of the ~n log n
  // comparisons; the same numbers are reused by the tail scan and the cutoff filter.
  const stamped = active.flatMap((s) =>
    s.items.map((item) => ({ ts: tsOf(item), item })),
  );
  stamped.sort((a, b) => b.ts - a.ts);
  const merged = stamped.map((e) => e.item);

  // True oldest-loaded timestamp of a source — its array is not globally sorted. A fold
  // rather than `Math.min(...spread)`: same answer, no argument-count ceiling.
  const minTs = (arr: T[]) => {
    let min = Infinity;
    for (const it of arr) {
      const ts = tsOf(it);
      if (ts < min) min = ts;
    }
    return arr.length ? min : -Infinity;
  };

  const tails = active.map((s) => ({
    kind: s.kind,
    tail: s.hasNext ? minTs(s.items) : -Infinity,
  }));
  const cutoff = tails.length ? Math.max(...tails.map((t) => t.tail)) : -Infinity;

  if (cutoff === -Infinity) {
    return { visible: merged, hiddenCount: 0, clampSource: null };
  }

  const visible = stamped.filter((e) => e.ts >= cutoff).map((e) => e.item);
  return {
    visible,
    hiddenCount: merged.length - visible.length,
    // STRICT `>` keeps the FIRST maximum — see the warning above.
    clampSource: tails.reduce((a, b) => (b.tail > a.tail ? b : a)).kind,
  };
}
