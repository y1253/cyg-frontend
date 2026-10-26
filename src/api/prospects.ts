import { fetchWithAuth } from './client';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** step12f: a phone with no account that talked to the customer site's AI salesperson. */
export interface Prospect {
  id: number;
  phone: string;
  /** SMS | WHATSAPP | CALL */
  firstChannel: string;
  lastContactAt: string;
  createdAt: string;
  messageCount: number;
  lastText: string | null;
  /** The "Reply YES" sign-up offer was sent. */
  signupOfferedAt: string | null;
  signedUpAt: string | null;
  /** The account they opened. */
  customer: { id: number; name: string } | null;
}

export interface ProspectMessage {
  id: number;
  /** SMS | WHATSAPP | CALL */
  channel: string;
  /** USER | ASSISTANT */
  role: string;
  text: string;
  callSid: string | null;
  createdAt: string;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

export async function fetchProspects(token: string): Promise<Prospect[]> {
  const res = await fetchWithAuth(token, '/api/prospects', { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the prospects');
  return res.json() as Promise<Prospect[]>;
}

export async function fetchProspectMessages(token: string, id: number): Promise<ProspectMessage[]> {
  const res = await fetchWithAuth(token, `/api/prospects/${id}/messages`, { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the conversation');
  return res.json() as Promise<ProspectMessage[]>;
}
