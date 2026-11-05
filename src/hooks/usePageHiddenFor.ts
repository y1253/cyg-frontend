import { useEffect, useState, useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

const isHidden = () => document.visibilityState === 'hidden';

/**
 * True once this browser tab has been hidden for `ms` straight; false the moment it is
 * shown again. step2.md (2026-11-05): heavy per-tab streams (an agent's live browser) are
 * closed in tabs nobody is looking at; the grace keeps a quick tab switch from redialling.
 */
export function usePageHiddenFor(ms: number): boolean {
  const hidden = useSyncExternalStore(subscribe, isHidden, () => false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    if (!hidden) return;
    const id = setTimeout(() => setLong(true), ms);
    return () => {
      clearTimeout(id);
      setLong(false);
    };
  }, [hidden, ms]);
  return hidden && long;
}
