import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canManage } from '@/lib/roles';

/** Admin-tier pages: ADMIN or MANAGER. */
export function AdminRoute() {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (!canManage(user)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
