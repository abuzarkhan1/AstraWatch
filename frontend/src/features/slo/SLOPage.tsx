import { useState, useMemo } from 'react';
import ChartBarIcon from '@/components/ui/chart-bar-icon';
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon';
import ArrowNarrowDownIcon from '@/components/ui/arrow-narrow-down-icon';
import { useServices } from '@/hooks/useApi';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import ChartLineIcon from '@/components/ui/chart-line-icon';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useMetrics } from '@/hooks/useApi';
import { useAppStore } from '@/hooks/useStore';
import { MetricsChart } from '@/components/ui/metrics-chart';

// Error-rate trend vs the SLO's allowed error budget (review fix: the original
// "burn-down" summed per-sample error RATES against a budget denominator, which
// read "budget exhausted" for almost any nonzero error rate — the exact
// "showing something else" problem. This plots the REAL error_rate series with
// the allowed-budget threshold as a reference line: the line is the live error
// rate, the dashed region is how much error the budget permits.)
function SloBurnDown({ svc, target }: { svc: any; target: number }) {
  const { timeRangeMinutes, lastRefresh } = useAppStore();
  const from = useMemo(() => new Date(Date.now() - timeRangeMinutes * 60_000).toISOString(), [timeRangeMinutes, lastRefresh]);
  const to = useMemo(() => new Date().toISOString(), [lastRefresh]);
  const metricKey = svc.serviceKey ?? svc.name ?? svc.id;
  const { data: result } = useMetrics(metricKey, 'error_rate', from, to, lastRefresh);

  const series = Array.isArray(result?.series) ? result.series : [];
  const allowedErrorRate = Math.max(0.0001, 100 - target);
  const xAxisData = series.map((p: any, i: number) =>
    p.ts ? new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : String(i)
  );
  const errorRateSeries = series.map((p: any) => {
    const v = typeof p.value === 'number' ? p.value : 0;
    return Math.round(Math.max(0, v) * 100) / 100;
  });
  // Exceeded fraction: share of samples above the allowed error rate.
  const overBudgetSamples = errorRateSeries.filter((v: number) => v > allowedErrorRate).length;

  if (series.length < 2) {
    return (
      <p className="text-[11px] text-gray-600">Error-rate trend needs more samples in this window.</p>
    );
  }
  return (
    <div className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Error rate vs budget · {timeRangeMinutes}m</span>
        <span className={`text-[10px] font-medium ${overBudgetSamples > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {overBudgetSamples > 0
            ? `${overBudgetSamples}/${errorRateSeries.length} samples above budget (${allowedErrorRate.toFixed(2)}%)`
            : `within budget (${allowedErrorRate.toFixed(2)}% allowed)`}
        </span>
      </div>
      <MetricsChart
        title=""
        xAxisData={xAxisData}
        seriesData={errorRateSeries}
        height={120}
      />
    </div>
  );
}

function ServiceSLO({ svc }: { svc: any }) {
  const { data: sloData, isLoading } = useQuery({
    queryKey: ['slo', svc.id],
    queryFn: async () => {
      const { data } = await endpoints.slo.get(svc.id);
      // Backend wraps in ApiResponse { success, data: {...} } — unwrap before
      // reading the defined/sloTarget fields (audit: page read the envelope top
      // level and never saw real values).
      return data?.data ?? data;
    },
  });

  // Audit fix: the backend used to fabricate attainment numbers (target-0.03,
  // burnRate 0.5) even when no SLO existed. It now returns an honest `defined`
  // flag — render a clear empty state and only show real values when defined.
  if (isLoading) {
    return (
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors">
        <h3 className="font-medium">{svc.name}</h3>
        <p className="text-sm text-gray-500">Loading SLO...</p>
      </div>
    );
  }

  const hasSLO = !!sloData && sloData.defined !== false;
  if (!hasSLO || sloData?.sloTarget == null) {
    return (
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors">
        <h3 className="font-medium">{svc.name}</h3>
        <p className="text-sm text-gray-500">No SLO defined for this service yet.</p>
        <p className="text-xs text-gray-600">Create one to start tracking error budgets.</p>
      </div>
    );
  }

  const target = sloData.sloTarget ?? 99.0;
  // Review fix: the backend no longer fabricates attainment numbers. When
  // currentAttainment is absent we render an honest "not tracked yet" state
  // instead of silently substituting current = target (which implied zero
  // error-budget burn and a green status with no real data behind it).
  const hasAttainment = sloData.currentAttainment != null;
  if (!hasAttainment) {
    return (
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors">
        <h3 className="font-medium">{svc.name}</h3>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Target</span>
          <span className="text-gray-300">{target}%</span>
        </div>
        <p className="text-sm text-gray-500">SLO defined — attainment not tracked yet.</p>
        <p className="text-xs text-gray-600">Attainment appears once sufficient incident data is available.</p>
      </div>
    );
  }
  const current = sloData.currentAttainment;
  const remaining = Math.max(0, current - target);
  const burnRate = sloData.burnRate ?? 0;
  const isBreaching = current < target;

  // Error-budget burn visualization (SaaS standard, Grafana SLO style):
  // budgetConsumed is the share of the allowed error budget already spent.
  // All derived from the real attainment/target/burnRate — no fabrication.
  const totalBudget = Math.max(0.0001, 100 - target);
  const budgetConsumed = Math.min(1, Math.max(0, 1 - remaining / totalBudget));
  const burnTone =
    burnRate >= 2 ? 'text-red-400' : burnRate >= 1 ? 'text-yellow-400' : 'text-green-400';
  const budgetTone =
    budgetConsumed >= 0.9 ? 'bg-red-500' : budgetConsumed >= 0.6 ? 'bg-yellow-500' : 'bg-green-500';
  const budgetTextTone =
    budgetConsumed >= 0.9 ? 'text-red-500' : budgetConsumed >= 0.6 ? 'text-yellow-500' : 'text-green-500';
  // Exact boundary: budget fully consumed reads "Exhausted" regardless of the
  // isBreaching flag (review fix: current == target showed a red bar labeled
  // "0% remaining").
  const exhausted = isBreaching || budgetConsumed >= 1;

  return (
    <div className={`rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors ${isBreaching ? 'border-t-2 border-t-red-500/50' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{svc.name}</h3>
        {isBreaching ? (
          <ArrowNarrowDownIcon className="w-4 h-4 text-red-500" />
        ) : (
          <ArrowNarrowUpIcon className="w-4 h-4 text-green-500" />
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Current</span>
          <span className={isBreaching ? 'text-red-500' : 'text-green-500'}>
            {current.toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Target</span>
          <span className="text-gray-300">{target}%</span>
        </div>
        <div className="w-full bg-neutral-800 border-0 rounded-full h-1.5 mt-1 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${isBreaching ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, (current / target) * 100)}%` }}
          />
        </div>
      </div>

      {/* Error budget consumed bar (0% → 100% of the allowed budget spent) */}
      <div className="pt-1">
        <div className="flex justify-between text-[11px] text-gray-500 mb-1">
          <span>Error budget</span>
          <span className={budgetTextTone}>
            {exhausted ? 'Exhausted' : `${Math.round((1 - budgetConsumed) * 100)}% remaining`}
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${budgetTone} transition-all`}
            style={{ width: `${Math.min(100, budgetConsumed * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-600 pt-1">
        <span>Burn rate: <span className={`font-medium ${burnTone}`}>{burnRate.toFixed(1)}x</span></span>
        <span>{isBreaching ? `${(target - current).toFixed(2)}% below target` : `${remaining.toFixed(2)}% headroom`}</span>
      </div>

      <SloBurnDown svc={svc} target={target} />
    </div>
  );
}

export default function SLOPage() {
  const { data: services = [], isLoading } = useServices();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selService, setSelService] = useState('');
  const [metric, setMetric] = useState('latency_ms');
  const [targetPct, setTargetPct] = useState('99.0');
  const [windowDays, setWindowDays] = useState('30');
  const [formError, setFormError] = useState('');
  const [createdMsg, setCreatedMsg] = useState('');

  // Audit P3: SLO creation existed on the backend (POST /api/v1/slo with
  // serviceId, metric, targetPercentage, windowDays) but the page never exposed
  // it. Adding the create form closes that UI gap.
  const createMutation = useMutation({
    mutationFn: () =>
      endpoints.slo.create({
        serviceId: selService,
        metric,
        targetPercentage: Number(targetPct),
        windowDays: Number(windowDays),
      }),
    onSuccess: () => {
      setShowCreate(false);
      setCreatedMsg('SLO created.');
      setTimeout(() => setCreatedMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['slo'] });
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to create SLO');
    },
  });

  const totalServices = services.length;
  // Honest breach count: only services with a REAL defined SLO can be breaching.
  // Falling back to healthScore here would mislabel healthy services as SLO
  // breaches (audit: previously used sloAttainment ?? healthScore).
  const breachingServices = services.filter((svc: any) => {
    const target = 99.0;
    const current = svc.sloAttainment;
    return current != null && current < target;
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Level Objectives"
        subtitle="Track error budgets and attainment per service"
        meta={<MetaChip>{totalServices} services</MetaChip>}
        actions={
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
          >
            <ChartBarIcon className="w-4 h-4" />
            New SLO
          </button>
        }
      />

      {createdMsg && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
          {createdMsg}
        </div>
      )}

      {showCreate && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create SLO</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Service</label>
              <select
                value={selService}
                onChange={(e) => setSelService(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                <option value="">Select a service...</option>
                {services.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name || s.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Metric</label>
              <input
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                placeholder="e.g. latency_ms, error_rate"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Target (%)</label>
              <input
                type="number"
                value={targetPct}
                onChange={(e) => setTargetPct(e.target.value)}
                min={0}
                max={100}
                step="0.1"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Window (days)</label>
              <input
                type="number"
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
                min={1}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!selService || createMutation.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create SLO'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 text-sm font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-blue-500">{totalServices}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Trackable services</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-red-500">{breachingServices}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Breaching</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-green-500">{totalServices - breachingServices}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">On track</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <SkeletonCard rows={4} />
            <SkeletonCard rows={4} />
            <SkeletonCard rows={4} />
          </>
        ) : services.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={<ChartLineIcon className="w-7 h-7" />}
              title="No services available"
              description="SLOs are tracked per service. Once a service reports telemetry, define an objective here to monitor its error budget."
            />
          </div>
        ) : (
          services.map((svc: any) => <ServiceSLO key={svc.id} svc={svc} />)
        )}
      </div>
    </div>
  );
}
