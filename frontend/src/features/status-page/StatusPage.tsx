import React, { useState } from 'react';
import WorldIcon from '@/components/ui/world-icon';
import CheckedIcon from '@/components/ui/checked-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import XIcon from '@/components/ui/x-icon';
import ExternalLinkIcon from '@/components/ui/external-link-icon';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useServices } from '@/hooks/useApi';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

const statusIcon: Record<string, React.ElementType> = {
  HEALTHY: CheckedIcon,
  DEGRADED: TriangleAlertIcon,
  CRITICAL: XIcon,
  DOWN: XIcon,
};

const statusColor: Record<string, string> = {
  HEALTHY: 'text-green-500',
  DEGRADED: 'text-yellow-500',
  CRITICAL: 'text-red-500',
  DOWN: 'text-red-500',
};

const componentStatusOptions = ['OPERATIONAL', 'DEGRADED', 'OUTAGE', 'MAINTENANCE'];

export default function StatusPage() {
  const { data: services = [], isLoading } = useServices();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [compName, setCompName] = useState('');
  const [compGroup, setCompGroup] = useState('');
  const [compStatus, setCompStatus] = useState('OPERATIONAL');
  const [subEmail, setSubEmail] = useState('');
  const [formMsg, setFormMsg] = useState('');
  const [formErr, setFormErr] = useState('');

  // Audit P3: status-page component management + subscriber management existed
  // on the backend but had no UI. Adding create/update-status for components
  // and subscriber management closes that gap.
  const { data: compData } = useQuery({
    queryKey: ['status-components'],
    queryFn: async () => {
      try {
        const { data } = await endpoints.statusPage.get();
        return (data?.data?.components ?? data?.components ?? []) as any[];
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
  });

  const { data: subData } = useQuery({
    queryKey: ['status-subscribers'],
    queryFn: async () => {
      const { data } = await endpoints.statusPage.subscribers();
      return data?.data?.subscribers ?? data?.subscribers ?? [];
    },
  });

  const createCompMutation = useMutation({
    mutationFn: () =>
      endpoints.statusPage.createComponent({
        name: compName,
        groupName: compGroup.trim() || null,
        status: compStatus,
        displayOrder: 0,
      }),
    onSuccess: () => {
      setShowCreate(false);
      setCompName('');
      setCompGroup('');
      setCompStatus('OPERATIONAL');
      setFormMsg('Component added to the status page.');
      setTimeout(() => setFormMsg(''), 3000);
      setFormErr('');
      queryClient.invalidateQueries({ queryKey: ['status-components'] });
      queryClient.invalidateQueries({ queryKey: ['status-page'] });
    },
    onError: (err: any) => setFormErr(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to create component'),
  });

  const updateCompMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      endpoints.statusPage.updateComponentStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-components'] });
      queryClient.invalidateQueries({ queryKey: ['status-page'] });
    },
  });

  const createSubMutation = useMutation({
    mutationFn: () => endpoints.statusPage.createSubscriber({ email: subEmail }),
    onSuccess: () => {
      setSubEmail('');
      setFormMsg('Subscriber added.');
      setTimeout(() => setFormMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['status-subscribers'] });
    },
    onError: (err: any) => setFormErr(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to add subscriber'),
  });

  const deleteSubMutation = useMutation({
    mutationFn: (id: string) => endpoints.statusPage.deleteSubscriber(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status-subscribers'] }),
  });

  const components: any[] = compData ?? [];
  const subscribers: any[] = subData ?? [];

  // Component uptime summary (SaaS strip, BetterStack-style): per-status counts
  // across the managed status-page components. Honest — derived from the real
  // component list.
  const compSummary = React.useMemo(() => {
    const counts: Record<string, number> = { OPERATIONAL: 0, DEGRADED: 0, OUTAGE: 0, MAINTENANCE: 0 };
    let unknown = 0;
    for (const c of components) {
      const st = (c.status ?? 'OPERATIONAL').toUpperCase();
      if (st in counts) {
        counts[st] = (counts[st] ?? 0) + 1;
      } else {
        // Unknown status — never bucket it into OPERATIONAL (review fix: that
        // silently inflated the availability %).
        unknown += 1;
      }
    }
    const operational = counts.OPERATIONAL ?? 0;
    const total = components.length;
    const availability = total > 0 ? Math.round((operational / total) * 100) : null;
    return { counts, total, availability, unknown };
  }, [components]);

  // Audit fix: the uptime categories were a hardcoded empty array and the
  // public status page button was a dead control. The incident feed now comes
  // from the real /api/v1/status-page endpoint (backed by IncidentRepository)
  // and the public page link opens a shareable /status URL.
  const { data: spData } = useQuery({
    queryKey: ['status-page'],
    queryFn: async () => {
      try {
        // api client is plain axios → response.data is the ApiResponse envelope;
        // unwrap the payload like useApi.ts does (data?.data ?? data).
        const { data } = await endpoints.statusPage.get();
        return data?.data ?? data;
      } catch {
        return null;
      }
    },
    refetchInterval: 30000,
  });

  const incidents = spData?.incidents ?? [];
  const uptime = spData?.uptime ?? null;

  const healthy = services.filter((s: any) => s.status === 'HEALTHY').length;
  const degraded = services.filter((s: any) => s.status === 'DEGRADED').length;
  const down = services.filter((s: any) => s.status === 'DOWN' || s.status === 'CRITICAL').length;
  // Honest banner (audit: never green with zero monitored services — the
  // collector returns a real status per service now, and no data ≠ operational).
  const hasServices = services.length > 0;
  const overallOk = hasServices && down === 0 && degraded === 0 && incidents.length === 0;

  let bannerTitle: string;
  let bannerSub: string;
  let bannerIcon: React.ReactNode;
  let bannerBorder: string;
  if (!hasServices) {
    bannerTitle = 'Awaiting telemetry';
    bannerSub = 'No services are reporting data yet — status will appear once ingestion begins.';
    bannerIcon = <TriangleAlertIcon className="w-8 h-8 text-gray-500" />;
    bannerBorder = 'border-neutral-700';
  } else if (overallOk) {
    bannerTitle = 'All Systems Operational';
    bannerSub = (() => {
      const times = incidents
        .map((i: any) => (i.createdAt ? new Date(i.createdAt).getTime() : 0))
        .filter((t: number) => t > 0);
      if (times.length === 0) return 'No recent incident activity';
      return `Last incident: ${new Date(Math.max(...times)).toLocaleString()}`;
    })();
    bannerIcon = <CheckedIcon className="w-8 h-8 text-green-500" />;
    bannerBorder = 'border-green-500/40';
  } else {
    bannerTitle = 'Partial Service Disruption';
    bannerSub = (() => {
      const times = incidents
        .map((i: any) => (i.createdAt ? new Date(i.createdAt).getTime() : 0))
        .filter((t: number) => t > 0);
      if (times.length === 0) return 'No recent incident activity';
      return `Last incident: ${new Date(Math.max(...times)).toLocaleString()}`;
    })();
    bannerIcon = <TriangleAlertIcon className="w-8 h-8 text-yellow-500" />;
    bannerBorder = 'border-red-500/40';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status Page"
        subtitle="Live system status and uptime history"
        meta={<MetaChip>{components.length} components</MetaChip>}
        actions={
          <a
            href="/status"
            className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors"
          >
            <WorldIcon className="w-4 h-4" />
            Public Status Page
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </a>
        }
      />

      {/* Overall Status */}
      <div className={`rounded-2xl text-white bg-neutral-900 border p-6 transition-colors ${bannerBorder}`}>
        <div className="flex items-center gap-3">
          {bannerIcon}
          <div>
            <h2 className="text-xl font-semibold text-white">
              {bannerTitle}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{bannerSub}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Healthy</p>
          <p className="text-2xl font-bold text-green-500 mt-1">{healthy}</p>
        </div>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Degraded</p>
          <p className="text-2xl font-bold text-yellow-500 mt-1">{degraded}</p>
        </div>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Down</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{down}</p>
        </div>
      </div>

      {/* Uptime summary strip (SaaS: overall availability + per-status component counts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="text-base font-semibold text-white">Uptime</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Overall availability</span>
            <span className="text-sm font-mono text-gray-400">{uptime != null ? `${uptime}%` : '—'}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                uptime != null && uptime >= 99.9 ? 'bg-green-500' : uptime != null && uptime >= 99 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${uptime != null ? Math.min(100, uptime) : 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">Derived from monitored service health.</p>
        </div>

        {/* Component availability (honest: computed from the component list) */}
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Components</h2>
            <span className="text-sm font-mono text-gray-400">
              {compSummary.availability != null ? `${compSummary.availability}% operational` : '—'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['OPERATIONAL', 'Operational', 'text-green-500'],
              ['DEGRADED', 'Degraded', 'text-yellow-500'],
              ['OUTAGE', 'Outage', 'text-red-500'],
              ['MAINTENANCE', 'Maintenance', 'text-blue-500'],
            ].map(([key, label, color]) => (
              <div key={key} className="rounded-xl bg-neutral-950/60 border border-neutral-800 px-3 py-2">
                <div className={`text-lg font-bold ${color}`}>{compSummary.counts[key] ?? 0}</div>
                <div className="text-[11px] text-gray-500">{label}</div>
              </div>
            ))}
            {compSummary.unknown > 0 && (
              <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 px-3 py-2">
                <div className="text-lg font-bold text-gray-400">{compSummary.unknown}</div>
                <div className="text-[11px] text-gray-500">Unknown</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status components management (audit P3: create/update existed on backend, no UI) */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Status Components</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Component
          </button>
        </div>

        {showCreate && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                placeholder="Component name (e.g. API Gateway)"
                className="bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
              <input
                value={compGroup}
                onChange={(e) => setCompGroup(e.target.value)}
                placeholder="Group (optional)"
                className="bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
              <select
                value={compStatus}
                onChange={(e) => setCompStatus(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-all"
              >
                {componentStatusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createCompMutation.mutate()}
                disabled={!compName.trim() || createCompMutation.isPending}
                className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-xs disabled:opacity-50"
              >
                {createCompMutation.isPending ? 'Adding...' : 'Add Component'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="bg-neutral-800 border border-neutral-700 text-gray-300 text-xs font-bold rounded-xl px-4 py-2 hover:bg-neutral-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {compData == null ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : components.length === 0 ? (
          <p className="text-sm text-gray-500">No components added to the public status page yet.</p>
        ) : (
          <div className="space-y-2">
            {components.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0">
                <div>
                  <p className="text-sm text-gray-300">{c.name}</p>
                  {c.groupName && <p className="text-xs text-gray-500">{c.groupName}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={c.status}
                    onChange={(e) => updateCompMutation.mutate({ id: c.id, status: e.target.value })}
                    className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none transition-all"
                  >
                    {componentStatusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscribers (audit P3: subscriber CRUD had no UI) */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">Subscribers</h2>
        <div className="flex gap-2 max-w-md">
          <input
            type="email"
            value={subEmail}
            onChange={(e) => setSubEmail(e.target.value)}
            placeholder="notify@example.com"
            className="flex-1 bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
          <button
            onClick={() => createSubMutation.mutate()}
            disabled={!subEmail.includes('@') || createSubMutation.isPending}
            className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 text-xs hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50"
          >
            {createSubMutation.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>
        {subscribers.length === 0 ? (
          <p className="text-sm text-gray-500">No subscribers yet.</p>
        ) : (
          <div className="space-y-2">
            {subscribers.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0">
                <div>
                  <p className="text-sm text-gray-300">{s.email}</p>
                  <p className="text-xs text-gray-500">
                    {s.isVerified ? 'Verified' : 'Pending verification'} · {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}
                  </p>
                </div>
                <button
                  onClick={() => deleteSubMutation.mutate(s.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                  title="Remove subscriber"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {formMsg && <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">{formMsg}</div>}
      {formErr && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{formErr}</div>}

      {/* Incident feed (audit: was hardcoded empty) */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3">
        <h2 className="text-base font-semibold text-white">Recent Incidents</h2>
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

      {/* Services */}
      {!isLoading && services.length > 0 && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <h2 className="text-base font-semibold text-white mb-4">Service Status</h2>
          <div className="space-y-2">
            {services.map((svc: any) => {
              const Icon = statusIcon[svc.status] || CheckedIcon;
              return (
                <div key={svc.id} className="flex items-center justify-between py-2.5 border-b border-neutral-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${statusColor[svc.status] || 'text-gray-400'}`} />
                    <span className="text-sm text-gray-300">{svc.name}</span>
                    <span className="text-xs text-gray-600">{svc.tier}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-500">
                      {svc.healthScore ? `${svc.healthScore}%` : '—'}
                    </span>
                    <span className={`text-xs font-medium ${statusColor[svc.status] || 'text-gray-400'}`}>
                      {svc.status || 'UNKNOWN'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
