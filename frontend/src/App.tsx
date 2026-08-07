import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from '@/hooks/useStore';
import { useAuth } from '@/hooks/useAuth';
import React, { useEffect, Suspense } from 'react';

import Layout from '@/app/Layout';
import Dashboard from '@/features/dashboard/Dashboard';
import IncidentsPage from '@/features/incidents/IncidentsPage';
import IncidentDetail from '@/features/incidents/IncidentDetail';
import HealingPage from '@/features/healing/HealingPage';
import SLOPage from '@/features/slo/SLOPage';
import AuthPage from '@/features/auth/AuthPage';
import TopologyPage from '@/features/topology/TopologyPage';
import LandingPage from '@/features/landing/LandingPage';
import LoadingFallback from '@/components/LoadingFallback';

const AlertingCenterPage = React.lazy(() => import('@/features/alerting/AlertingCenterPage'));
const CustomDashboardBuilderPage = React.lazy(() => import('@/features/dashboards/CustomDashboardBuilderPage'));
const LogsExplorerPage = React.lazy(() => import('@/features/logs/LogsExplorerPage'));
const TraceExplorerPage = React.lazy(() => import('@/features/traces/TraceExplorerPage'));
const CatalogPage = React.lazy(() => import('@/features/catalog/CatalogPage'));
const StatusPage = React.lazy(() => import('@/features/status-page/StatusPage'));
const RunbooksPage = React.lazy(() => import('@/features/runbooks/RunbooksPage'));
const PostmortemsPage = React.lazy(() => import('@/features/postmortems/PostmortemsPage'));
const SyntheticsPage = React.lazy(() => import('@/features/synthetics/SyntheticsPage'));
const AdminPage = React.lazy(() => import('@/features/admin/AdminPage'));
const UserManagementPage = React.lazy(() => import('@/features/admin/UserManagementPage'));
const NotFoundPage = React.lazy(() => import('@/features/misc/NotFoundPage'));
const SettingsPage = React.lazy(() => import('@/features/settings/SettingsPage'));

import CustomCursor from '@/components/ui/custom-cursor';
import PageTransition from '@/components/ui/page-transition';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <LoadingFallback message="Authenticating session..." />;
  }
  if (!isAuthenticated) return <Navigate to="/landing" replace />;
  return <>{children}</>;
}

import ForgotPasswordPage from '@/features/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';
import VerifyEmailPage from '@/features/auth/VerifyEmailPage';
import AcceptInvitePage from '@/features/auth/AcceptInvitePage';
const BillingPage = React.lazy(() => import('@/features/billing/BillingPage'));
const PublicStatusPage = React.lazy(() => import('@/features/status-page/PublicStatusPage'));
const OnCallPage = React.lazy(() => import('@/features/oncall/OnCallPage'));
const EscalationPoliciesPage = React.lazy(() => import('@/features/escalation/EscalationPoliciesPage'));
const NotificationChannelsPage = React.lazy(() => import('@/features/notifications/NotificationChannelsPage'));
const MaintenanceWindowsPage = React.lazy(() => import('@/features/maintenance/MaintenanceWindowsPage'));

export default function App() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <CustomCursor />
      <PageTransition>
        <Routes>
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/auth/login" element={<AuthPage />} />
          <Route path="/auth/register" element={<AuthPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
          <Route path="/invite" element={<AcceptInvitePage />} />
          <Route path="/status" element={<Suspense fallback={<LoadingFallback message="Loading status..." />}><PublicStatusPage /></Suspense>} />
          <Route path="/" element={<Navigate to="/landing" replace />} />
        
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="/healing" element={<HealingPage />} />
          <Route path="/slo" element={<SLOPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/alerting" element={<Suspense fallback={<LoadingFallback message="Loading Alerting Center..." />}><AlertingCenterPage /></Suspense>} />
          <Route path="/dashboards" element={<Suspense fallback={<LoadingFallback message="Loading Dashboard Builder..." />}><CustomDashboardBuilderPage /></Suspense>} />
          <Route path="/logs" element={<Suspense fallback={<LoadingFallback message="Loading Logs Explorer..." />}><LogsExplorerPage /></Suspense>} />
          <Route path="/traces" element={<Suspense fallback={<LoadingFallback message="Loading Trace Explorer..." />}><TraceExplorerPage /></Suspense>} />
          <Route path="/catalog" element={<Suspense fallback={<LoadingFallback message="Loading Service Catalog..." />}><CatalogPage /></Suspense>} />
          <Route path="/status-page" element={<Suspense fallback={<LoadingFallback message="Loading Status Page..." />}><StatusPage /></Suspense>} />
          <Route path="/runbooks" element={<Suspense fallback={<LoadingFallback message="Loading Runbooks..." />}><RunbooksPage /></Suspense>} />
          <Route path="/postmortems" element={<Suspense fallback={<LoadingFallback message="Loading Postmortems..." />}><PostmortemsPage /></Suspense>} />
          <Route path="/synthetics" element={<Suspense fallback={<LoadingFallback message="Loading Synthetics..." />}><SyntheticsPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<LoadingFallback message="Loading Control Plane Admin..." />}><AdminPage /></Suspense>} />
          <Route path="/users" element={<Suspense fallback={<LoadingFallback message="Loading User Management..." />}><UserManagementPage /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<LoadingFallback message="Loading Settings..." />}><SettingsPage /></Suspense>} />
          <Route path="/billing" element={<Suspense fallback={<LoadingFallback message="Loading Billing..." />}><BillingPage /></Suspense>} />
          <Route path="/oncall" element={<Suspense fallback={<LoadingFallback message="Loading On-Call..." />}><OnCallPage /></Suspense>} />
          <Route path="/escalation" element={<Suspense fallback={<LoadingFallback message="Loading Escalation Policies..." />}><EscalationPoliciesPage /></Suspense>} />
          <Route path="/notifications/channels" element={<Suspense fallback={<LoadingFallback message="Loading Notification Channels..." />}><NotificationChannelsPage /></Suspense>} />
          <Route path="/notifications/maintenance" element={<Suspense fallback={<LoadingFallback message="Loading Maintenance Windows..." />}><MaintenanceWindowsPage /></Suspense>} />
        </Route>
          <Route path="*" element={<Suspense fallback={<LoadingFallback message="Lost in space..." />}><NotFoundPage /></Suspense>} />
        </Routes>
      </PageTransition>
    </BrowserRouter>
  );
}
