import type { AuthUser } from '@/api/auth';

/**
 * The two role tiers the UI actually branches on.
 *
 * MANAGER is "an admin minus the two firm-wide admin pages" — the task-template
 * library (`/admin/tasks`) and the global phone configuration
 * (`/admin/company-settings`). Everything else an admin can do inside a company,
 * a manager can do too.
 *
 * They are named here once so the distinction is a deliberate choice at each call
 * site rather than a `role === 'ADMIN'` string scattered across forty files. The
 * server mirrors the split exactly: `canManage` ↔ `MANAGEMENT_ROLES` /
 * `isManagement()`, `isSuperAdmin` ↔ a bare `@Roles(Role.ADMIN)`.
 */
export function canManage(user: AuthUser | null | undefined): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MANAGER';
}

/** ADMIN only — the two pages a manager deliberately does not get. */
export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'ADMIN';
}
