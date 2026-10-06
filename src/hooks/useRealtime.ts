import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchRealtime,
  callEventOf,
  realtimeWsUrl,
  WS_SESSION_ENDED,
  type RealtimeEvent,
  type RealtimeServerFrame,
} from '@/api/realtime';
import { handleUnauthorized } from '@/api/client';
import type { IncomingCallPayload } from '@/api/phone';
import { RESET_KEYS, keysFor } from '@/lib/realtime-topics';
import { setRealtimeConnected } from '@/lib/realtime-status';

/** Backoff ceiling, matching `useInternalMessageStream`. */
const MAX_BACKOFF_MS = 30_000;

/** A socket that has not said hello by now is treated as blocked. */
const HELLO_TIMEOUT_MS = 8_000;

/**
 * The server pings every 25s. Nothing at all for this long means the socket is
 * half-open — what a TLS-intercepting proxy leaves behind — so it is closed and redialled.
 */
const SILENCE_MS = 70_000;

/** Consecutive sockets that died before hello, after which this tab uses the long poll. */
const WS_FAILURES_BEFORE_FALLBACK = 2;

/** While on the long poll, how often the WebSocket is tried again. */
const WS_RETRY_MS = 5 * 60_000;

type WsOutcome = 'stopped' | 'session-ended' | 'failed-before-hello' | 'closed';

/**
 * The app's single real-time connection — the reason the polls can be slow.
 *
 * ── TWO TRANSPORTS, ONE CHANNEL ────────────────────────────────────────────────
 * PRIMARY: a WebSocket to `/api/realtime/ws`. The server pushes a small object the
 * moment anything changes — `{ topic: 'email', companyId: 3 }` — only for companies this
 * user works (management gets every company), and the browser refetches exactly what
 * that topic covers (`keysFor`). No data rides the socket; every read still goes through
 * the ordinary authorised route.
 *
 * FALLBACK: the long poll (`GET /api/realtime/events`). The office runs a
 * TLS-intercepting content filter that kills every SSE stream outright, and a WebSocket
 * may well fare no better. A long poll is a normal request that completes, so it gets
 * through. Same events, same cursor, so switching is seamless. Two sockets in a row that
 * never say hello → this tab polls, and re-tries the socket every 5 minutes.
 *
 * ── WHAT "CONNECTED" BUYS ──────────────────────────────────────────────────────
 * `setRealtimeConnected(true)` drops every `refetchInterval` in the app to a 5-minute
 * backstop (`lib/realtime-status.ts`). The flag goes false the instant either transport
 * fails, and the polls return to their normal rates — so a dead channel degrades to how
 * the app behaved before it existed, never to a stale screen.
 *
 * ONE loop per tab, mounted in `SoftphoneProvider`. `onCallEvent` is read through a ref,
 * so a changing callback never restarts the connection.
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
    let socket: WebSocket | null = null;
    let sleepTimer: ReturnType<typeof setTimeout> | null = null;
    let wakeSleep: (() => void) | null = null;

    // The cursor lives in the closure, not in state, and is SHARED by both transports:
    // whichever reconnects resumes exactly where the other left off.
    let since = 0;

    const invalidate = (keys: unknown[][]) => {
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
    };

    const dispatch = (events: RealtimeEvent[], reset?: boolean) => {
      if (reset) {
        // Away long enough that the server can no longer say what changed.
        invalidate(RESET_KEYS);
        return;
      }
      for (const event of events) {
        // A ringing event carries the call itself, because the softphone needs it to
        // pair an INVITE rather than a hint to go and look.
        const call = callEventOf(event);
        if (call) handlerRef.current?.(call);
        invalidate(keysFor(event));
      }
    };

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        wakeSleep = resolve;
        sleepTimer = setTimeout(resolve, ms);
      });

    const backoff = () =>
      Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry++) + Math.random() * 500;

    /** One WebSocket, start to finish. */
    const runSocket = () =>
      new Promise<WsOutcome>((resolve) => {
        let ws: WebSocket;
        try {
          ws = new WebSocket(realtimeWsUrl());
        } catch {
          resolve('failed-before-hello');
          return;
        }
        socket = ws;
        let greeted = false;
        let settled = false;
        let silence: ReturnType<typeof setTimeout> | null = null;

        const finish = (outcome: WsOutcome) => {
          if (settled) return;
          settled = true;
          clearTimeout(helloTimer);
          if (silence) clearTimeout(silence);
          socket = null;
          resolve(outcome);
        };
        const armSilence = () => {
          if (silence) clearTimeout(silence);
          silence = setTimeout(() => ws.close(), SILENCE_MS);
        };
        const helloTimer = setTimeout(() => {
          if (!greeted) ws.close();
        }, HELLO_TIMEOUT_MS);

        ws.onopen = () => {
          // Auth is the FIRST MESSAGE, never the URL: a seven-day JWT in a query string
          // would land in every proxy access log.
          ws.send(JSON.stringify({ type: 'auth', token, since }));
        };

        ws.onmessage = (msg) => {
          let frame: RealtimeServerFrame;
          try {
            frame = JSON.parse(String(msg.data)) as RealtimeServerFrame;
          } catch {
            return;
          }
          armSilence();
          if (frame.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          if (frame.type === 'hello') {
            if (!greeted) console.info('[realtime] transport=ws');
            greeted = true;
            retry = 0;
            since = frame.seq;
            setRealtimeConnected(true);
            dispatch(frame.events, frame.reset);
            return;
          }
          if (frame.type === 'event') {
            since = frame.seq;
            dispatch([frame]);
          }
        };

        ws.onclose = (ev) => {
          if (stopped) return finish('stopped');
          if (ev.code === WS_SESSION_ENDED) {
            // Signed out server-side (or the token was refused at auth) — the same
            // treatment a 401 gets everywhere else.
            handleUnauthorized('SESSION_ENDED');
            return finish('session-ended');
          }
          finish(greeted ? 'closed' : 'failed-before-hello');
        };
      });

    /** One long poll. */
    const pollOnce = async (): Promise<'ok' | 'stopped' | 'error'> => {
      controller = new AbortController();
      try {
        const batch = await fetchRealtime(token, since, controller.signal);
        if (stopped) return 'stopped';
        retry = 0;
        since = batch.seq;
        setRealtimeConnected(true);
        dispatch(batch.events, batch.reset);
        return 'ok';
      } catch (err) {
        if (stopped) return 'stopped';
        // An abort is our own teardown (or a sign-out `fetchRealtime` already handled).
        if (err instanceof DOMException && err.name === 'AbortError') return 'stopped';
        console.warn('[realtime] poll failed, retrying', err);
        return 'error';
      }
    };

    const loop = async () => {
      let wsFailures = 0;
      let pollUntil = 0; // while now < pollUntil, use the long poll

      while (!stopped) {
        if (Date.now() >= pollUntil) {
          const outcome = await runSocket();
          if (outcome === 'stopped' || outcome === 'session-ended') return;
          setRealtimeConnected(false);

          if (outcome === 'failed-before-hello') {
            if (++wsFailures >= WS_FAILURES_BEFORE_FALLBACK) {
              console.info('[realtime] transport=longpoll (websocket unavailable)');
              wsFailures = 0;
              pollUntil = Date.now() + WS_RETRY_MS;
              continue;
            }
          } else {
            wsFailures = 0;
          }
          await sleep(backoff());
          continue;
        }

        const result = await pollOnce();
        if (result === 'stopped') return;
        if (result === 'error') {
          setRealtimeConnected(false);
          await sleep(backoff());
        }
      }
    };

    void loop();

    return () => {
      stopped = true;
      controller?.abort();
      socket?.close();
      if (sleepTimer) clearTimeout(sleepTimer);
      wakeSleep?.();
      setRealtimeConnected(false);
    };
  }, [token, qc]);
}
