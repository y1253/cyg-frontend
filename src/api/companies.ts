import { fetchWithAuth } from './client';

const API = '/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ─── Register ────────────────────────────────────────────────────────────────

export interface RegisterCompanyData {
  hasQbAccount: boolean;
  qbPlan?: string;
  country: string;
  businessName: string;
  businessType?: string;
  companyType?: string;
  companyActivity?: string;
  personalName?: string;
  privateEmail?: string;
  privatePhone?: string;
  storeNumber?: string;
  neq?: string;
  revenueQcId?: string;
  craBn?: string;
  fiscalYear?: string;
  billingEmail?: string;
  billingPassword?: string;
  accountantName?: string;
  accountantEmail?: string;
  accountantPhone?: string;
  reconciliationAccounts?: { name: string; type: string; startDate: string }[];
  apManageBills?: boolean;
  apStartDate?: string;
  apCycleType?: string;
  apCycle?: number;
  apCycleDay?: number;
  apCycleNth?: number;
  arInvoicingEnabled?: boolean;
  arInvoicingCycleType?: string;
  arInvoicingCycle?: number;
  arInvoicingCycleDay?: number;
  arInvoicingCycleNth?: number;
  arInvoicingNote?: string;
  arStatementsEnabled?: boolean;
  arStatementsCycleType?: string;
  arStatementsCycle?: number;
  arStatementsCycleDay?: number;
  arStatementsCycleNth?: number;
  arStatementsNote?: string;
  arCollectionEnabled?: boolean;
  arCollectionCycleType?: string;
  arCollectionCycle?: number;
  arCollectionCycleDay?: number;
  arCollectionCycleNth?: number;
  arCollectionNote?: string;
  arReportEnabled?: boolean;
  arReportCycleType?: string;
  arReportCycle?: number;
  arReportCycleDay?: number;
  arReportCycleNth?: number;
  arReportNote?: string;
  payrollEnabled?: boolean;
  payrollCycleType?: string;
  payrollCycle?: number;
  payrollCycleDay?: number;
  payrollCycleNth?: number;
  payrollNote?: string;
  payrollTaxEnabled?: boolean;
  payrollTaxRegion?: string;
  payrollTaxCycleType?: string;
  payrollTaxCycle?: number;
  payrollTaxCycleDay?: number;
  payrollTaxCycleNth?: number;
  payrollTaxNote?: string;
  payrollYearEndEnabled?: boolean;
  payrollYearEndRl1?: boolean;
  payrollYearEndT4?: boolean;
  payrollYearEndCnesst?: boolean;
  locationVisitEnabled?: boolean;
  locationVisitFrequency?: string;
  qcDocsEnabled?: boolean;
  qcDocsNote?: string;
  craDocsEnabled?: boolean;
  craDocsNote?: string;
  salesTaxEnabled?: boolean;
  salesTaxNote?: string;
  cashFlowEnabled?: boolean;
  cashFlowCycleType?: string;
  cashFlowCycle?: number;
  cashFlowCycleDay?: number;
  cashFlowCycleNth?: number;
  cashFlowNote?: string;
  creditCardEnabled?: boolean;
  creditCardCycleType?: string;
  creditCardCycle?: number;
  creditCardCycleDay?: number;
  creditCardCycleNth?: number;
  creditCardNote?: string;
  creditCardLimitEnabled?: boolean;
  creditCardLimitCycleType?: string;
  creditCardLimitCycle?: number;
  creditCardLimitCycleDay?: number;
  creditCardLimitCycleNth?: number;
  creditCardLimitAmount?: string;
  receiptTrackingEnabled?: boolean;
  receiptTrackingCycleType?: string;
  receiptTrackingCycle?: number;
  receiptTrackingCycleDay?: number;
  receiptTrackingCycleNth?: number;
  receiptTrackingNote?: string;
  cardHolderName?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
}

export interface RegisterCompanyResponse {
  id: number;
  businessName: string;
}

export async function registerCompany(
  data: RegisterCompanyData,
): Promise<RegisterCompanyResponse> {
  const res = await fetch(`${API}/companies/register`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Registration failed');
  }
  return res.json() as Promise<RegisterCompanyResponse>;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface AssignedUser {
  id: number;
  name: string;
  email: string;
}

// ─── Company list ─────────────────────────────────────────────────────────────

export interface CompanySummary {
  id: number;
  businessName: string;
  supportNumber: string | null;
  country: string | null;
  status: boolean;
  createdAt: string;
  assignedUser: AssignedUser | null;
  totalTodos: number;
  urgentTodos: number;
  overdueTodos: number;
  importantTodos: number;
}

export async function fetchCompanies(token: string): Promise<CompanySummary[]> {
  const res = await fetchWithAuth(token, `${API}/companies`, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch companies');
  return res.json() as Promise<CompanySummary[]>;
}

// ─── Company detail ───────────────────────────────────────────────────────────

export interface TodoItem {
  id: number;
  scheduleId: number | null;
  dueDate: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  snoozedUntil: string | null;
  task: { id: number; title: string; description: string | null; isSnoozable: boolean };
}

export interface CompanyDetail {
  id: number;
  businessName: string;
  supportNumber: string | null;
  country: string | null;
  qbPlan: string | null;
  businessType: string | null;
  companyType: string | null;
  companyActivity: string | null;
  status: boolean;
  createdAt: string;
  deletedAt: string | null;
  contactInfo: {
    personalName: string | null;
    privateEmail: string | null;
    privatePhone: string | null;
    storeNumber: string | null;
  } | null;
  legalInfo: {
    neq: string | null;
    revenueQcId: string | null;
    craBn: string | null;
    fiscalYear: string | null;
  } | null;
  accountant: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  billing: {
    billingEmail: string | null;
    billingPassword: string | null;
  } | null;
  assignedUser: AssignedUser | null;
  todos: TodoItem[];
}

export async function fetchCompany(token: string, id: number): Promise<CompanyDetail> {
  const res = await fetchWithAuth(token, `${API}/companies/${id}`, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch company');
  return res.json() as Promise<CompanyDetail>;
}

// ─── Update company ───────────────────────────────────────────────────────────

export interface UpdateCompanyData {
  supportNumber?: string;
  businessName?: string;
  businessType?: string;
  companyType?: string;
  companyActivity?: string;
  country?: string;
  qbPlan?: string;
  personalName?: string;
  privateEmail?: string;
  privatePhone?: string;
  storeNumber?: string;
  neq?: string;
  revenueQcId?: string;
  craBn?: string;
  fiscalYear?: string;
  accountantName?: string;
  accountantEmail?: string;
  accountantPhone?: string;
  billingEmail?: string;
  billingPassword?: string;
}

export async function updateCompany(
  token: string,
  id: number,
  data: UpdateCompanyData,
): Promise<{ id: number }> {
  const res = await fetchWithAuth(token, `${API}/companies/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update company');
  }
  return res.json() as Promise<{ id: number }>;
}

// ─── Delete company ──────────────────────────────────────────────────────────

export async function deleteCompany(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/companies/${id}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete company');
  }
}

// ─── Deleted companies ────────────────────────────────────────────────────────

export interface DeletedCompanySummary {
  id: number;
  businessName: string;
  country: string | null;
  businessType: string | null;
  deletedAt: string;
}

export async function fetchDeletedCompanies(token: string): Promise<DeletedCompanySummary[]> {
  const res = await fetchWithAuth(token, `${API}/companies/deleted`, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch deleted companies');
  return res.json() as Promise<DeletedCompanySummary[]>;
}

export async function restoreCompany(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/companies/${id}/restore`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to restore company');
  }
}

export async function permanentDeleteCompany(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/companies/${id}/permanent`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to permanently delete company');
  }
}

// ─── Assign user ─────────────────────────────────────────────────────────────

export async function assignCompanyUser(
  token: string,
  companyId: number,
  userId: number | null,
): Promise<{ ok: boolean }> {
  const res = await fetchWithAuth(token, `${API}/companies/${companyId}/assign`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to assign user');
  }
  return res.json() as Promise<{ ok: boolean }>;
}
