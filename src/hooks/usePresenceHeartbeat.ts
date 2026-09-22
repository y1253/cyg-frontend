import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { postPresence } from '@/api/phone';

/** How often an open app says it is still here. Half the server's 45s window. */
const BEAT_MS = 20_000;

/**
 * Tell the server this browser is here, and whether it is on a call.
 *
 * ── WHY THE BROWSER HAS TO SAY SO ─────────────────────────────────────────────
 * Presence used to be derived from open SSE streams alone, and the office network runs a
 * TLS-intercepting content filter that blackholes SSE entirely — the same filter that
 * `pending` and the ringing poll exist to work around. So on the one network this firm
 * actually uses, every colleague reported offline and the pickers showed a wall of grey
 * dots. An ordinary POST gets through where the stream does not.
 *
 * ⚠️ And BUSY can only come from here. An inbound call rings every registered browser on
 * one shared SIP credential, so the server is never told which of them picked up — the
 * browser that did is the only thing in the system that knows.
 *
 * Mounted ONCE, in `SoftphoneProvider`. `busy` is a dependency rather than a ref read, so
 * a flip re-runs the effect and posts immediately: "went on a call" and "came off one"
 * are both visible within a render instead of up to twenty seconds later, which is the
 * whole point of showing it next to a call button. Restarting the timer on a flip costs
 * nothing — it happens twice a call.
 */
export function usePresenceHeartbeat(busy: boolean): void {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void postPresence(token, busy);
    const id = setInterval(() => void postPresence(token, busy), BEAT_MS);
    return () => clearInterval(id);
  }, [token, busy]);
}
