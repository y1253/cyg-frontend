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
  /**
   * The staff member's own phone, E.164, or null when they have none on file.
   *
   * Optional (`?`) like the face flags, and for the same reason: the server can deploy
   * ahead of the client.
   *
   * An inbound call for a company this user is assigned to also rings this number, when
   * that company's "Also ring the assignee's mobile" setting is on.
   */
  phoneE164?: string | null;
  createdAt: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  role: string;
  /** E.164, or omitted. The server validates strictly — this number gets DIALLED. */
  phoneE164?: string;
}

/** `ADMIN` → `Admin`. Roles come from the Prisma enum, so they arrive SHOUTING. */
export function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

/**
 * Badge tone per role. MANAGER needs its own tone: it is an admin-tier role, so
 * letting it fall into the same `secondary` as USER would read as "not staff" at a
 * glance -- exactly the distinction the badge exists to make.
 */
export function roleBadgeVariant(role: string): 'default' | 'outline' | 'secondary' {
  if (role === 'ADMIN') return 'default';
  if (role === 'MANAGER') return 'outline';
  return 'secondary';
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

/**
 * The caller's own profile.
 *
 * Same shape as `fetchUser`, because the server reuses `findOne` for it — so the profile
 * page and the admin detail page render from one type and cannot drift. The id is taken
 * from the JWT server-side; there is deliberately none to pass.
 */
export async function fetchMyProfile(token: string): Promise<AppUserDetail> {
  const res = await fetchWithAuth(token, `${API}/users/me`, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch your profile');
  return res.json() as Promise<AppUserDetail>;
}

/**
 * The one field a user may change about themselves.
 *
 * `null` CLEARS the number; the server's `!== undefined` gate is what makes that distinct
 * from "leave it alone", so the key is always sent. There is no `name`/`email`/`role` here
 * and there must not be — the server's DTO would drop them anyway, and a parameter that
 * silently does nothing is worse than one that does not exist.
 *
 * ⚠️ Resolves to `AppUser`, NOT `AppUserDetail`: the server answers from `update()`, whose
 * `USER_SELECT` projection carries no `companies`. So the caller must INVALIDATE `['me']`
 * rather than write this straight into that cache, or the profile's company list blanks
 * itself as a side effect of saving a phone number — the same failure `USER_SELECT`'s own
 * docblock describes for `enrollFace`.
 */
export async function updateMyPhone(
  token: string,
  phoneE164: string | null,
): Promise<AppUser> {
  const res = await fetchWithAuth(token, `${API}/users/me`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ phoneE164 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Failed to save your phone number');
  }
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
  /** `null` CLEARS the number; an absent key leaves it alone. */
  phoneE164?: string | null;
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
