import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useInboxSummary } from '@/hooks/useInboxSummary';
import { FAVICON_HREF, badgeLabel, drawBadgedFavicon } from '@/lib/tab-badge';

/**
 * Puts the number of unread missed calls on the browser tab's icon while the user is
 * looking at something else, and puts the plain logo back when they return.
 *
 * The count is `missedCallsOwn` — the user's OWN companies plus their staff calls, the
 * same scope as the bell — not the dashboard's global map, which would show everybody
 * the whole firm's missed calls.
 *
 * No polling of its own: `useInboxSummary` already refetches every 60s, in background
 * tabs too, which is exactly the case this exists for. A call read inside the app is
 * reflected on the next blur, because the mark hooks invalidate that query.
 */
export function useTabMissedCallBadge() {
  const { token } = useAuth();
  const { missedCallsOwn } = useInboxSummary();
  const [away, setAway] = useState(isAway);

  useEffect(() => {
    const update = () => setAway(isAway());
    // Deferred on blur: moving focus into an iframe (an email body is one) fires a window
    // `blur` while the user is still right here, and `hasFocus()` only reports that the
    // focus stayed inside this page once the event has finished.
    const onBlur = () => setTimeout(update, 0);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Signed out means no badge, even if a stale summary is still in the query cache.
  const label = token && away ? badgeLabel(missedCallsOwn) : null;

  useEffect(() => {
    const link = faviconLink();
    if (!link) return;
    if (!label) {
      link.href = FAVICON_HREF;
      return;
    }
    let cancelled = false;
    void badgedUrl(label).then((url) => {
      if (!cancelled && url) link.href = url;
    });
    return () => {
      cancelled = true;
    };
  }, [label]);

  // Leaving the app shell (sign-out unmounts it) must not strand a badge on the tab.
  useEffect(
    () => () => {
      const link = faviconLink();
      if (link) link.href = FAVICON_HREF;
    },
    [],
  );
}

function isAway(): boolean {
  if (typeof document === 'undefined') return false;
  return document.hidden || !document.hasFocus();
}

function faviconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

// Module-level: the logo is decoded once, and each label is drawn once, however many
// times the 60s poll hands back the same number.
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
