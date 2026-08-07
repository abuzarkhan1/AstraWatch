import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import CheckedIcon from '@/components/ui/checked-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import XIcon from '@/components/ui/x-icon';
import ExternalLinkIcon from '@/components/ui/external-link-icon';

const statusIcon: Record<string, React.ElementType> = {
  HEALTHY: CheckedIcon,
  OPERATIONAL: CheckedIcon,
  DEGRADED: TriangleAlertIcon,
  DOWN: XIcon,
  MAJOR_OUTAGE: XIcon,
  CRITICAL: XIcon,
};

const statusColor: Record<string, string> = {
  HEALTHY: 'text-green-500',
  OPERATIONAL: 'text-green-500',
  DEGRADED: 'text-yellow-500',
  DOWN: 'text-red-500',
  MAJOR_OUTAGE: 'text-red-500',
  CRITICAL: 'text-red-500',
};

/**
 * Public status page — no auth required. Audit fix (missing_points 2.4): the
 * internal page's "Public Status Page" button linked to /status but no such
 * route existed, and the backend endpoint required a session. Both are now
 * real: GET /api/v1/status-page is publicly readable and /status renders it.
 */
export default function PublicStatusPage() {
  const { data: spData, isLoading } = useQuery({
    queryKey: ['public-status-page'],
    queryFn: async () => {
      // api client is plain axios → response.data is the ApiResponse envelope;
      // unwrap the payload like useApi.ts does (data?.data ?? data).
      const { data } = await endpoints.statusPage.get();
      return data?.data ?? data;
    },
    refetchInterval: 60000,
  });

  const components: any[] = spData?.components ?? [];
  const incidents: any[] = spData?.incidents ?? [];
  const uptime = spData?.uptime ?? null;

  const down = components.filter(
    (c) => c.status === 'DOWN' || c.status === 'MAJOR_OUTAGE' || c.status === 'CRITICAL'
  ).length;
  const degraded = components.filter((c) => c.status === 'DEGRADED').length;
  const overallOk = down === 0 && degraded === 0 && incidents.length === 0;

  // Honest "last updated" — derived from the latest recorded incident, never the
  // local wall clock (which would claim freshness the data doesn't have).
  // Missing/malformed timestamps are filtered out so they never render a fake
  // epoch or "Invalid Date".
  const lastUpdated = incidents.length
    ? (() => {
        const ts = incidents
          .map((i: any) => new Date(i.createdAt).getTime())
          .filter((t: number) => Number.isFinite(t));
        if (ts.length === 0) return null;
        return new Date(Math.max(...ts)).toLocaleString();
      })()
    : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AstraWatch Status</h1>
            <p className="text-sm text-gray-500 mt-1">Live system status and uptime</p>
          </div>
          <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-gray-400 font-medium">
            Public
          </span>
        </div>

        {/* Overall status */}
        <div className={`rounded-2xl border p-6 mt-6 ${overallOk ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
          <div className="flex items-center gap-3">
            {overallOk ? (
              <CheckedIcon className="w-8 h-8 text-green-500" />
            ) : (
              <TriangleAlertIcon className="w-8 h-8 text-yellow-500" />
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {overallOk ? 'All Systems Operational' : 'Partial Service Disruption'}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {lastUpdated ? `Last updated: ${lastUpdated}` : 'No recorded changes yet'}
              </p>
            </div>
          </div>
        </div>

        {/* Components */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 mt-6 space-y-3">
          <h2 className="text-base font-semibold">Components</h2>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading status...</p>
          ) : components.length === 0 ? (
            <p className="text-sm text-gray-500">No components registered yet.</p>
          ) : (
            components.map((c: any) => {
              const Icon = statusIcon[c.status] || CheckedIcon;
              return (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0">
                  <span className="text-sm text-gray-300">{c.name}</span>
                  <span className={`flex items-center gap-2 text-sm font-medium ${statusColor[c.status] || 'text-gray-400'}`}>
                    <Icon className="w-4 h-4" />
                    {c.status || 'UNKNOWN'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Uptime */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 mt-6 flex items-center justify-between">
          <span className="text-sm text-gray-300">Overall availability (30 days)</span>
          <span className="font-mono text-sm text-gray-400">{uptime != null ? `${uptime}%` : '—'}</span>
        </div>

        {/* Incidents */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 mt-6 space-y-3">
          <h2 className="text-base font-semibold">Recent Incidents</h2>
          {incidents.length === 0 ? (
            <p className="text-sm text-gray-500">No incidents in the last 90 days — all clear.</p>
          ) : (
            incidents.map((inc: any) => (
              <div key={inc.id} className="flex items-center justify-between py-2.5 border-b border-neutral-800 last:border-0">
                <div className="flex items-center gap-3">
                  <TriangleAlertIcon className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-gray-300">{inc.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{inc.state}</span>
                  <span className="text-xs font-mono text-gray-600">
                    {inc.createdAt ? new Date(inc.createdAt).toLocaleDateString() : ''}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-8 text-center">
          <a href="/landing" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <ExternalLinkIcon className="w-3.5 h-3.5" />
            Built on AstraWatch
          </a>
        </div>
      </div>
    </div>
  );
}
