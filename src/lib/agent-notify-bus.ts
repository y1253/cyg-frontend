/**
 * step11: an AI agent wrote to staff — the realtime `agent-notify` event, handed from
 * `useRealtime` to `NotificationContext`, which raises the popup.
 *
 * A module-level emitter rather than a prop or a context, for the reason
 * `lib/unreadFeedDismiss.ts` is a module store: `useRealtime` is mounted inside
 * `SoftphoneProvider`, which `NotificationProvider` WRAPS, so the hook cannot reach
 * `notify` through React. Either side may mount first; nothing is replayed, because a
 * popup for something that happened before the page was listening is not wanted.
 */
export interface AgentNotice {
  companyId: number;
  companyName: string;
  agentId: number;
  agentName: string;
  messageId: number;
  kind: 'MESSAGE' | 'QUESTION' | 'APPROVAL_REQUEST' | 'TASK_UPDATE' | string;
  todoId: number | null;
  body: string;
}

type Listener = (notice: AgentNotice) => void;

const listeners = new Set<Listener>();

export function onAgentNotice(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAgentNotice(notice: AgentNotice): void {
  for (const listener of listeners) {
    try {
      listener(notice);
    } catch {
      // one broken listener must not cost the others their popup
    }
  }
}

/** Narrow an event payload without trusting it: no ids, no popup. */
export function agentNoticeOf(payload: unknown): AgentNotice | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<AgentNotice>;
  if (typeof p.companyId !== 'number' || typeof p.agentId !== 'number') return null;
  if (typeof p.body !== 'string') return null;
  return {
    companyId: p.companyId,
    companyName: typeof p.companyName === 'string' ? p.companyName : '',
    agentId: p.agentId,
    agentName: typeof p.agentName === 'string' ? p.agentName : 'Agent',
    messageId: typeof p.messageId === 'number' ? p.messageId : 0,
    kind: typeof p.kind === 'string' ? p.kind : 'MESSAGE',
    todoId: typeof p.todoId === 'number' ? p.todoId : null,
    body: p.body,
  };
}

/** The popup's title: who, where, and whether it waits on somebody. */
export function agentNoticeTitle(n: AgentNotice): string {
  const what =
    n.kind === 'APPROVAL_REQUEST'
      ? ' asks for approval'
      : n.kind === 'QUESTION'
        ? ' has a question'
        : '';
  return `🤖 ${n.agentName}${what}${n.companyName ? ` · ${n.companyName}` : ''}`;
}
