const BASE = '/api/task-schedules';

export interface AppTaskSchedule {
  id: number;
  taskId: number;
  companyId: number;
  cycle: number;
  note: string | null;
  isImportant: boolean;
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
  data: { taskId: number; companyId: number; cycle: number; note?: string },
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
  data: { cycle?: number; note?: string | null },
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

export async function toggleSchedule(token: string, id: number): Promise<AppTaskSchedule> {
  const res = await fetch(`${BASE}/${id}/toggle`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to toggle schedule');
  }
  return res.json();
}

export async function toggleScheduleImportant(token: string, id: number): Promise<{ id: number; isImportant: boolean }> {
  const res = await fetch(`${BASE}/${id}/toggle-important`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to toggle important');
  }
  return res.json();
}
