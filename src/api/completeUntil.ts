import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * "Complete till here" — mark this message and everything older in the conversation.
 *
 * ── WHY THE CLIENT SENDS ONE ID, NOT THE LIST IT ALREADY HAS ───────────────────
 * Every thread view holds its whole conversation, so posting the ids would be easy. It
 * would also be wrong: each view is CAPPED (one chat page, 200 texts, 200 WhatsApp rows),
 * so anything older than the cap would be skipped in silence — and a list of arbitrary ids
 * is a writer into `MessageCompletedState`, the table shared with every mailbox in the
 * firm. The server rebuilds the thread and cuts it itself; see `idsUpTo` on that side.
 *
 * All five answer `{ completed }`, the number of rows the write actually changed. The UI
 * reports THAT rather than its own estimate, because the two can legitimately differ: the
 * server may see messages older than the client's cap, and it skips rows already complete.
 */
export interface CompleteUntilResult {
  /** Rows the write actually changed. Named for the shape, not the verb — see below. */
  completed: number;
}

/**
 * Which state "till here" writes.
 *
 * ⚠️ Read and complete are SEPARATE routes on the server, not one route with a parameter,
 * because each channel stores the two in a different place — chat and texts share
 * `ChatMessageReadState`, WhatsApp has a column, internal has a per-recipient row, and a
 * mailbox has no local read store AT ALL (it is the provider's `UNREAD` label). Only the
 * anchor and the response shape are common, which is exactly what this union carries.
 */
export type UntilAction = 'complete' | 'read';

/** What a caller has to name, per channel. */
export type CompleteUntilTarget =
  | { kind: 'email'; companyId: number; threadId: string; messageId: string }
  | { kind: 'chat'; companyId: number; spaceId: string; messageId: string }
  | { kind: 'sms'; companyId: number; peer: string; itemId: string }
  | { kind: 'whatsapp'; companyId: number; messageId: number }
  | { kind: 'internal'; messageId: number };

function urlFor(target: CompleteUntilTarget, action: UntilAction): string {
  const base = `${API}/communications`;
  const verb = action === 'read' ? 'read-until' : 'complete-until';
  switch (target.kind) {
    case 'email':
      return `${base}/companies/${target.companyId}/emails/${verb}`;
    case 'chat':
      return `${base}/companies/${target.companyId}/chats/${verb}`;
    case 'sms':
      return `${base}/companies/${target.companyId}/sms/${verb}`;
    case 'whatsapp':
      return `${base}/companies/${target.companyId}/whatsapp/${verb}`;
    case 'internal':
      return `${base}/internal-messages/${verb}`;
  }
}

/** The anchor, minus the routing fields the URL already carries. */
function bodyFor(target: CompleteUntilTarget): Record<string, unknown> {
  switch (target.kind) {
    case 'email':
      return { threadId: target.threadId, messageId: target.messageId };
    case 'chat':
      return { spaceId: target.spaceId, messageId: target.messageId };
    case 'sms':
      return { peer: target.peer, itemId: target.itemId };
    case 'whatsapp':
    case 'internal':
      return { messageId: target.messageId };
  }
}

export async function markUntil(
  token: string,
  target: CompleteUntilTarget,
  action: UntilAction,
): Promise<CompleteUntilResult> {
  const res = await fetchWithAuth(token, urlFor(target, action), {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(bodyFor(target)),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;
    throw new Error(
      message ??
        `Could not mark these messages ${action === 'read' ? 'read' : 'complete'}`,
    );
  }
  return res.json() as Promise<CompleteUntilResult>;
}
