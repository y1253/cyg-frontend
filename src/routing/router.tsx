import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../components/Login/LoginPage';
import { DashboardPage } from '../components/Dashboard/DashboardPage';
import { UsersPage } from '../components/Users/UsersPage';
import { RegisterPage } from '../components/Register/RegisterPage';
import { PrivateRoute } from './PrivateRoute';
import { AdminRoute } from './AdminRoute';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    element: <PrivateRoute />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
    ],
  },
  {
    element: <AdminRoute />,
    children: [
      { path: '/admin/users', element: <UsersPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
