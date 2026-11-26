/**
 * step11.md (2026-11-25): commands FROM the browser over the realtime WebSocket — the other
 * direction of the channel `useRealtime` keeps open. `useRealtime` hands its socket here once
 * the server has said hello, and takes it back when it closes; anything may then send.
 *
 * A module store, not a context, for the reason `agent-notify-bus.ts` gives: `useRealtime`
 * lives in `SoftphoneProvider`, above which nothing can read it through React.
 */
let socket: WebSocket | null = null;

export function setRealtimeSocket(ws: WebSocket | null): void {
  socket = ws;
}

/**
 * Sends `{type: 'cmd', name, payload}`. False when no socket is open (the long-poll
 * fallback) — the caller then uses its HTTP route instead.
 */
export function sendRealtimeCommand(name: string, payload: unknown): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify({ type: 'cmd', name, payload }));
    return true;
  } catch {
    return false;
  }
}
