import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '@/lib/roles';

/**
 * ADMIN only — the two firm-wide pages a MANAGER deliberately does not get:
 * the task-template library and the global phone configuration. Everything else
 * under `/admin` uses `AdminRoute`, which admits managers too.
 */
export function SuperAdminRoute() {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (!isSuperAdmin(user)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
