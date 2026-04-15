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
