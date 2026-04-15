const API = '/api';

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Registration failed');
  }
  return res.json() as Promise<RegisterCompanyResponse>;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export interface AssignedUser {
  id: number;
  name: string;
  email: string;
}

// ─── Company list ─────────────────────────────────────────────────────────────

export interface CompanySummary {
  id: number;
  businessName: string;
  country: string | null;
  status: boolean;
  createdAt: string;
  assignedUser: AssignedUser | null;
  totalTodos: number;
  urgentTodos: number;
  overdueTodos: number;
}

export async function fetchCompanies(token: string): Promise<CompanySummary[]> {
  const res = await fetch(`${API}/companies`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch companies');
  return res.json() as Promise<CompanySummary[]>;
}

// ─── Company detail ───────────────────────────────────────────────────────────

export interface TodoItem {
  id: number;
  dueDate: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  task: { id: number; title: string; description: string | null };
}

export interface CompanyDetail {
  id: number;
  businessName: string;
  country: string | null;
  qbPlan: string | null;
  businessType: string | null;
  companyType: string | null;
  companyActivity: string | null;
  status: boolean;
  createdAt: string;
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
  assignedUser: AssignedUser | null;
  todos: TodoItem[];
}

export async function fetchCompany(token: string, id: number): Promise<CompanyDetail> {
  const res = await fetch(`${API}/companies/${id}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch company');
  return res.json() as Promise<CompanyDetail>;
}

// ─── Assign user ─────────────────────────────────────────────────────────────

export async function assignCompanyUser(
  token: string,
  companyId: number,
  userId: number | null,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/companies/${companyId}/assign`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to assign user');
  }
  return res.json() as Promise<{ ok: boolean }>;
}
