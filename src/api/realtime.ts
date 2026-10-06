import type { IncomingCallPayload } from './phone';
import { handleUnauthorized, unauthorizedCode } from './client';

const API = '/api';

/**
 * What the server can announce. Mirrors `REALTIME_TOPICS` in
 * `server/src/realtime/realtime.types.ts` — keep the two in step. A value rather than
 * only a union so `realtime-topics.test.ts` can walk every topic and fail when one has no
 * query-key mapping.
 */
export const REALTIME_TOPICS = [
  'call-ended',
  'phone',
  'phone-state',
  'active-call',
  'ringing',
  'sms',
  'whatsapp',
  'whatsapp-account',
  'email',
  'chat',
  'call-summary',
  'internal-message',
  'internal-call',
  'presence',
  'assignments',
  /** This user's session was ended server-side. Only wakes the channel; see below. */
  'session',
] as const;

export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];

export interface RealtimeEvent {
  seq: number;
  /** Long-poll only; the WebSocket does not send it. */
  at?: number;
  topic: RealtimeTopic;
  companyId?: number;
  /** `ringing` only — an `IncomingCallPayload`. Every other topic is a hint to refetch. */
  payload?: unknown;
}

export interface RealtimeBatch {
  seq: number;
  events: RealtimeEvent[];
  /** Events were missed; answer with one broad invalidation rather than a replay. */
  reset?: boolean;
}

/**
 * Ask for everything since `since`, waiting up to ~25s for it.
 *
 * ── WHY A LONG POLL AND NOT AN EventSource ─────────────────────────────────────
 * The office runs a TLS-intercepting content filter that buffers a response until it
 * COMPLETES before forwarding it. A stream never completes, so all three of this app's
 * SSE endpoints hang at readyState CONNECTING there and every surface silently falls
 * back to its slowest poll. This request completes, so it is forwarded — and because it
 * completes the moment the server has something, "completes" costs nothing in latency.
 *
 * Takes an `AbortSignal` because the caller must be able to drop a request in flight on
 * unmount or logout; a 25s response arriving into a torn-down hook is otherwise
 * unavoidable.
 */
export async function fetchRealtime(
  token: string,
  since: number,
  signal: AbortSignal,
): Promise<RealtimeBatch> {
  const res = await fetch(`${API}/realtime/events?since=${since}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  // The poll is the first request to notice a session ended server-side — a `session`
  // event wakes it and its very next request is refused — so it must sign the device
  // out like `fetchWithAuth` does, not just back off and retry forever.
  if (res.status === 401) {
    handleUnauthorized(await unauthorizedCode(res));
    throw new DOMException('signed out', 'AbortError');
  }
  if (!res.ok) throw new Error(`realtime ${res.status}`);
  return (await res.json()) as RealtimeBatch;
}

// ── WebSocket transport ─────────────────────────────────────────────────────

/** Same origin as the page, so the vite proxy (dev) and nginx (prod) both carry it. */
export function realtimeWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${API}/realtime/ws`;
}

/** Close code meaning "your session is over" — mirrors `WS_CLOSE` on the server. */
export const WS_SESSION_ENDED = 4401;

/** What the server sends down the socket. */
export type RealtimeServerFrame =
  | { type: 'hello'; seq: number; events: RealtimeEvent[]; reset?: boolean }
  | ({ type: 'event' } & RealtimeEvent)
  | { type: 'ping' };

/**
 * Narrow a `ringing` event's payload without trusting it blindly.
 *
 * The two fields checked are the two the softphone cannot work without: `callSid` is
 * what pairs the event to an INVITE, and `companyId` is what the overlay navigates to.
 * A payload missing either is dropped rather than paired — the browser then falls back
 * to the `/pending-calls` burst it already runs on every INVITE, which is the same
 * behaviour as this channel not being there at all.
 */
export function callEventOf(
  event: RealtimeEvent,
): (IncomingCallPayload & { type: string }) | null {
  if (event.topic !== 'ringing') return null;
  const p = event.payload as Partial<IncomingCallPayload & { type: string }> | null;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.callSid !== 'string' || typeof p.companyId !== 'number') return null;
  return p as IncomingCallPayload & { type: string };
}
