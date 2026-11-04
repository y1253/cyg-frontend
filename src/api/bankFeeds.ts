import { fetchWithAuth } from './client';

/** step2.md (2026-11-04): a company's bank logins connected through Plaid (Details tab). */
export interface BankAccount {
  id: number;
  accountId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  currency: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  creditLimit: number | null;
  balanceAt: string | null;
}

export type BankItemStatus = 'ACTIVE' | 'LOGIN_REQUIRED' | 'ERROR' | 'REMOVED';

export interface BankItem {
  id: number;
  institutionId: string | null;
  institutionName: string | null;
  products: string[];
  status: BankItemStatus;
  error: string | null;
  historyDone: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  syncing: boolean;
  accounts: BankAccount[];
}

export interface BankFeedsStatus {
  /** The server has Plaid keys + ENCRYPTION_KEY. */
  configured: boolean;
  environment: string;
  items: BankItem[];
}

const base = '/api/bank-feeds';

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

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function fetchBankFeedsStatus(token: string, companyId: number): Promise<BankFeedsStatus> {
  return call(token, `${base}/companies/${companyId}/status`, {}, 'Failed to load bank feeds');
}

/** A Plaid Link token; with `itemId` Link opens in update mode (Reconnect). */
export function createBankLinkToken(
  token: string,
  companyId: number,
  itemId?: number,
): Promise<{ linkToken: string }> {
  return call(
    token,
    `${base}/companies/${companyId}/link-token`,
    json(itemId ? { itemId } : {}),
    'Could not start the bank connection',
  );
}

export function exchangeBankToken(
  token: string,
  companyId: number,
  publicToken: string,
): Promise<BankItem> {
  return call(
    token,
    `${base}/companies/${companyId}/exchange`,
    json({ publicToken }),
    'Could not save the bank connection',
  );
}

export function syncBankItem(token: string, itemId: number): Promise<BankItem> {
  return call(token, `${base}/items/${itemId}/sync`, json({}), 'Sync failed');
}

export function disconnectBankItem(token: string, itemId: number): Promise<{ ok: true }> {
  return call(
    token,
    `${base}/items/${itemId}`,
    { method: 'DELETE' },
    'Failed to disconnect the bank',
  );
}
