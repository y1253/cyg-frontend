import { fetchWithAuth } from './client';

const API = '/api';

export interface GmailAccount {
  gmailAddress: string;
  connectedAt: string;
}

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface EmailDetail extends EmailSummary {
  to: string;
  bodyHtml: string | null;
  bodyText: string | null;
}

export interface EmailListResult {
  messages: EmailSummary[];
  nextPageToken: string | null;
}

export async function fetchAuthUrl(token: string, companyId: number): Promise<{ authUrl: string }> {
  const res = await fetchWithAuth(token, `${API}/gmail/auth-url?companyId=${companyId}`);
  if (!res.ok) throw new Error('Failed to get auth URL');
  return res.json() as Promise<{ authUrl: string }>;
}

export async function fetchGmailAccount(
  token: string,
  companyId: number,
): Promise<GmailAccount | null> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/account`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch Gmail account');
  return res.json() as Promise<GmailAccount>;
}

export async function fetchEmails(
  token: string,
  companyId: number,
  pageToken?: string,
): Promise<EmailListResult> {
  const params = new URLSearchParams();
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetchWithAuth(
    token,
    `${API}/gmail/companies/${companyId}/emails?${params.toString()}`,
  );
  if (!res.ok) throw new Error('Failed to fetch emails');
  return res.json() as Promise<EmailListResult>;
}

export async function fetchEmail(
  token: string,
  companyId: number,
  messageId: string,
): Promise<EmailDetail> {
  const res = await fetchWithAuth(
    token,
    `${API}/gmail/companies/${companyId}/emails/${messageId}`,
  );
  if (!res.ok) throw new Error('Failed to fetch email');
  return res.json() as Promise<EmailDetail>;
}

export async function sendEmail(
  token: string,
  companyId: number,
  data: { to: string; subject: string; body: string },
): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to send email');
  }
}

export async function disconnectGmail(token: string, companyId: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/disconnect`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to disconnect Gmail');
}
