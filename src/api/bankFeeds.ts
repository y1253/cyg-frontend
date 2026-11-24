import { fetchWithAuth } from './client';

/**
 * step11 (2026-11-23): a company's bank connections, kept by the CUSTOMER app in the
 * company's book (`/api/companies/:id/customer-bank-feeds`, proxied to the customer API) —
 * the same connections the customer sees on cygfinance.com.
 */
export interface BankAccount {
  id: number;
  name: string;
  mask: string | null;
  kind: string;
  /** The folder (account) its transactions are filed under. */
  accountName: string;
  currency: string | null;
  currentBalance: number | null;
  /** YYYY-MM-DD — the first day filed; null = all the history there is. */
  startDate: string | null;
}

export interface BankItem {
  id: number;
  institutionName: string | null;
  status: 'ACTIVE' | 'LOGIN_REQUIRED' | 'ERROR' | 'REMOVED';
  error: string | null;
  errorDetail: string | null;
  historyDone: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  /** null = the start dates were never confirmed — nothing is filed until they are. */
  setupAt: string | null;
  syncing: boolean;
  refreshNote?: string | null;
  newAccounts: boolean;
  /** YYYY-MM-DD — the oldest day Plaid can give. */
  earliestDate: string;
  accounts: BankAccount[];
}

const base = (companyId: number) => `/api/companies/${companyId}/customer-bank-feeds`;

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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function fetchBankConfig(token: string, companyId: number) {
  return call<{ enabled: boolean }>(
    token,
    `${base(companyId)}/config`,
    {},
    'Failed to load bank feeds',
  );
}

export function fetchBankItems(token: string, companyId: number) {
  return call<BankItem[]>(token, base(companyId), {}, 'Failed to load bank feeds');
}

/** `itemId` = sign in to that bank again; `chooseAccounts` = pick its shared accounts again. */
export function createBankLinkToken(
  token: string,
  companyId: number,
  itemId?: number,
  chooseAccounts = false,
) {
  const q = new URLSearchParams();
  if (itemId) q.set('itemId', String(itemId));
  if (chooseAccounts) q.set('accounts', '1');
  return call<{ linkToken: string }>(
    token,
    `${base(companyId)}/link-token${q.size ? `?${q}` : ''}`,
    json('POST'),
    'Could not start the bank connection',
  );
}

export function exchangeBankToken(token: string, companyId: number, publicToken: string) {
  return call<BankItem>(
    token,
    `${base(companyId)}/exchange`,
    json('POST', { publicToken }),
    'Could not connect the bank',
  );
}

export function bankReconnected(token: string, companyId: number, itemId: number) {
  return call<BankItem>(
    token,
    `${base(companyId)}/${itemId}/reconnected`,
    json('POST'),
    'Could not update the connection',
  );
}

export function setBankStartDates(
  token: string,
  companyId: number,
  itemId: number,
  accounts: Array<{ id: number; startDate: string | null }>,
) {
  return call<BankItem>(
    token,
    `${base(companyId)}/${itemId}/accounts`,
    json('PUT', { accounts }),
    'Could not save the start dates',
  );
}

export function syncBankItem(token: string, companyId: number, itemId: number) {
  return call<BankItem>(
    token,
    `${base(companyId)}/${itemId}/sync`,
    json('POST'),
    'Could not refresh the bank',
  );
}

export function disconnectBankItem(token: string, companyId: number, itemId: number) {
  return call<void>(
    token,
    `${base(companyId)}/${itemId}`,
    json('DELETE'),
    'Failed to disconnect the bank',
  );
}
