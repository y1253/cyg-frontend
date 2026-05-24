import { fetchWithAuth } from './client';

const BASE = '/api/task-schedules';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type CycleType = 'DAYS' | 'MONTHLY_DATE' | 'WEEKLY_DAY' | 'MONTHLY_WEEKDAY' | 'QUARTERLY' | 'YEARLY';

export interface AppTaskSchedule {
  id: number;
  taskId: number;
  companyId: number;
  cycle: number;
  cycleType: CycleType;
  cycleDay: number | null;
  cycleNth: number | null;
  note: string | null;
  userNote: string | null;
  isImportant: boolean;
  startDate: string | null;
  nextTodoDate: string | null;
  createdAt: string;
  deletedAt: string | null;
  isManuallyAdded: boolean;
  task: { id: number; title: string; description: string | null; canBeDisabled: boolean };
}

export async function fetchSchedulesByCompany(token: string, companyId: number): Promise<AppTaskSchedule[]> {
  const res = await fetchWithAuth(token, `${BASE}?companyId=${companyId}`);
  if (!res.ok) throw new Error('Failed to load schedules');
  return res.json();
}

export async function createSchedule(
  token: string,
  data: {
    taskId: number;
    companyId: number;
    cycle?: number;
    cycleType?: CycleType;
    cycleDay?: number;
    cycleNth?: number;
    note?: string;
    startDate?: string;
  },
): Promise<AppTaskSchedule> {
  const res = await fetchWithAuth(token, BASE, {
    method: 'POST',
    headers: JSON_HEADERS,
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
  data: {
    cycle?: number;
    cycleType?: CycleType;
    cycleDay?: number | null;
    cycleNth?: number | null;
    note?: string | null;
    startDate?: string | null;
  },
): Promise<AppTaskSchedule> {
  const res = await fetchWithAuth(token, `${BASE}/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to update schedule');
  }
  return res.json();
}

export async function toggleSchedule(token: string, id: number): Promise<AppTaskSchedule> {
  const res = await fetchWithAuth(token, `${BASE}/${id}/toggle`, { method: 'PATCH' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to toggle schedule');
  }
  return res.json();
}

export async function toggleScheduleImportant(token: string, id: number): Promise<{ id: number; isImportant: boolean }> {
  const res = await fetchWithAuth(token, `${BASE}/${id}/toggle-important`, { method: 'PATCH' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to toggle important');
  }
  return res.json();
}

export async function updateScheduleUserNote(token: string, id: number, note: string | null): Promise<void> {
  const res = await fetchWithAuth(token, `${BASE}/${id}/user-note`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ note: note ?? undefined }),
  });
  if (!res.ok) throw new Error('Failed to update note');
}

export async function deleteSchedule(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to delete schedule');
  }
}
