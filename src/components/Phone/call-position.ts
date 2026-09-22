import type { ComposerPos } from '@/components/Companies/composer-layout';

/**
 * Where the agent last dragged the call card to.
 *
 * ── WHY A MODULE STORE AND NOT COMPONENT STATE ────────────────────────────────
 * The overlay is mounted through a portal by `SoftphoneProvider` and survives navigation
 * for the whole call — but it is re-created on every page load, and it has no per-call
 * identity to key a position on the way `DockedComposer` keys one per draft. So the
 * position belongs to the BROWSER, not to a call: drag the card out of the way once, and
 * it stays out of the way for the next call too.
 *
 * `null` means "not dragged" and renders the default centred card, which is what keeps
 * the untouched appearance byte-identical to before dragging existed.
 */
const KEY = 'cyg-call-card-pos';

export function readCallPos(): ComposerPos | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ComposerPos>;
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    // A private window, cleared site data, or a half-written value. The card simply
    // renders where it always did.
    return null;
  }
}

export function writeCallPos(pos: ComposerPos | null): void {
  try {
    if (pos === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(pos));
  } catch {
    // Position is a convenience; losing it must never break a call.
  }
}
