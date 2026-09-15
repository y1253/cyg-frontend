/**
 * The red number over the CYG logo in the browser tab — unread missed calls, shown only
 * while the tab is in the background (see `useTabMissedCallBadge`).
 */

/** The logo `index.html` declares. Restored whenever there is nothing to badge. */
export const FAVICON_HREF = '/cyg-favicon.png';

/**
 * The text drawn in the badge, or null for "no badge".
 *
 * Capped at "9+": a tab icon renders at 16px, where a third glyph is unreadable, and
 * past nine the exact number stops changing what anybody does.
 */
export function badgeLabel(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count < 1) return null;
  return count > 9 ? '9+' : String(Math.floor(count));
}

const BADGE_RED = '#EF4444'; // Tailwind red-500, the same red as the folder badges
const SIZE = 64;

/**
 * The logo with a red badge in its top-right corner, as a PNG data URL — or null if the
 * canvas is unavailable, in which case the caller leaves the plain logo alone.
 *
 * The logo is same-origin, so drawing it does not taint the canvas and `toDataURL` works.
 * Drawn at 64px rather than 16: the browser downsamples, which keeps the digit crisp on
 * high-DPI screens where the tab icon is really 32px.
 */
export function drawBadgedFavicon(
  logo: HTMLImageElement,
  label: string,
): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(logo, 0, 0, SIZE, SIZE);

    // Large on purpose: at 16px anything smaller than ~60% of the icon is a red speck.
    const radius = label.length > 1 ? 22 : 20;
    const cx = SIZE - radius;
    const cy = radius;

    // A white ring first, so the badge separates from the logo behind it.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    ctx.fillStyle = BADGE_RED;
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${label.length > 1 ? 22 : 28}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
