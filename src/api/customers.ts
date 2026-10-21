import { fetchWithAuth } from './client';

const API = '/api';

/**
 * The PUBLIC site's customers (cygfinance.com) — not staff, not client companies. ADMIN
 * only and read-only: the tables belong to the customer app.
 */
export type CustomerAuthType = 'PASSWORD' | 'GOOGLE';

export interface CustomerSummary {
  id: number;
  name: string;
  email: string;
  authType: CustomerAuthType;
  phone: string | null;
  /** How they prefer to be contacted (set on cygfinance.com, step12); null = not chosen. */
  preferredContact?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'CALL' | null;
  avatarUrl: string | null;
  /** Signed up. */
  createdAt: string;
  lastLoginAt: string | null;
  deletedAt: string | null;
  salesTaxEnabled: boolean;
  /** Uploaded, not deleted. */
  statementCount: number;
  /** Rows on statements that were read (DONE). */
  transactionCount: number;
  lastUploadAt: string | null;
}

export type StatementStatus =
  | 'UPLOADED'
  | 'PENDING'
  | 'PROCESSING'
  | 'DONE'
  | 'FAILED'
  | 'NEEDS_REVIEW';

export interface CustomerStatement {
  id: number;
  filename: string;
  sizeBytes: number;
  status: StatementStatus;
  error: string | null;
  bankName: string | null;
  accountName: string | null;
  /** `YYYY-MM-DD` — a date, never a moment. */
  periodStart: string | null;
  periodEnd: string | null;
  transactionCount: number;
  /** VERIFIED | UNVERIFIED | MISMATCH — the self-check, never shown to the customer. */
  verification: string | null;
  attempts: number;
  runs: number;
  /** Uploaded. */
  createdAt: string;
  /** Read by the AI. */
  processedAt: string | null;
  deletedAt: string | null;
}

export interface CustomerTaxAgency {
  id: number;
  name: string;
  active: boolean;
  rates: Array<{ kind: 'SALES' | 'PURCHASE'; rate: number }>;
}

export interface CustomerDetail extends Omit<
  CustomerSummary,
  'statementCount' | 'transactionCount' | 'lastUploadAt'
> {
  taxAgencies: CustomerTaxAgency[];
  statements: CustomerStatement[];
}

export interface StatementTransaction {
  id: number;
  pendingDate: string | null;
  postingDate: string | null;
  name: string | null;
  description: string;
  /** Signed: > 0 money in. */
  amount: number;
  balanceAfter: number | null;
  offsetAccount: string;
  debitAccount: string;
  creditAccount: string;
}

async function getJson<T>(token: string, url: string, what: string): Promise<T> {
  const res = await fetchWithAuth(token, url);
  if (!res.ok) throw new Error(`Failed to fetch ${what}`);
  return res.json() as Promise<T>;
}

export const fetchCustomers = (token: string) =>
  getJson<CustomerSummary[]>(token, `${API}/customers`, 'customers');

export const fetchCustomer = (token: string, id: number) =>
  getJson<CustomerDetail>(token, `${API}/customers/${id}`, 'customer');

export const fetchStatementTransactions = (
  token: string,
  customerId: number,
  statementId: number,
) =>
  getJson<StatementTransaction[]>(
    token,
    `${API}/customers/${customerId}/statements/${statementId}/transactions`,
    'transactions',
  );

/**
 * Opens the statement PDF in a new tab. The route is guarded, so the bytes come as a
 * blob; the tab is opened BEFORE the await so a popup blocker still counts the click.
 */
export async function openStatementPdf(
  token: string,
  customerId: number,
  statementId: number,
): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const res = await fetchWithAuth(
      token,
      `${API}/customers/${customerId}/statements/${statementId}/file`,
    );
    if (!res.ok) throw new Error('The original file is no longer available');
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
