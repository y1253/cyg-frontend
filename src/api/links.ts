import { fetchWithAuth } from './client';

const API = '/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface CompanyLink {
  id: number;
  companyId: number;
  label: string;
  url: string;
  username: string | null;
  // Returned already DECRYPTED (plaintext) for the eye-reveal toggle. Any
  // authenticated user may view it. Sent back encrypted server-side on write.
  password: string | null;
  note: string | null;
}

export async function fetchLinks(token: string, companyId: number): Promise<CompanyLink[]> {
  const res = await fetchWithAuth(token, `${API}/links/company/${companyId}`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw new Error('Failed to fetch links');
  return res.json() as Promise<CompanyLink[]>;
}

export async function createLink(
  token: string,
  data: {
    companyId: number;
    label: string;
    url: string;
    username?: string;
    password?: string;
    note?: string;
  },
): Promise<CompanyLink> {
  const res = await fetchWithAuth(token, `${API}/links`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to create link');
  }
  return res.json() as Promise<CompanyLink>;
}

export async function updateLink(
  token: string,
  id: number,
  data: {
    label?: string;
    url?: string;
    username?: string;
    password?: string;
    note?: string;
  },
): Promise<CompanyLink> {
  const res = await fetchWithAuth(token, `${API}/links/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update link');
  }
  return res.json() as Promise<CompanyLink>;
}

export async function deleteLink(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/links/${id}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete link');
  }
}
