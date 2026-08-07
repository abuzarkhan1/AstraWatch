import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/hooks/useStore';
import { useServices, useIncidents, useMetrics } from '@/hooks/useApi';
import wsManager from '@/hooks/useWebSocket';
import { MetricsChart } from '@/components/ui/metrics-chart';
import { PageHeader, LiveBadge, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import ChartLineIcon from '@/components/ui/chart-line-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import ShieldCheckIcon from '@/components/ui/shield-check';
import ChartBarIcon from '@/components/ui/chart-bar-icon';
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon';
import ArrowNarrowDownIcon from '@/components/ui/arrow-narrow-down-icon';
import BellOffIcon from '@/components/ui/bell-off-icon';
import WifiIcon from '@/components/ui/wifi-icon';
import RocketIcon from '@/components/ui/rocket-icon';

// Names must match the collector's ClickHouse metric_name keys exactly
// (audit: 'cpu'/'memory' queried keys that don't exist — real keys are
// cpu_usage/memory_usage — so two panels silently rendered empty).
const DASHBOARD_METRICS = ['latency', 'error_rate', 'cpu_usage', 'memory_usage', 'request_rate'];

function ServiceMetricPanel({ service, from, to, lastRefresh }: {
  service: any;
  from: string;
  to: string;
  lastRefresh: number;
}) {
  const [metric, setMetric] = useState('latency');
  // Metric queries must use the collector's catalog key (serviceKey), NOT the
  // DB UUID — ClickHouse stores service_id as the slug ("payment-api"). The
  // old service.id lookup returned empty series for every panel (audit: this
  // was the "dashboard shows nothing" root cause alongside the tenant bug).
  const metricKey = service.serviceKey ?? service.name ?? service.id;
  const { data: result } = useMetrics(metricKey, metric, from, to, lastRefresh);

  const series = Array.isArray(result?.series) ? result.series : [];
  const xAxisData = series.map((p: any) =>
    p.ts ? new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  );
  const seriesData = series.map((p: any) => (typeof p.value === 'number' ? p.value : 0));

  return (
    <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 hover:border-neutral-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${
            service.healthScore >= 90 ? 'bg-green-500' : service.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          <h3 className="text-sm font-semibold text-white">{service.name}</h3>
          <span className="text-xs text-gray-500">{service.healthScore ?? '—'}% health</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500 transition-colors"
          >
            {DASHBOARD_METRICS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      {seriesData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[220px] text-center">
          <ChartLineIcon className="w-8 h-8 text-gray-600 mb-2" />
          <p className="text-sm text-gray-500">No {metric} data for this service in the selected window</p>
        </div>
      ) : (
        <MetricsChart
          title={`${metric}`}
          xAxisData={xAxisData}
          seriesData={seriesData}
          height={220}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, change, color, hint }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  change?: number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 overflow-hidden hover:border-neutral-700 transition-colors relative" title={hint}>
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full shrink-0 ${color.replace('text-', 'bg-')}`} />
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      <div className="text-2xl font-bold relative z-10">{value}</div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-xs relative z-10 ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {change >= 0 ? <ArrowNarrowUpIcon className="w-3 h-3" /> : <ArrowNarrowDownIcon className="w-3 h-3" />}
          {Math.abs(change)}%
        </div>
      )}
    </div>
  );
}

interface FeedEvent {
  id: string;
  type: string;
  title: string;
  time: string;
  link?: string;
  tone: 'blue' | 'red' | 'amber' | 'green';
}

export default function Dashboard() {
  const { incidents, setIncidents, services, setServices, timeRangeMinutes, lastRefresh, autoRefresh } = useAppStore();
  const { data: servicesData, isLoading: servicesLoading } = useServices();
  const { data: incidentsData, isLoading: incidentsLoading } = useIncidents();
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    const list = Array.isArray(servicesData)
      ? servicesData
      : servicesData?.services;
    if (Array.isArray(list)) setServices(list);
  }, [servicesData, setServices]);

  useEffect(() => {
    if (incidentsData) setIncidents(incidentsData.items || []);
  }, [incidentsData, setIncidents]);

  // Live event feed: realtime events stream into the dashboard (the product
  // feel of "your system is happening right now").
  useEffect(() => {
    wsManager.connect();
    const push = (type: string, raw: unknown) => {
      if (!isLive) return;
      const d: any = raw && typeof raw === 'object' ? (raw as any)?.data ?? raw : raw ?? {};
      const id = String(d.incidentId || d.actionId || d.eventId || `${type}-${Date.now()}`);
      const tone: FeedEvent['tone'] =
        type.includes('fail') || type.includes('anomaly') ? 'red' :
        type.includes('complete') || type.includes('resolve') ? 'green' :
        type.includes('start') ? 'amber' : 'blue';
      const title =
        type === 'anomaly.detected' ? `Anomaly detected on ${d.serviceId || 'a service'}` :
        type === 'incident.created' ? `Incident created: ${d.title || d.serviceId || 'new incident'}` :
        type === 'incident.updated' ? `Incident updated: ${d.title || d.serviceId || ''}` :
        type.startsWith('healing.') ? `Healing ${type.split('.')[1]}: ${d.actionType || 'action'}` :
        `Event: ${type}`;
      setFeed((prev) => {
        if (prev.some((f) => f.id === id)) return prev;
        return [{ id, type, title, time: new Date().toISOString(), link: d.incidentId ? `/incidents/${d.incidentId}` : undefined, tone }, ...prev].slice(0, 20);
      });
    };
    const unsubs = ['anomaly.detected', 'incident.created', 'incident.updated', 'healing.started', 'healing.completed', 'healing.failed'].map((e) =>
      wsManager.on(e, (data) => push(e, data))
    );
    return () => { unsubs.forEach((u) => u()); };
  }, [isLive]);

  // SLO summary across services (real data via the SLO endpoint). Keyed on the
  // joined service ids so same-count/different-service changes still refetch.
  const sloServiceIds = useMemo(() => services.map((s: any) => s.id).sort().join(','), [services]);
  const { data: sloSummaries = [] } = useQuery({
    queryKey: ['slo-summary', sloServiceIds],
    queryFn: async () => {
      const rows = await Promise.allSettled(
        (Array.isArray(services) ? services : []).map(async (s: any) => {
          const { data } = await endpoints.slo.get(s.id);
          const d = data?.data ?? data;
          return { serviceId: s.id, name: s.name, defined: !!d && d.defined !== false && d.sloTarget != null, attainment: d?.currentAttainment, target: d?.sloTarget };
        })
      );
      return rows.filter((r) => r.status === 'fulfilled').map((r: any) => r.value);
    },
    enabled: (Array.isArray(services) ? services : []).length > 0,
  });

  const activeIncidents = incidents.filter(
    (i) => i.state !== 'RESOLVED' && i.state !== 'ROLLED_BACK'
  ).length;

  const criticalIncidents = incidents.filter(
    (i) => i.severity === 'CRITICAL' && i.state !== 'RESOLVED'
  ).length;

  const healthyServices = services.filter(
    (s) => s.status === 'HEALTHY' || s.healthScore >= 80
  ).length;

  const definedSLOs = sloSummaries.filter((s: any) => s.defined);
  const breachingSLOs = sloSummaries.filter((s: any) => s.defined && s.attainment != null && s.attainment < s.target);

  // Stable window per refresh cycle — recompute only when the range or the
  // refresh tick changes, so auto-refresh re-queries without churning keys.
  const { from, to } = useMemo(() => {
    const _to = new Date();
    return {
      from: new Date(_to.getTime() - timeRangeMinutes * 60_000).toISOString(),
      to: _to.toISOString(),
    };
  }, [timeRangeMinutes, lastRefresh]);

  // Onboarding empty state: no services yet — guide the user through setup
  // instead of showing a blank dashboard (the #1 SaaS "product feel" gap).
  if (!servicesLoading && (Array.isArray(services) ? services : []).length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle="Live health and activity across your services"
          meta={<LiveBadge>Ready</LiveBadge>}
        />
        <EmptyState
          icon={<RocketIcon className="w-7 h-7" />}
          title="Welcome to AstraWatch"
          description="Your workspace is ready. Connect your first service to start seeing live metrics, incidents and auto-healing in action."
          steps={[
            { title: 'Connect an agent', description: 'Install the collector agent or send OTLP data to start ingesting metrics, logs and traces.', href: '/catalog', cta: 'Open Catalog' },
            { title: 'Create a synthetic check', description: 'Monitor an external endpoint for uptime and response time from around the world.', href: '/synthetics', cta: 'Create Check', done: false },
            { title: 'Set up alerting', description: 'Create notification rules so your team gets paged when something breaks.', href: '/alerting', cta: 'Set up Alerts', done: false },
            { title: 'Invite your team', description: 'Bring in teammates with roles, MFA and scoped access.', href: '/users', cta: 'Invite Team', done: false },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Live health and activity across your services"
        meta={<LiveBadge>{autoRefresh ? 'Live' : 'Paused'}</LiveBadge>}
        actions={<MetaChip>Updated {new Date(lastRefresh).toLocaleTimeString()}</MetaChip>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        <StatCard
          icon={WifiIcon}
          label="Services"
          value={services.length}
          color="text-blue-500"
          hint="Total services in the catalog"
        />
        <StatCard
          icon={TriangleAlertIcon}
          label="Active Incidents"
          value={activeIncidents}
          color="text-red-500"
          hint="Open incidents across all services"
        />
        <StatCard
          icon={ShieldCheckIcon}
          label="Health"
          value={`${services.length > 0 ? Math.round((healthyServices / services.length) * 100) : 0}%`}
          change={undefined}
          color="text-green-500"
          hint="Share of services reporting healthy"
        />
        <StatCard
          icon={ChartBarIcon}
          label="Critical"
          value={criticalIncidents}
          color="text-orange-500"
          hint="Unresolved critical incidents"
        />
      </div>

      {/* SLO + alert summary strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link
          to="/slo"
          className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5 hover:border-blue-500/40 transition-colors group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">SLOs</span>
            <ChartBarIcon className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-bold">{definedSLOs.length}<span className="text-sm text-gray-500 font-normal"> / {sloSummaries.length}</span></div>
              <div className="text-xs text-gray-500">services with SLOs</div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${breachingSLOs.length > 0 ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-green-500/30 bg-green-500/10 text-green-400'}`}>
              {breachingSLOs.length} breaching
            </span>
          </div>
        </Link>

        <Link
          to="/alerting"
          className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5 hover:border-blue-500/40 transition-colors group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Healing</span>
            <ShieldCheckIcon className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-bold">{incidents.filter((i) => i.state === 'HEALING' || i.state === 'VALIDATING').length}</div>
              <div className="text-xs text-gray-500">incidents in healing flow</div>
            </div>
            <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Open Healing →</span>
          </div>
        </Link>

        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Live events</span>
            <button
              onClick={() => setIsLive((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${isLive ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-neutral-700 bg-neutral-800 text-gray-500'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              {isLive ? 'Streaming' : 'Paused'}
            </button>
          </div>
          <div className="text-2xl font-bold">{feed.length}</div>
          <div className="text-xs text-gray-500">events this session</div>
        </div>
      </div>

      {/* Live event stream */}
      {feed.length > 0 && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Event stream</h2>
            <button onClick={() => setFeed([])} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear</button>
          </div>
          <div className="space-y-1 max-h-56 overflow-auto">
            {feed.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-1.5 border-b border-neutral-800/60 last:border-0 text-sm">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  e.tone === 'red' ? 'bg-red-500' : e.tone === 'green' ? 'bg-green-500' : e.tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                {e.link ? <Link to={e.link} className="text-gray-300 hover:text-white truncate">{e.title}</Link> : <span className="text-gray-300 truncate">{e.title}</span>}
                <span className="ml-auto text-xs text-gray-500 shrink-0">{new Date(e.time).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric time-series from the collector, respecting the global window */}
      {services.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Service Metrics</h2>
            <span className="text-xs text-gray-500">Live from ClickHouse via /v1/query</span>
          </div>
          {servicesLoading ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <SkeletonCard rows={4} />
              <SkeletonCard rows={4} />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {services.slice(0, 4).map((service) => (
                <ServiceMetricPanel key={service.id} service={service} from={from} to={to} lastRefresh={lastRefresh} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Recent Incidents</h2>
            <Link to="/incidents" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all →</Link>
          </div>
          {incidentsLoading ? (
            <SkeletonCard rows={4} className="border-0 bg-transparent p-0" />
          ) : incidents.length === 0 ? (
            <div className="py-8 text-center">
              <BellOffIcon className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No incidents yet — nice and quiet.</p>
            </div>
          ) : (
            incidents.slice(0, 5).map((incident) => (
              <Link
                key={incident.id}
                to={`/incidents/${incident.id}`}
                className="flex items-center justify-between py-2.5 border-b border-neutral-700 last:border-0 hover:bg-white/[0.03] px-2 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    incident.severity === 'CRITICAL' ? 'bg-red-500' :
                    incident.severity === 'HIGH' ? 'bg-orange-500' :
                    incident.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <span className="text-sm text-gray-300">{incident.title || incident.serviceId}</span>
                </div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">{incident.createdAt ? new Date(incident.createdAt).toLocaleTimeString() : '—'}</span>
              </Link>
            ))
          )}
        </div>

        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Service Health</h2>
            <Link to="/catalog" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all →</Link>
          </div>
          <div className="space-y-4">
            {services.slice(0, 8).map((service) => (
              <div key={service.id} className="flex flex-col gap-1.5 py-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      service.healthScore >= 90 ? 'bg-green-500' :
                      service.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm text-gray-300">{service.name}</span>
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400 font-medium uppercase tracking-wider">{service.tier}</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    service.healthScore >= 90 ? 'text-green-500' :
                    service.healthScore >= 70 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {service.healthScore}%
                  </span>
                </div>
                <div className="w-full bg-black/60 border border-neutral-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      service.healthScore >= 90 ? 'bg-green-500' :
                      service.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${service.healthScore}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
