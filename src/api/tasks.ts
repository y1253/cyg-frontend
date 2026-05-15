import { fetchWithAuth } from './client';

const API = '/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type TaskCycleType = 'DAYS' | 'MONTHLY_DATE' | 'WEEKLY_DAY' | 'MONTHLY_WEEKDAY' | 'QUARTERLY' | 'YEARLY';

export interface AppTask {
  id: number;
  title: string;
  description: string | null;
  note: string | null;
  isGeneral: boolean;
  defaultCycle: number;
  defaultCycleType?: TaskCycleType;
  defaultCycleDay?: number | null;
  defaultCycleNth?: number | null;
  isImportant: boolean;
  canBeDisabled: boolean;
  isSnoozable: boolean;
  createdAt: string;
  openTodos: number;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  isGeneral?: boolean;
  defaultCycle?: number;
  defaultCycleType?: TaskCycleType;
  defaultCycleDay?: number;
  defaultCycleNth?: number;
  isImportant?: boolean;
  canBeDisabled?: boolean;
  isSnoozable?: boolean;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  isGeneral?: boolean;
  defaultCycle?: number;
  defaultCycleType?: TaskCycleType;
  defaultCycleDay?: number;
  defaultCycleNth?: number;
  isImportant?: boolean;
  canBeDisabled?: boolean;
  isSnoozable?: boolean;
}

export interface AssignTaskData {
  companyId: number;
  dueDate?: string;
  cycle?: number;
  note?: string;
}

async function throwOnError(res: Response) {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Request failed'));
  }
}

export async function fetchTasks(token: string): Promise<AppTask[]> {
  const res = await fetchWithAuth(token, `${API}/tasks`, { headers: JSON_HEADERS });
  await throwOnError(res);
  return res.json() as Promise<AppTask[]>;
}

export async function createTask(token: string, data: CreateTaskData): Promise<AppTask> {
  const res = await fetchWithAuth(token, `${API}/tasks`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  await throwOnError(res);
  return res.json() as Promise<AppTask>;
}

export async function updateTask(token: string, id: number, data: UpdateTaskData): Promise<AppTask> {
  const res = await fetchWithAuth(token, `${API}/tasks/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  await throwOnError(res);
  return res.json() as Promise<AppTask>;
}

export async function deleteTask(token: string, id: number): Promise<{ id: number }> {
  const res = await fetchWithAuth(token, `${API}/tasks/${id}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  await throwOnError(res);
  return res.json() as Promise<{ id: number }>;
}

export async function assignTask(token: string, taskId: number, data: AssignTaskData): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/tasks/${taskId}/assign`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  await throwOnError(res);
}
