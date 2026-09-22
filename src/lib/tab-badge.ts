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

/**
 * The logo with a plain coloured dot, no text — for a state with nothing to count.
 *
 * Same geometry as `drawBadgedFavicon` so the two read as one family when they alternate,
 * and the same white ring, which is what keeps either visible against a dark tab strip.
 */
export function drawDotFavicon(
  logo: HTMLImageElement,
  color: string,
): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(logo, 0, 0, SIZE, SIZE);

    const radius = 20;
    const cx = SIZE - radius;
    const cy = radius;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}


// -- Who owns the tab's icon and title ----------------------------------------
//
// TWO things want to change the tab now -- the unread missed-call count, and a call
// ringing right now -- and before this there was one writer poking `link.href` directly
// from `useTabMissedCallBadge`. Two writers would fight: whichever ran last would win,
// and a flash that stopped would leave whatever frame it stopped on.
//
// So this module owns the element. Callers declare STATE, never frames, and one
// `render()` resolves the priority. Same reasoning `syncTones` uses for the ringtone:
// derive the output from the state, so "forgot to stop it" is unreachable.

/** Ringing beats the missed-call count beats the plain logo. */
let missedLabel: string | null = null;
let ringing = false;
let flashTimer: ReturnType<typeof setInterval> | null = null;
let flashOn = false;
let originalTitle: string | null = null;

/** 700ms: fast enough to read as an alert, slow enough not to strobe. */
const FLASH_MS = 700;

const RING_GREEN = '#22C55E'; // Tailwind green-500, the colour calls already use

function faviconEl(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

function setHref(href: string): void {
  const link = faviconEl();
  if (link && link.href !== href) link.href = href;
}

/**
 * Does this user want movement?
 *
 * `index.css` already kills `missed-call-pulse` under `prefers-reduced-motion`, and that
 * is the precedent: the information still arrives, it just stops moving. Here the steady
 * state is the ring badge held ON, rather than alternating.
 */
function wantsMotion(): boolean {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

function render(): void {
  if (ringing) {
    const show = !wantsMotion() || flashOn;
    void ringUrl().then((url) => {
      if (!ringing) return; // the call ended while the icon was being drawn
      setHref(show && url ? url : FAVICON_HREF);
    });
    if (originalTitle !== null) {
      document.title = show ? '📞 Incoming call' : originalTitle;
    }
    return;
  }

  if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  }
  if (!missedLabel) {
    setHref(FAVICON_HREF);
    return;
  }
  void badgedUrl(missedLabel).then((url) => {
    if (!ringing && missedLabel && url) setHref(url);
  });
}

function startFlashing(): void {
  if (flashTimer !== null) return;
  originalTitle ??= document.title;
  flashOn = true;
  render();
  // ⚠️ A background tab throttles `setInterval` hard -- which is the tab this is FOR.
  // The saving grace is that the ringtone is playing audio for the whole of this window,
  // and a page playing audio is exempt from Chrome's intensive throttling. Worth
  // re-checking on a real backgrounded tab if the flash ever looks frozen.
  flashTimer = setInterval(() => {
    flashOn = !flashOn;
    render();
  }, FLASH_MS);
}

function stopFlashing(): void {
  if (flashTimer !== null) clearInterval(flashTimer);
  flashTimer = null;
  flashOn = false;
}

/** The unread missed-call badge, or null for none. Called by `useTabMissedCallBadge`. */
export function setMissedBadge(label: string | null): void {
  missedLabel = label;
  render();
}

/**
 * A call is ringing right now.
 *
 * DERIVED from call state and published on every `publish()`, exactly as `syncTones` is,
 * so a flash cannot outlive the ring it describes.
 */
export function setTabRinging(on: boolean): void {
  if (ringing === on) return;
  ringing = on;
  if (on) startFlashing();
  else {
    stopFlashing();
    render();
  }
}

/** Put everything back. For sign-out, and for a provider unmount. */
export function resetTabBadge(): void {
  missedLabel = null;
  ringing = false;
  stopFlashing();
  if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  }
  setHref(FAVICON_HREF);
}

// The logo is decoded once and each rendered variant cached -- the 60s poll hands back
// the same number over and over, and the flash asks for the same two frames all call.
let logo: Promise<HTMLImageElement | null> | null = null;
const rendered = new Map<string, string>();

function loadLogo(): Promise<HTMLImageElement | null> {
  logo ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      logo = null; // let a later attempt retry rather than caching the failure
      resolve(null);
    };
    img.src = FAVICON_HREF;
  });
  return logo;
}

async function badgedUrl(label: string): Promise<string | null> {
  const cached = rendered.get(label);
  if (cached) return cached;
  const img = await loadLogo();
  if (!img) return null;
  const url = drawBadgedFavicon(img, label);
  if (url) rendered.set(label, url);
  return url;
}

/** The ringing frame: a green dot rather than a number -- there is nothing to count. */
async function ringUrl(): Promise<string | null> {
  const key = ' ring';
  const cached = rendered.get(key);
  if (cached) return cached;
  const img = await loadLogo();
  if (!img) return null;
  const url = drawDotFavicon(img, RING_GREEN);
  if (url) rendered.set(key, url);
  return url;
}
