import type { IncomingCallPayload } from './phone';

const API = '/api';

/**
 * What the server can announce. Mirrors `RealtimeTopic` in
 * `server/src/realtime/realtime.types.ts` — keep the two in step.
 */
export type RealtimeTopic =
  | 'call-ended'
  | 'phone'
  | 'phone-state'
  | 'active-call'
  | 'ringing'
  | 'sms'
  | 'whatsapp'
  | 'email'
  | 'internal-message'
  | 'internal-call'
  | 'presence';

export interface RealtimeEvent {
  seq: number;
  at: number;
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
  if (!res.ok) throw new Error(`realtime ${res.status}`);
  return (await res.json()) as RealtimeBatch;
}

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
