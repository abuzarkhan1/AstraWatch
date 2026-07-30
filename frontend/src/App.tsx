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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/landing" replace />;
  return <>{children}</>;
}

export default function App() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/auth/login" element={<AuthPage />} />
        <Route path="/auth/register" element={<AuthPage />} />
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
          <Route path="/alerting" element={<Suspense fallback={<div>Loading...</div>}><AlertingCenterPage /></Suspense>} />
          <Route path="/dashboards" element={<Suspense fallback={<div>Loading...</div>}><CustomDashboardBuilderPage /></Suspense>} />
          <Route path="/logs" element={<Suspense fallback={<div>Loading...</div>}><LogsExplorerPage /></Suspense>} />
          <Route path="/traces" element={<Suspense fallback={<div>Loading...</div>}><TraceExplorerPage /></Suspense>} />
          <Route path="/catalog" element={<Suspense fallback={<div>Loading...</div>}><CatalogPage /></Suspense>} />
          <Route path="/status-page" element={<Suspense fallback={<div>Loading...</div>}><StatusPage /></Suspense>} />
          <Route path="/runbooks" element={<Suspense fallback={<div>Loading...</div>}><RunbooksPage /></Suspense>} />
          <Route path="/postmortems" element={<Suspense fallback={<div>Loading...</div>}><PostmortemsPage /></Suspense>} />
          <Route path="/synthetics" element={<Suspense fallback={<div>Loading...</div>}><SyntheticsPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<div>Loading...</div>}><AdminPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
