const API = '/api';

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export interface AppTask {
  id: number;
  title: string;
  description: string | null;
  isGeneral: boolean;
  createdAt: string;
  openTodos: number;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  isGeneral?: boolean;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  isGeneral?: boolean;
}

export interface AssignTaskData {
  companyId: number;
  dueDate?: string;
  cycle?: number;
}

async function throwOnError(res: Response) {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Request failed'));
  }
}

export async function fetchTasks(token: string): Promise<AppTask[]> {
  const res = await fetch(`${API}/tasks`, { headers: authHeaders(token) });
  await throwOnError(res);
  return res.json() as Promise<AppTask[]>;
}

export async function createTask(token: string, data: CreateTaskData): Promise<AppTask> {
  const res = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  await throwOnError(res);
  return res.json() as Promise<AppTask>;
}

export async function updateTask(token: string, id: number, data: UpdateTaskData): Promise<AppTask> {
  const res = await fetch(`${API}/tasks/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  await throwOnError(res);
  return res.json() as Promise<AppTask>;
}

export async function deleteTask(token: string, id: number): Promise<{ id: number }> {
  const res = await fetch(`${API}/tasks/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await throwOnError(res);
  return res.json() as Promise<{ id: number }>;
}

export async function assignTask(token: string, taskId: number, data: AssignTaskData): Promise<void> {
  const res = await fetch(`${API}/tasks/${taskId}/assign`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  await throwOnError(res);
}
