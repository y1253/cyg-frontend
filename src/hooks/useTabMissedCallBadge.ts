import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useInboxSummary } from '@/hooks/useInboxSummary';
import { badgeLabel, resetTabBadge, setMissedBadge } from '@/lib/tab-badge';

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

  // Declare the state; `tab-badge` owns the element and resolves it against a ringing
  // call, which outranks this. Writing `link.href` from here directly — as this used to —
  // would fight the ring flash, and whichever wrote last would win.
  useEffect(() => {
    setMissedBadge(label);
  }, [label]);

  // Leaving the app shell (sign-out unmounts it) must not strand a badge on the tab.
  useEffect(() => () => resetTabBadge(), []);
}

function isAway(): boolean {
  if (typeof document === 'undefined') return false;
  return document.hidden || !document.hasFocus();
}
