import type { FaceBox } from './auth';
import { fetchWithAuth } from './client';

const API = '/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface AppUser {
  id: number;
  name: string;
  email: string;
  /** True once the user has a Luxand identity enrolled. */
  faceEnrolled?: boolean;
  faceEnrolledAt?: string | null;
  role: string;
  createdAt: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  role: string;
}

/** `ADMIN` → `Admin`. Roles come from the Prisma enum, so they arrive SHOUTING. */
export function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export async function fetchRoles(token: string): Promise<string[]> {
  const res = await fetchWithAuth(token, `${API}/users/roles`, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json() as Promise<string[]>;
}

export async function fetchUsers(token: string): Promise<AppUser[]> {
  const res = await fetchWithAuth(token, `${API}/users`, { headers: JSON_HEADERS });
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
  const res = await fetchWithAuth(token, `${API}/users/${id}`, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json() as Promise<AppUserDetail>;
}

export async function createUser(token: string, data: CreateUserData): Promise<AppUser> {
  const res = await fetchWithAuth(token, `${API}/users`, {
    method: 'POST',
    headers: JSON_HEADERS,
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
}

export async function updateUser(token: string, id: number, data: UpdateUserData): Promise<AppUser> {
  const res = await fetchWithAuth(token, `${API}/users/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Failed to update user');
  }
  return res.json() as Promise<AppUser>;
}

export async function deleteUser(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/users/${id}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete user');
  }
}

export async function enrollFace(
  token: string,
  userId: number,
  blobs: [Blob, Blob, Blob],
  /**
   * Face rectangles, index-aligned with `blobs`. Enrolment is cropped the same
   * way the login probe is: the stored gallery is what every later sign-in is
   * compared against, so the two must not be prepared differently.
   */
  boxes?: (FaceBox | undefined)[],
): Promise<AppUser> {
  const form = new FormData();
  // JSON.stringify turns a missing entry into `null`, which is exactly what the
  // server's parser reads as "no box for this photo".
  if (boxes?.some(Boolean)) {
    form.append('boxes', JSON.stringify(blobs.map((_, i) => boxes[i] ?? null)));
  }
  blobs.forEach(b => form.append('photos', b, 'capture.jpg'));
  const res = await fetchWithAuth(token, `${API}/users/${userId}/enroll-face`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Face enrollment failed');
  }
  return res.json() as Promise<AppUser>;
}
