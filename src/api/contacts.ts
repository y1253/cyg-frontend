import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface Contact {
  id: number;
  companyId: number;
  name: string;
  /** As somebody typed it. This is what to DISPLAY. */
  phone: string;
  /**
   * The same number normalised — what an inbound caller is matched against, and what to
   * DIAL or text. Null when the raw value could not be resolved, which is a contact that
   * can be read but never matched; the UI says so rather than hiding it.
   */
  phoneE164: string | null;
  email: string | null;
  note: string | null;
  /**
   * `OWNER` | `STORE` | `ACCOUNTANT` when this row mirrors a field on the company's
   * Details tab, else null for a hand-made one. A seeded row is overwritten on the next
   * Details save, so the UI marks it rather than letting an edit quietly disappear.
   */
  autoSource: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInput {
  name: string;
  phone: string;
  email?: string | null;
  note?: string | null;
}

async function failure(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  const message = Array.isArray(body.message) ? body.message[0] : body.message;
  throw new Error(message ?? fallback);
}

export async function fetchContacts(
  token: string,
  companyId: number,
): Promise<Contact[]> {
  const res = await fetchWithAuth(token, `${API}/contacts/company/${companyId}`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) return failure(res, 'Failed to load contacts');
  return res.json() as Promise<Contact[]>;
}

export async function createContact(
  token: string,
  companyId: number,
  data: ContactInput,
): Promise<Contact> {
  const res = await fetchWithAuth(token, `${API}/contacts`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ companyId, ...data }),
  });
  if (!res.ok) return failure(res, 'Failed to save contact');
  return res.json() as Promise<Contact>;
}

export async function updateContact(
  token: string,
  id: number,
  data: Partial<ContactInput>,
): Promise<Contact> {
  const res = await fetchWithAuth(token, `${API}/contacts/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) return failure(res, 'Failed to save contact');
  return res.json() as Promise<Contact>;
}

export async function deleteContact(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/contacts/${id}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) return failure(res, 'Failed to delete contact');
}
