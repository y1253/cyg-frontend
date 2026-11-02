/**
 * step11.md (2026-11-02): how a viewer lays out an agent's live tabs — all the same size
 * ("equal"), or one big with the others beside it ("big"), the split between them
 * dragged by the viewer. Kept per viewer and per agent in localStorage.
 */
export type LiveLayoutMode = 'equal' | 'big';

export interface LiveLayout {
  mode: LiveLayoutMode;
  /** The tab shown big (its pageId), in "big" mode. */
  bigId: number | null;
  /** The big tab's share of the width, in percent. */
  split: number;
}

export const SPLIT_MIN = 45;
export const SPLIT_MAX = 85;
export const SPLIT_DEFAULT = 66;

export const DEFAULT_LAYOUT: LiveLayout = {
  mode: 'equal',
  bigId: null,
  split: SPLIT_DEFAULT,
};

export function clampSplit(n: number): number {
  if (!Number.isFinite(n)) return SPLIT_DEFAULT;
  return Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n)));
}

/** The split at a pointer position over the row (`left` / `width` of the row box). */
export function splitAt(clientX: number, left: number, width: number): number {
  if (width <= 0) return SPLIT_DEFAULT;
  return clampSplit(((clientX - left) / width) * 100);
}

/** A stored layout, or the default — never throws on what a browser kept. */
export function parseLayout(raw: string | null): LiveLayout {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const v = JSON.parse(raw) as Partial<LiveLayout> | null;
    if (!v || typeof v !== 'object') return DEFAULT_LAYOUT;
    return {
      mode: v.mode === 'big' ? 'big' : 'equal',
      bigId: typeof v.bigId === 'number' && Number.isInteger(v.bigId) ? v.bigId : null,
      split: clampSplit(typeof v.split === 'number' ? v.split : SPLIT_DEFAULT),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export const layoutKey = (agentId: number) => `agent-live-layout-${agentId}`;
