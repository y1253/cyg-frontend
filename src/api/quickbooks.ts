import { fetchWithAuth } from './client';

/** step2.md (2026-11-04): a company's QuickBooks Online connection (Details tab). */
export interface QuickBooksStatus {
  /** The server has the Intuit app's keys. */
  configured: boolean;
  connected: boolean;
  companyName: string | null;
  realmId: string | null;
  connectedAt: string | null;
  needsReconnect: boolean;
  lastError: string | null;
  /** step11 (2026-11-23): since when bank transactions are sent to QuickBooks; null = off. */
  updateQuickbooks: string | null;
}

const base = (companyId: number) => `/api/quickbooks/companies/${companyId}`;

async function call<T>(
  token: string,
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const res = await fetchWithAuth(token, url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(msg || fallback);
  }
  return (await res.json()) as T;
}

export function fetchQuickBooksStatus(
  token: string,
  companyId: number,
): Promise<QuickBooksStatus> {
  return call(token, `${base(companyId)}/status`, {}, 'Failed to load QuickBooks');
}

export function fetchQuickBooksAuthUrl(
  token: string,
  companyId: number,
): Promise<{ authUrl: string }> {
  return call(token, `${base(companyId)}/auth-url`, {}, 'Could not start the QuickBooks sign-in');
}

/** step11 (2026-11-23): ADMIN turns "send bank transactions to QuickBooks" on or off. */
export function setUpdateQuickBooks(
  token: string,
  companyId: number,
  on: boolean,
): Promise<QuickBooksStatus> {
  return call(
    token,
    `${base(companyId)}/update-quickbooks`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    },
    'Failed to change the QuickBooks setting',
  );
}

export function disconnectQuickBooks(token: string, companyId: number): Promise<{ ok: true }> {
  return call(
    token,
    `${base(companyId)}/disconnect`,
    { method: 'DELETE' },
    'Failed to disconnect QuickBooks',
  );
}
