import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../components/Login/LoginPage';
import { DashboardPage } from '../components/Dashboard/DashboardPage';
import { UsersPage } from '../components/Users/UsersPage';
import { UserDetailPage } from '../components/Users/UserDetailPage';
import { RegisterPage } from '../components/Register/RegisterPage';
import { CompanyDetailPage } from '../components/Companies/CompanyDetailPage';
import { TasksPage } from '../components/Tasks/TasksPage';
import { CompanySettingsPage } from '../components/CompanySettings/CompanySettingsPage';
import { ArchivedPage } from '../components/Archive/ArchivedPage';
import { AppLayout } from '../components/Layout/AppLayout';
import { PrivateRoute } from './PrivateRoute';
import { AdminRoute } from './AdminRoute';
import { SuperAdminRoute } from './SuperAdminRoute';
import { PrivacyPage } from '../components/Legal/PrivacyPage';
import { TermsPage } from '../components/Legal/TermsPage';
import { SmsOptInPage } from '../components/Legal/SmsOptInPage';
import { GmailSuccessPage } from '../components/Gmail/GmailSuccessPage';
import { GmailErrorPage } from '../components/Gmail/GmailErrorPage';
import { MicrosoftSuccessPage } from '../components/Microsoft/MicrosoftSuccessPage';
import { MicrosoftErrorPage } from '../components/Microsoft/MicrosoftErrorPage';
// PHASE 2a SPIKE — throwaway, remove with SipSpikePage.
import { SipSpikePage } from '../components/Phone/SipSpikePage';

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
    // PHASE 2a SPIKE — throwaway. Unauthenticated on purpose: it takes its SIP
    // credentials from the query string, so there is nothing here to protect.
    path: '/sip-spike',
    element: <SipSpikePage />,
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
    // Published for A2P 10DLC campaign registration: The Campaign Registry vets this
    // page before approving a messaging campaign. Public and standalone, like its two
    // siblings above -- a route left out of this array does NOT 404, it falls to the
    // catch-all and lands an unauthenticated visitor on /login.
    path: '/sms-opt-in',
    element: <SmsOptInPage />,
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
              { path: '/admin/users', element: <UsersPage /> },
              { path: '/admin/users/:id', element: <UserDetailPage /> },
              { path: '/admin/archived', element: <ArchivedPage /> },
            ],
          },
          // ADMIN only. A manager reaching these by typing the URL is bounced to
          // the dashboard, which is what makes hiding the two sidebar links a
          // presentation detail rather than the access control itself.
          {
            element: <SuperAdminRoute />,
            children: [
              { path: '/admin/tasks', element: <TasksPage /> },
              { path: '/admin/company-settings', element: <CompanySettingsPage /> },
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
