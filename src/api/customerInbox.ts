import { fetchWithAuth } from './client';

/** `GET /customer-inbox` — the firm mailbox customers email (step12). ADMIN only. */
export interface CustomerInbox {
  connected: boolean;
  provider: 'GOOGLE' | 'MICROSOFT' | null;
  emailAddress: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** The AI answers (INTAKE_AI_REPLY=1); off = files are filed, nothing is sent back. */
  replying: boolean;
  messages: Array<{
    id: number;
    fromEmail: string;
    subject: string | null;
    customerId: number | null;
    customerName: string | null;
    /** ANSWERED | FILED | UNKNOWN_SENDER | SKIPPED | FAILED */
    status: string;
    error: string | null;
    receivedAt: string;
  }>;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

export async function fetchCustomerInbox(token: string): Promise<CustomerInbox> {
  const res = await fetchWithAuth(token, '/api/customer-inbox');
  if (!res.ok) throw await failure(res, 'Failed to load the customer inbox');
  return res.json() as Promise<CustomerInbox>;
}

export async function customerInboxAuthUrl(
  token: string,
  provider: 'google' | 'microsoft',
  kind: 'work' | 'personal' = 'personal',
): Promise<string> {
  const res = await fetchWithAuth(token, `/api/customer-inbox/auth-url?provider=${provider}&kind=${kind}`);
  if (!res.ok) throw await failure(res, 'Could not start the connection');
  return ((await res.json()) as { authUrl: string }).authUrl;
}

export async function syncCustomerInbox(token: string): Promise<void> {
  const res = await fetchWithAuth(token, '/api/customer-inbox/sync', { method: 'POST' });
  if (!res.ok) throw await failure(res, 'Could not check the inbox');
}

export async function disconnectCustomerInbox(token: string): Promise<void> {
  const res = await fetchWithAuth(token, '/api/customer-inbox', { method: 'DELETE' });
  if (!res.ok) throw await failure(res, 'Could not disconnect the inbox');
}
