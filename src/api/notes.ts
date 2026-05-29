import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface CompanyNote {
  id: number;
  companyId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchNotes(token: string, companyId: number): Promise<CompanyNote[]> {
  const res = await fetchWithAuth(token, `${API}/notes/company/${companyId}`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json() as Promise<CompanyNote[]>;
}

export async function createNote(
  token: string,
  data: { companyId: number; content: string },
): Promise<CompanyNote> {
  const res = await fetchWithAuth(token, `${API}/notes`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to create note');
  }
  return res.json() as Promise<CompanyNote>;
}

export async function updateNote(
  token: string,
  id: number,
  data: { content: string },
): Promise<CompanyNote> {
  const res = await fetchWithAuth(token, `${API}/notes/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update note');
  }
  return res.json() as Promise<CompanyNote>;
}

export async function deleteNote(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/notes/${id}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete note');
  }
}
