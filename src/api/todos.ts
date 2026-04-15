const API = '/api';

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export interface ResolveResponse {
  id: number;
  resolved: boolean;
  resolvedAt: string | null;
}

export async function resolveTodo(token: string, id: number): Promise<ResolveResponse> {
  const res = await fetch(`${API}/todos/${id}/resolve`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update task');
  }
  return res.json() as Promise<ResolveResponse>;
}

export async function deleteTodo(token: string, id: number): Promise<void> {
  const res = await fetch(`${API}/todos/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete task');
  }
}

export async function setTodoCycle(token: string, id: number, cycle: number): Promise<void> {
  const res = await fetch(`${API}/todos/${id}/set-cycle`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ cycle }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to set cycle');
  }
}

export async function removeTodoCycle(token: string, id: number): Promise<void> {
  const res = await fetch(`${API}/todos/${id}/remove-cycle`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to remove cycle');
  }
}
