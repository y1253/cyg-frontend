const API = '/api';

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export interface CompanyNote {
  id: number;
  companyId: number;
  userId: number;
  title: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchNotes(token: string, companyId: number): Promise<CompanyNote[]> {
  const res = await fetch(`${API}/notes/company/${companyId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json() as Promise<CompanyNote[]>;
}

export async function createNote(
  token: string,
  data: { companyId: number; title: string; note: string },
): Promise<CompanyNote> {
  const res = await fetch(`${API}/notes`, {
    method: 'POST',
    headers: authHeaders(token),
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
  data: { title?: string; note?: string },
): Promise<CompanyNote> {
  const res = await fetch(`${API}/notes/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update note');
  }
  return res.json() as Promise<CompanyNote>;
}

export async function deleteNote(token: string, id: number): Promise<void> {
  const res = await fetch(`${API}/notes/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete note');
  }
}
