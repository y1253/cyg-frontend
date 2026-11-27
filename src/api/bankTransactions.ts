import { fetchWithAuth } from './client';
import type { CustomColumnType } from '@/lib/custom-columns';

/**
 * step11 (2026-11-23): a company's bank transactions with their name and category, read
 * from the customer API (which categorised them) through `/api/companies/:id/bank-transactions`.
 * Never the bank description. A change goes back through the customer API, which also
 * updates QuickBooks.
 */
export interface BankTransactionRow {
  key: string;
  id: number;
  kind: 'transaction' | 'split';
  splitOfId: number | null;
  date: string | null;
  name: string | null;
  subName: string | null;
  category: string;
  amount: number;
  fullAmount: number | null;
  account: string;
  qbo: { id: string | null; syncedAt: string | null; error: string | null } | null;
  /** step11 part 4: its answers in the book's own columns (column id → cell). */
  custom: Record<number, BankCell>;
}

export interface BankCell {
  value: string | null;
  dropDownId: number | null;
}

/** step11 part 4 (2026-11-27): one of the book's own columns (QuickBooks-linked when `qbo`). */
export interface BankColumn {
  id: number;
  name: string;
  type: CustomColumnType;
  minChars: number | null;
  maxChars: number | null;
  required: boolean;
  options: Array<{ id: number; label: string }>;
  qbo: 'CLASS' | 'FIELD' | 'LOCATION' | 'CUSTOMER' | null;
}

export interface BankTransactionPage {
  rows: BankTransactionRow[];
  nextOffset: number | null;
}

export interface BankCategory {
  name: string;
  type: string;
  custom: boolean;
}

const base = (companyId: number) => `/api/companies/${companyId}/bank-transactions`;

async function call<T>(token: string, url: string, init: RequestInit, fallback: string) {
  const res = await fetchWithAuth(token, url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(msg || fallback);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function fetchBankTransactions(
  token: string,
  companyId: number,
  offset: number,
  q: string,
): Promise<BankTransactionPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: '100' });
  if (q.trim()) params.set('q', q.trim());
  return call(token, `${base(companyId)}?${params}`, {}, 'Failed to load bank transactions');
}

export function fetchBankCategories(token: string, companyId: number): Promise<BankCategory[]> {
  return call(token, `${base(companyId)}/categories`, {}, 'Failed to load categories');
}

export function editBankTransaction(
  token: string,
  companyId: number,
  id: number,
  body: { name?: string; category?: string; scope: 'ALWAYS' | 'ONCE' },
): Promise<void> {
  return call(
    token,
    `${base(companyId)}/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    'Could not save the change',
  );
}

export function fetchBankColumns(token: string, companyId: number): Promise<BankColumn[]> {
  return call(token, `${base(companyId)}/custom-columns`, {}, 'Failed to load the columns');
}

/** One cell of a transaction / split; answers the row's cells. */
export function saveBankAnswer(
  token: string,
  companyId: number,
  id: number,
  columnId: number,
  body: { value: string | null; dropDownId: number | null },
): Promise<Record<number, BankCell>> {
  return call(
    token,
    `${base(companyId)}/${id}/custom/${columnId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    'Could not save the answer',
  );
}
