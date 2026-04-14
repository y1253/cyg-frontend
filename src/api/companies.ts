const API = '/api';

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
