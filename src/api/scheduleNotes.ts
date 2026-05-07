const BASE = '/api/schedule-notes';

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function upsertScheduleNote(token: string, scheduleId: number, note: string): Promise<void> {
  const res = await fetch(`${BASE}/${scheduleId}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? 'Failed to save note');
  }
}

export async function deleteScheduleNote(token: string, scheduleId: number): Promise<void> {
  const res = await fetch(`${BASE}/${scheduleId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? 'Failed to delete note');
  }
}
