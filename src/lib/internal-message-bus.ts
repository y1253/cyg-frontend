/**
 * step2.md (2026-11-05): a new staff message, handed from `useRealtime` to the popup in
 * `useInternalMessageStream` — the `agent-notify-bus.ts` pattern, for the same reason
 * (`useRealtime` is mounted inside `SoftphoneProvider`, which `NotificationProvider`
 * wraps).
 *
 * The SSE stream used to be the only thing carrying the popup's text; now that it opens
 * only while the realtime socket is down, the socket's `internal-message` event carries
 * it as `{ newMessage: {from, subject, snippet, threadId} }` — sent to the recipient
 * alone. Events for the sender, or for read/completed changes, carry no `newMessage`.
 */
export interface InternalMessageNotice {
  from?: string;
  subject?: string;
  snippet?: string;
  threadId?: number;
}

type Listener = (notice: InternalMessageNotice) => void;
const listeners = new Set<Listener>();

export function onInternalMessageNotice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitInternalMessageNotice(notice: InternalMessageNotice): void {
  for (const listener of listeners) {
    try {
      listener(notice);
    } catch {
      // one broken listener must not cost the others their popup
    }
  }
}

/** Narrow an `internal-message` event payload; null = not a new message for me. */
export function internalMessageNoticeOf(payload: unknown): InternalMessageNotice | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as { newMessage?: unknown }).newMessage;
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return {
    from: str(m.from),
    subject: str(m.subject),
    snippet: str(m.snippet),
    threadId: typeof m.threadId === 'number' ? m.threadId : undefined,
  };
}
