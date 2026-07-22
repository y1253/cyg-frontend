import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../components/Login/LoginPage';
import { DashboardPage } from '../components/Dashboard/DashboardPage';
import { UsersPage } from '../components/Users/UsersPage';
import { UserDetailPage } from '../components/Users/UserDetailPage';
import { RegisterPage } from '../components/Register/RegisterPage';
import { CompanyDetailPage } from '../components/Companies/CompanyDetailPage';
import { TasksPage } from '../components/Tasks/TasksPage';
import { ArchivedPage } from '../components/Archive/ArchivedPage';
import { AppLayout } from '../components/Layout/AppLayout';
import { PrivateRoute } from './PrivateRoute';
import { AdminRoute } from './AdminRoute';
import { PrivacyPage } from '../components/Legal/PrivacyPage';
import { TermsPage } from '../components/Legal/TermsPage';
import { GmailSuccessPage } from '../components/Gmail/GmailSuccessPage';
import { GmailErrorPage } from '../components/Gmail/GmailErrorPage';
import { MicrosoftSuccessPage } from '../components/Microsoft/MicrosoftSuccessPage';
import { MicrosoftErrorPage } from '../components/Microsoft/MicrosoftErrorPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/gmail/success',
    element: <GmailSuccessPage />,
  },
  {
    path: '/gmail/error',
    element: <GmailErrorPage />,
  },
  {
    path: '/microsoft/success',
    element: <MicrosoftSuccessPage />,
  },
  {
    path: '/microsoft/error',
    element: <MicrosoftErrorPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/privacy',
    element: <PrivacyPage />,
  },
  {
    path: '/terms',
    element: <TermsPage />,
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
              { path: '/admin/archived', element: <ArchivedPage /> },
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
