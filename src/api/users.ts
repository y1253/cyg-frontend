const API = '/api';

export interface AppUser {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: string;
}

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function fetchRoles(token: string): Promise<string[]> {
  const res = await fetch(`${API}/users/roles`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json() as Promise<string[]>;
}

export async function fetchUsers(token: string): Promise<AppUser[]> {
  const res = await fetch(`${API}/users`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json() as Promise<AppUser[]>;
}

export async function createUser(token: string, data: CreateUserData): Promise<AppUser> {
  const res = await fetch(`${API}/users`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Failed to create user');
  }
  return res.json() as Promise<AppUser>;
}
