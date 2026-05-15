import { fetchWithAuth } from './client';

const API = '/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface ResolveResponse {
  id: number;
  resolved: boolean;
  resolvedAt: string | null;
}

export async function resolveTodo(token: string, id: number): Promise<ResolveResponse> {
  const res = await fetchWithAuth(token, `${API}/todos/${id}/resolve`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update task');
  }
  return res.json() as Promise<ResolveResponse>;
}

export async function deleteTodo(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/todos/${id}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete task');
  }
}

export async function setTodoCycle(token: string, id: number, cycle: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/todos/${id}/set-cycle`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ cycle }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to set cycle');
  }
}

export async function removeTodoCycle(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/todos/${id}/remove-cycle`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to remove cycle');
  }
}

export async function snoozeTodo(token: string, id: number, days: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/todos/${id}/snooze`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ days }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to snooze');
  }
}

export async function unsnoozeTodo(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/todos/${id}/unsnooze`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to unsnooze');
  }
}
