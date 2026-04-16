import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../components/Login/LoginPage';
import { DashboardPage } from '../components/Dashboard/DashboardPage';
import { UsersPage } from '../components/Users/UsersPage';
import { UserDetailPage } from '../components/Users/UserDetailPage';
import { RegisterPage } from '../components/Register/RegisterPage';
import { CompanyDetailPage } from '../components/Companies/CompanyDetailPage';
import { TasksPage } from '../components/Tasks/TasksPage';
import { AppLayout } from '../components/Layout/AppLayout';
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
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/companies/:id', element: <CompanyDetailPage /> },
          {
            element: <AdminRoute />,
            children: [
              { path: '/admin/tasks', element: <TasksPage /> },
              { path: '/admin/users', element: <UsersPage /> },
              { path: '/admin/users/:id', element: <UserDetailPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
