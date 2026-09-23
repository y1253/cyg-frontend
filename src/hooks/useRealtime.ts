import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchRealtime, callEventOf } from '@/api/realtime';
import type { IncomingCallPayload } from '@/api/phone';
import { RESET_KEYS, keysFor } from '@/lib/realtime-topics';

/** Backoff ceiling, matching `useInternalMessageStream`. */
const MAX_BACKOFF_MS = 30_000;

/**
 * The app's single real-time connection.
 *
 * ── WHY THIS EXISTS WHEN THERE ARE ALREADY THREE SSE STREAMS ───────────────────
 * Because on the network this firm uses, all three are dead. The office runs a
 * TLS-intercepting content filter that buffers a response until it completes, so an
 * event stream never delivers even its headers — verified from inside it: a normal API
 * call returned 200 in 76ms while both streams hung indefinitely. Every communications
 * surface therefore fell back to its slowest poll, and each poll lands on a server cache
 * sized to sit just under it: the missed-call badge was a 60s poll in front of two 55s
 * caches, so up to ~115 seconds. That is the reported "it takes a minute".
 *
 * A long poll is a normal request that COMPLETES, so the filter forwards it — and it
 * completes the moment the server has something, so completing costs nothing.
 *
 * ⚠️ This does NOT replace any `refetchInterval`. Every one of them stays exactly as it
 * was, demoted to the backstop for a channel that is down — the same arrangement the
 * internal-message stream already documents. If this hook is the only thing keeping a
 * surface fresh, that surface is one network blip from looking broken.
 *
 * ONE loop per tab, and it must stay that way. A held request occupies one of the
 * browser's six per-host HTTP/1.1 connections — irrelevant in production, where nginx
 * serves HTTP/2 and multiplexes, but in `vite dev` (HTTP/1.1) a second copy of this hook
 * would spend a third of the tab's connection budget on waiting.
 *
 * `onCallEvent` must be identity-stable; it is read through a ref regardless, so a
 * changing callback can never restart the loop mid-poll.
 */
export function useRealtime(
  onCallEvent?: (call: IncomingCallPayload & { type: string }) => void,
) {
  const { token } = useAuth();
  const qc = useQueryClient();

  const handlerRef = useRef(onCallEvent);
  useEffect(() => {
    handlerRef.current = onCallEvent;
  }, [onCallEvent]);

  useEffect(() => {
    if (!token) return;

    let stopped = false;
    let retry = 0;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // The cursor lives in the closure, not in state: it changes on every poll and
    // rendering on it would re-run this effect and tear down the very request that
    // produced it.
    let since = 0;

    const invalidate = (keys: unknown[][]) => {
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
    };

    const loop = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const batch = await fetchRealtime(token, since, controller.signal);
          if (stopped) return;

          retry = 0;
          since = batch.seq;

          if (batch.reset) {
            // We were away long enough that the server can no longer say what changed.
            invalidate(RESET_KEYS);
            continue;
          }

          for (const event of batch.events) {
            // A ringing event carries the call itself, because the softphone needs it to
            // pair an INVITE rather than a hint to go and look.
            const call = callEventOf(event);
            if (call) handlerRef.current?.(call);
            invalidate(keysFor(event));
          }
        } catch (err) {
          if (stopped) return;
          // An abort is our own teardown, not a failure.
          if (err instanceof DOMException && err.name === 'AbortError') return;

          const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry++) + Math.random() * 500;
          console.warn('[realtime] poll failed, retrying', err);
          await new Promise<void>((resolve) => {
            timer = setTimeout(resolve, wait);
          });
        }
      }
    };

    void loop();

    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [token, qc]);
}
