import { fetchWithAuth } from './client';

const API = '/api';

export interface PolishReplyPayload {
  kind: 'email' | 'chat';
  // The user's rough draft (plain text).
  draft: string;
  // The whole email / whole conversation, assembled by the caller.
  context: string;
}

// Ask the AI to polish a draft reply. Returns the polished plain text.
export async function polishReply(
  token: string,
  payload: PolishReplyPayload,
): Promise<{ polished: string }> {
  const res = await fetchWithAuth(token, `${API}/ai/polish-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to polish reply');
  }
  return res.json() as Promise<{ polished: string }>;
}
