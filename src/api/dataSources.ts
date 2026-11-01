import { fetchWithAuth } from './client';

/** step11: where a company's data lives (Details tab → "Where the data is"). */
export const DATA_SOURCE_KINDS = [
  'BOOKS',
  'INVOICES',
  'BANK',
  'PAYROLL',
  'DOCUMENTS',
  'OTHER',
] as const;
export type DataSourceKind = (typeof DATA_SOURCE_KINDS)[number];

export const DATA_SOURCE_KIND_LABEL: Record<DataSourceKind, string> = {
  BOOKS: 'Books',
  INVOICES: 'Invoices',
  BANK: 'Bank',
  PAYROLL: 'Payroll',
  DOCUMENTS: 'Documents',
  OTHER: 'Other',
};

export interface DataSource {
  id: number;
  kind: DataSourceKind;
  system: string;
  details: string | null;
  linkId: number | null;
  linkLabel: string | null;
  linkUrl: string | null;
  updatedAt: string;
}

export interface DataSourceInput {
  kind: DataSourceKind;
  system: string;
  details?: string;
  linkId?: number | null;
}

const base = (companyId: number) => `/api/companies/${companyId}/data-sources`;

async function call<T>(
  token: string,
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const res = await fetchWithAuth(token, url, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(msg || fallback);
  }
  return (await res.json()) as T;
}

export function fetchDataSources(token: string, companyId: number): Promise<DataSource[]> {
  return call(token, base(companyId), {}, 'Failed to load where the data is');
}

export function createDataSource(
  token: string,
  companyId: number,
  input: DataSourceInput,
): Promise<DataSource[]> {
  return call(
    token,
    base(companyId),
    { method: 'POST', body: JSON.stringify(input) },
    'Failed to save',
  );
}

export function updateDataSource(
  token: string,
  companyId: number,
  id: number,
  input: Partial<DataSourceInput>,
): Promise<DataSource[]> {
  return call(
    token,
    `${base(companyId)}/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    'Failed to save',
  );
}

export function deleteDataSource(
  token: string,
  companyId: number,
  id: number,
): Promise<DataSource[]> {
  return call(token, `${base(companyId)}/${id}`, { method: 'DELETE' }, 'Failed to delete');
}
