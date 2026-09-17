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
  completed: number;
}

/** What a caller has to name, per channel. */
export type CompleteUntilTarget =
  | { kind: 'email'; companyId: number; threadId: string; messageId: string }
  | { kind: 'chat'; companyId: number; spaceId: string; messageId: string }
  | { kind: 'sms'; companyId: number; peer: string; itemId: string }
  | { kind: 'whatsapp'; companyId: number; messageId: number }
  | { kind: 'internal'; messageId: number };

function urlFor(target: CompleteUntilTarget): string {
  const base = `${API}/communications`;
  switch (target.kind) {
    case 'email':
      return `${base}/companies/${target.companyId}/emails/complete-until`;
    case 'chat':
      return `${base}/companies/${target.companyId}/chats/complete-until`;
    case 'sms':
      return `${base}/companies/${target.companyId}/sms/complete-until`;
    case 'whatsapp':
      return `${base}/companies/${target.companyId}/whatsapp/complete-until`;
    case 'internal':
      return `${base}/internal-messages/complete-until`;
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

export async function completeUntil(
  token: string,
  target: CompleteUntilTarget,
): Promise<CompleteUntilResult> {
  const res = await fetchWithAuth(token, urlFor(target), {
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
    throw new Error(message ?? 'Could not complete these messages');
  }
  return res.json() as Promise<CompleteUntilResult>;
}
