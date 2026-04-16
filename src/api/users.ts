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

export interface UserCompany {
  id: number;
  businessName: string;
  country: string | null;
  status: boolean;
  supportNumber: string | null;
  openTodos: number;
}

export interface AppUserDetail extends AppUser {
  deletedAt: string | null;
  updatedAt: string;
  companies: UserCompany[];
}

export async function fetchUser(token: string, id: number): Promise<AppUserDetail> {
  const res = await fetch(`${API}/users/${id}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json() as Promise<AppUserDetail>;
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

export interface UpdateUserData {
  name?: string;
  email?: string;
  role?: string;
  password?: string;
}

export async function updateUser(token: string, id: number, data: UpdateUserData): Promise<AppUser> {
  const res = await fetch(`${API}/users/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Failed to update user');
  }
  return res.json() as Promise<AppUser>;
}

export async function deleteUser(token: string, id: number): Promise<void> {
  const res = await fetch(`${API}/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete user');
  }
}
