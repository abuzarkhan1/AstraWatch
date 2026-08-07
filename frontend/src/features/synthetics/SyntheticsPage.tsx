import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Play, Pause, Trash2, RefreshCw, ChevronRight } from 'lucide-react';
import ChartLineIcon from '@/components/ui/chart-line-icon';
import CheckedIcon from '@/components/ui/checked-icon';
import XIcon from '@/components/ui/x-icon';
import ClockIcon from '@/components/ui/clock-icon';
import WorldIcon from '@/components/ui/world-icon';
import WifiIcon from '@/components/ui/wifi-icon';
import { endpoints } from '@/lib/api';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard, Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricsChart } from '@/components/ui/metrics-chart';
import { useMetrics } from '@/hooks/useApi';
import { useAppStore } from '@/hooks/useStore';
import { useQuery } from '@tanstack/react-query';
import RocketIcon from '@/components/ui/rocket-icon';

type CheckStatus = 'passing' | 'failing' | 'paused';

interface SyntheticCheck {
  id: string;
  name: string;
  type: 'http' | 'tcp' | 'dns';
  url: string;
  interval: string;
  status: CheckStatus;
  // Nullable — a check that has never been probed has no run/uptime data.
  lastRun: string | null;
  responseTime: number | null;
  uptime: number | null;
}

const statusConfig: Record<CheckStatus, { icon: React.ElementType; color: string; badge: string; label: string }> = {
  passing: { icon: CheckedIcon, color: 'text-green-500', badge: 'border-green-500/30 bg-green-500/10 text-green-400', label: 'Passing' },
  failing: { icon: XIcon, color: 'text-red-500', badge: 'border-red-500/30 bg-red-500/10 text-red-400', label: 'Failing' },
  paused: { icon: Pause, color: 'text-gray-500', badge: 'border-neutral-600 bg-neutral-800 text-gray-400', label: 'Paused' },
};

const typeIcon: Record<string, React.ElementType> = {
  http: WorldIcon,
  tcp: WifiIcon,
  dns: ChartLineIcon,
};

const EMPTY: SyntheticCheck[] = [];

function uptimeTone(uptime: number) {
  if (uptime >= 99.9) return 'bg-green-500';
  if (uptime >= 99) return 'bg-yellow-500';
  return 'bg-red-500';
}

// Response-time chart for one check: queries the collector's /v1/query with the
// check id as the service key. Honest empty state — a check with no probe data
// (or whose probe never wrote to the collector) renders "no data", never a
// fabricated series.
function ResponseTimeChart({ check, windowMinutes }: { check: SyntheticCheck; windowMinutes: number }) {
  const { lastRefresh } = useAppStore();
  const { from, to } = useMemo(() => {
    const _to = new Date();
    return {
      from: new Date(_to.getTime() - windowMinutes * 60_000).toISOString(),
      to: _to.toISOString(),
    };
  }, [windowMinutes, lastRefresh]);

  const { data: result, isLoading } = useMetrics(check.id, 'latency', from, to, lastRefresh);

  const series = Array.isArray(result?.series) ? result.series : [];
  const xAxisData = series.map((p: any) =>
    p.ts ? new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  );
  const seriesData = series.map((p: any) => (typeof p.value === 'number' ? p.value : 0));

  return (
    <div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : seriesData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950/40">
          <ChartLineIcon className="w-7 h-7 text-gray-600 mb-2" />
          <p className="text-xs text-gray-500">
            No response-time data for this check in the window.
          </p>
          <p className="text-[11px] text-gray-600 mt-1">
            Series appear once the probe records latency into the collector.
          </p>
        </div>
      ) : (
        <MetricsChart
          title="Response time (latency)"
          xAxisData={xAxisData}
          seriesData={seriesData}
          height={180}
        />
      )}
    </div>
  );
}

// Probe-run history timeline from GET /checks/{id}/results. Honest empty state —
// the endpoint returns an empty array until a probe runner records results.
function CheckHistory({ check }: { check: SyntheticCheck }) {
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['synthetics-results', check.id],
    queryFn: async () => {
      try {
        const { data } = await endpoints.synthetics.results(check.id);
        const rows = data?.data?.results ?? [];
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950/40">
        <ClockIcon className="w-6 h-6 text-gray-600 mb-2" />
        <p className="text-xs text-gray-500">No probe runs recorded yet.</p>
        <p className="text-[11px] text-gray-600 mt-1">Check history appears once a probe runner executes this check.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-auto">
      {/* Stable fallback key (review fix: Math.random() remounted every row on
          each render). */}
      {results.slice(0, 20).map((r: any, i: number) => (
        <div key={r.id ?? r.runId ?? `run-${i}`} className="flex items-center gap-3 text-xs">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.success === false ? 'bg-red-500' : 'bg-green-500'}`} />
          <span className="text-gray-400 w-16 shrink-0">{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '—'}</span>
          <span className="text-gray-300 truncate">{r.location || 'probe'}</span>
          {r.responseTimeMs != null && (
            <span className="ml-auto text-gray-500 font-mono">{r.responseTimeMs}ms</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SyntheticsPage() {
  const [checks, setChecks] = useState<SyntheticCheck[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newCheck, setNewCheck] = useState({ name: '', url: '', type: 'http' as SyntheticCheck['type'] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | CheckStatus>('ALL');
  const [chartWindow, setChartWindow] = useState(60);

  // Load real checks from the orchestrator (audit: this page rendered fabricated
  // sampleChecks with invented uptime/response values).
  const loadChecks = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await endpoints.synthetics.list();
      const rows = data?.data?.checks;
      if (Array.isArray(rows)) {
        setChecks(rows.map((r: any) => ({
          id: String(r.id),
          name: r.name ?? 'Unnamed check',
          type: (r.type ?? 'http') as SyntheticCheck['type'],
          url: r.url ?? '',
          // Backend DTO exposes intervalSeconds (int), not a display string
          // (review fix: r.interval never matched, so every check read '1m').
          interval: r.interval ?? (r.intervalSeconds ? `${r.intervalSeconds}s` : '1m'),
          status: (r.status ?? 'paused') as CheckStatus,
          // Honest values: null until a probe actually runs — never a fabricated
          // "just now" timestamp or a fake 0% uptime (audit fix).
          lastRun: r.lastRun ?? r.lastRunAt ?? null,
          // Parenthesized to avoid the ?? / ternary precedence trap (review
          // fix: the old expression parsed as (a ?? (b != null)) ? c : null and
          // discarded responseTime whenever it was set).
          responseTime: r.responseTime != null ? Number(r.responseTime) : (r.responseTimeMs != null ? Number(r.responseTimeMs) : null),
          uptime: r.uptime != null ? Number(r.uptime) : null,
        })));
      } else {
        setChecks(EMPTY);
      }
    } catch (err) {
      setError('Could not load synthetic checks from the orchestrator.');
      setChecks(EMPTY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChecks();
  }, []);

  const toggleCheck = async (id: string) => {
    try {
      await endpoints.synthetics.toggle(id);
      setChecks(prev => prev.map(c =>
        c.id === id ? { ...c, status: c.status === 'paused' ? 'passing' : 'paused' } : c
      ));
    } catch (err) {
      setError('Could not update the check.');
    }
  };

  const deleteCheck = async (id: string) => {
    try {
      await endpoints.synthetics.remove(id);
      setChecks(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setError('Could not delete the check.');
    }
  };

  const createCheck = async () => {
    if (!newCheck.name.trim() || !newCheck.url.trim()) return;
    try {
      await endpoints.synthetics.create({
        name: newCheck.name.trim(),
        url: newCheck.url.trim(),
        type: newCheck.type,
      });
      setNewCheck({ name: '', url: '', type: 'http' });
      setShowCreate(false);
      await loadChecks();
    } catch (err) {
      setError('Could not create the check.');
    }
  };

  const passing = checks.filter(c => c.status === 'passing').length;
  const failing = checks.filter(c => c.status === 'failing').length;
  const paused = checks.filter(c => c.status === 'paused').length;

  // Honest aggregate uptime: averaged only over checks with real probe data.
  const withUptime = checks.filter(c => c.uptime != null);
  const avgUptime = withUptime.length > 0
    ? withUptime.reduce((sum, c) => sum + (c.uptime as number), 0) / withUptime.length
    : null;

  const filtered = checks.filter(c => statusFilter === 'ALL' || c.status === statusFilter);
  const selectedCheck = checks.find(c => c.id === selectedId) ?? null;

  const statusChips: Array<{ value: 'ALL' | CheckStatus; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'passing', label: `Passing · ${passing}` },
    { value: 'failing', label: `Failing · ${failing}` },
    { value: 'paused', label: `Paused · ${paused}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Synthetic Monitoring"
        subtitle="Automated uptime checks and endpoint probes — response time and availability over time."
        meta={<MetaChip>{checks.length} checks</MetaChip>}
        actions={
          <>
            <button
              onClick={loadChecks}
              className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-gray-300 hover:bg-neutral-800 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowCreate(v => !v)}
              className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
            >
              <Plus className="w-4 h-4" />
              New Check
            </button>
          </>
        }
      />

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 p-4 text-sm">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={newCheck.name}
              onChange={e => setNewCheck({ ...newCheck, name: e.target.value })}
              placeholder="Check name (e.g. API Health Check)"
              className="rounded-xl bg-neutral-950 border border-neutral-700 focus:border-blue-500 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
            />
            <input
              value={newCheck.url}
              onChange={e => setNewCheck({ ...newCheck, url: e.target.value })}
              placeholder="URL or host (https://… or host:port)"
              className="rounded-xl bg-neutral-950 border border-neutral-700 focus:border-blue-500 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
            />
            <select
              value={newCheck.type}
              onChange={e => setNewCheck({ ...newCheck, type: e.target.value as SyntheticCheck['type'] })}
              className="rounded-xl bg-neutral-950 border border-neutral-700 focus:border-blue-500 px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="http">HTTP</option>
              <option value="tcp">TCP</option>
              <option value="dns">DNS</option>
            </select>
            <button
              onClick={createCheck}
              className="rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 text-white font-bold px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
            >
              Create check
            </button>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Passing</p>
          <p className="text-2xl font-bold mt-1 text-green-500">{passing}</p>
        </div>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Failing</p>
          <p className="text-2xl font-bold mt-1 text-red-500">{failing}</p>
        </div>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Paused</p>
          <p className="text-2xl font-bold mt-1 text-gray-400">{paused}</p>
        </div>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Avg uptime</p>
          <p className="text-2xl font-bold mt-1 text-white">
            {avgUptime != null ? `${avgUptime.toFixed(2)}%` : '—'}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {withUptime.length > 0 ? `over ${withUptime.length} probed check${withUptime.length === 1 ? '' : 's'}` : 'no probe data yet'}
          </p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
          {statusChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === chip.value
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length} of {checks.length} checks
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Checks Table */}
        <div className="flex-1 min-w-0 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          {loading ? (
            <div className="space-y-3">
              <SkeletonCard rows={3} className="border-0 bg-transparent p-0" />
              <SkeletonCard rows={3} className="border-0 bg-transparent p-0" />
            </div>
          ) : checks.length === 0 ? (
            <EmptyState
              icon={<RocketIcon className="w-7 h-7" />}
              title="No synthetic checks yet"
              description="Create your first check to start probing endpoints from around the world. Response time and uptime charts appear once probes record data."
              action={
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold px-4 py-2 text-sm hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Create your first check
                </button>
              }
            />
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">No {statusFilter.toLowerCase()} checks</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-800">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Check</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Response</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Uptime</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Last Run</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((check) => {
                    const { icon: StatusIcon, color, badge, label } = statusConfig[check.status] ?? statusConfig.paused;
                    const TypeIcon = typeIcon[check.type] || WorldIcon;
                    const isSelected = selectedId === check.id;
                    return (
                      <tr
                        key={check.id}
                        className={`border-b border-neutral-800 hover:bg-white/[0.02] transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/[0.04]' : ''}`}
                        onClick={() => setSelectedId(isSelected ? null : check.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={`w-3.5 h-3.5 text-gray-600 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                            <div>
                              <p className="text-sm font-medium text-gray-200">{check.name}</p>
                              <p className="text-xs text-gray-500 font-mono truncate max-w-xs">{check.url}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <TypeIcon className="w-3.5 h-3.5" />
                            {check.type.toUpperCase()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className={`w-4 h-4 ${color}`} />
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge}`}>{label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {check.responseTime != null && check.responseTime > 0 ? (
                            <span className={`text-sm font-mono ${check.responseTime < 100 ? 'text-green-500' : check.responseTime < 500 ? 'text-yellow-500' : 'text-red-500'}`}>
                              {check.responseTime}ms
                            </span>
                          ) : (
                            <span className="text-sm font-mono text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {check.uptime != null ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-mono ${check.uptime >= 99.9 ? 'text-green-500' : check.uptime >= 99 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {check.uptime}%
                              </span>
                              <div className="w-12 h-1 rounded-full bg-neutral-800 overflow-hidden">
                                <div className={`h-full rounded-full ${uptimeTone(check.uptime)}`} style={{ width: `${Math.min(100, check.uptime)}%` }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm font-mono text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <ClockIcon className="w-3 h-3" />
                            {check.lastRun ? new Date(check.lastRun).toLocaleTimeString() : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleCheck(check.id)}
                              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer ${check.status === 'paused' ? 'bg-gradient-to-t from-blue-500 to-blue-600 border-blue-500 text-white shadow-sm shadow-blue-900/50 hover:from-blue-600 hover:to-blue-700' : 'bg-gradient-to-t from-neutral-950 to-neutral-700 border-neutral-700 text-white hover:from-neutral-900 hover:to-neutral-600'}`}
                            >
                              {check.status === 'paused' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                              {check.status === 'paused' ? 'Resume' : 'Pause'}
                            </button>
                            <button
                              onClick={() => deleteCheck(check.id)}
                              className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail panel: response-time chart + uptime + history. NOTE: the
            chart queries /v1/query with the check id as the service key —
            synthetic checks aren't catalog services, so it renders the honest
            empty state until a probe writes telemetry under that id. */}
        {selectedCheck && (
          <div className="w-full lg:w-96 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-5 h-fit shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white">{selectedCheck.name}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedCheck.url}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusConfig[selectedCheck.status]?.badge}`}>
                {statusConfig[selectedCheck.status]?.label}
              </span>
            </div>

            {/* Window selector for the chart */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase tracking-wider">Response time</span>
              <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
                {[60, 360, 1440].map((w) => (
                  <button
                    key={w}
                    onClick={() => setChartWindow(w)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${chartWindow === w ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'text-gray-500 border border-transparent'}`}
                  >
                    {w === 60 ? '1h' : w === 360 ? '6h' : '24h'}
                  </button>
                ))}
              </div>
            </div>
            <ResponseTimeChart check={selectedCheck} windowMinutes={chartWindow} />

            {/* Uptime */}
            <div>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span className="uppercase tracking-wider">Uptime</span>
                <span className="font-mono">
                  {selectedCheck.uptime != null ? `${selectedCheck.uptime}%` : '—'}
                </span>
              </div>
              {selectedCheck.uptime != null ? (
                <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${uptimeTone(selectedCheck.uptime)}`}
                    style={{ width: `${Math.min(100, selectedCheck.uptime)}%` }}
                  />
                </div>
              ) : (
                <p className="text-[11px] text-gray-600">No probe data recorded yet.</p>
              )}
            </div>

            {/* History */}
            <div>
              <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Probe history</h4>
              <CheckHistory check={selectedCheck} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
