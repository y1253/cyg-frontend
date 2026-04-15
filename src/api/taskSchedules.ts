const BASE = '/api/task-schedules';

export interface AppTaskSchedule {
  id: number;
  taskId: number;
  companyId: number;
  cycle: number;
  createdAt: string;
  deletedAt: string | null;
  task: { id: number; title: string; description: string | null };
}

export async function fetchSchedulesByCompany(token: string, companyId: number): Promise<AppTaskSchedule[]> {
  const res = await fetch(`${BASE}?companyId=${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load schedules');
  return res.json();
}

export async function createSchedule(
  token: string,
  data: { taskId: number; companyId: number; cycle: number },
): Promise<AppTaskSchedule> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to create schedule');
  }
  return res.json();
}

export async function updateSchedule(
  token: string,
  id: number,
  data: { cycle: number },
): Promise<AppTaskSchedule> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to update schedule');
  }
  return res.json();
}

export async function deleteSchedule(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to delete schedule');
}
