import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SOFTPHONE_CHANNEL,
  SOFTPHONE_LOCK,
  TONE_OWNER_KEY,
  isToneTab,
  newTabId,
  parseTabMessage,
  tabsSupported,
  type TabMessage,
  type TabRole,
} from '@/lib/softphone-tabs';

/** How often a focus / click may rewrite the tone owner. */
const TONE_CLAIM_MS = 2_000;

function readOwner(): string | null {
  try {
    return localStorage.getItem(TONE_OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * This tab's part in "one tab holds the phone" (`lib/softphone-tabs.ts`).
 *
 * - `role`: `holder` = this tab runs the SIP UserAgent; `follower` = another tab does, and
 *   this one mirrors it; `solo` = the browser cannot coordinate tabs (old behaviour).
 *   A follower becomes the holder by itself when the holder's tab closes or signs out —
 *   the Web Lock is queued, never stolen, so a live call is never taken from its tab.
 * - `post` / `subscribe`: the BroadcastChannel.
 * - `toneHere()`: whether this tab should play the ringtone right now;
 *   `onToneOwnerChange` fires when the user moves to another tab.
 */
export function useSoftphoneTab(signedIn: boolean) {
  const supported = useMemo(() => tabsSupported(), []);
  const tabId = useMemo(() => newTabId(), []);
  const [role, setRole] = useState<TabRole>(supported ? 'follower' : 'solo');
  const roleRef = useRef(role);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const handlersRef = useRef(new Set<(msg: TabMessage) => void>());
  const toneListenersRef = useRef(new Set<() => void>());

  // ── The channel ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!supported) return;
    const ch = new BroadcastChannel(SOFTPHONE_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent) => {
      const msg = parseTabMessage(e.data);
      if (!msg) return;
      for (const h of handlersRef.current) {
        try {
          h(msg);
        } catch {
          // one broken handler must not stop the others
        }
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [supported]);

  const post = useCallback((msg: TabMessage) => {
    try {
      channelRef.current?.postMessage(msg);
    } catch {
      // a closing channel — nothing to tell anybody
    }
  }, []);

  const subscribe = useCallback((handler: (msg: TabMessage) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  // ── The lock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!supported || !signedIn) return;
    const abort = new AbortController();
    let release: (() => void) | null = null;
    let done = false;

    void navigator.locks
      .request(SOFTPHONE_LOCK, { signal: abort.signal }, () => {
        if (done) return undefined;
        setRole('holder');
        // Held until this effect is cleaned up (sign-out, unmount) or the tab dies —
        // the browser releases a dead tab's locks by itself.
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => undefined); // AbortError on cleanup while still queued

    return () => {
      done = true;
      abort.abort();
      if (release) {
        post({ t: 'gone', from: tabId });
        release();
      }
      setRole('follower');
    };
  }, [supported, signedIn, post, tabId]);

  // The page is going: tell the followers now rather than when the lock frees.
  useEffect(() => {
    if (!supported) return;
    const onHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // bfcache — the page may come back
      if (roleRef.current === 'holder') post({ t: 'gone', from: tabId });
      try {
        if (localStorage.getItem(TONE_OWNER_KEY) === tabId) {
          localStorage.removeItem(TONE_OWNER_KEY);
        }
      } catch {
        /* storage blocked */
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [supported, post, tabId]);

  // ── The ringtone owner: the tab the user is in ──────────────────────────────
  useEffect(() => {
    if (!supported || !signedIn) return;
    let lastClaim = 0;
    const fire = () => {
      for (const l of toneListenersRef.current) l();
    };
    const claim = () => {
      const now = Date.now();
      if (now - lastClaim < TONE_CLAIM_MS && readOwner() === tabId) return;
      lastClaim = now;
      try {
        if (localStorage.getItem(TONE_OWNER_KEY) === tabId) return;
        localStorage.setItem(TONE_OWNER_KEY, tabId);
      } catch {
        return;
      }
      fire(); // `storage` does not fire in the tab that wrote
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === TONE_OWNER_KEY) fire();
    };
    if (document.hasFocus()) claim();
    window.addEventListener('focus', claim);
    window.addEventListener('pointerdown', claim, { capture: true });
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', claim);
      window.removeEventListener('pointerdown', claim, { capture: true });
      window.removeEventListener('storage', onStorage);
    };
  }, [supported, signedIn, tabId]);

  const toneHere = useCallback(() => {
    if (!supported) return true;
    return isToneTab({
      me: tabId,
      owner: readOwner(),
      isHolder: roleRef.current === 'holder',
    });
  }, [supported, tabId]);

  const onToneOwnerChange = useCallback((listener: () => void) => {
    toneListenersRef.current.add(listener);
    return () => {
      toneListenersRef.current.delete(listener);
    };
  }, []);

  return { role, tabId, post, subscribe, toneHere, onToneOwnerChange };
}
