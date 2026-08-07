import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CreditCard, ExternalLink, RefreshCw, ArrowRight, Activity, FileText, ListTree, Receipt } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { endpoints } from '@/lib/api';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const statusColor: Record<string, string> = {
  active: 'border-green-500/30 bg-green-500/10 text-green-400',
  trialing: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  past_due: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  canceled: 'border-red-500/30 bg-red-500/10 text-red-400',
  unpaid: 'border-red-500/30 bg-red-500/10 text-red-400',
};

const invoiceStatusColor: Record<string, string> = {
  paid: 'border-green-500/30 bg-green-500/10 text-green-400',
  open: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  void: 'border-neutral-600 bg-neutral-800 text-gray-400',
  uncollectible: 'border-red-500/30 bg-red-500/10 text-red-400',
};

// Stable empty reference so the chart useMemo doesn't churn on every render
// before the first query resolves (review fix).
const EMPTY_DAYS: unknown[] = [];

function fmtCurrency(amountMinor: number, currency = 'usd') {
  if (!amountMinor) return '$0.00';
  const symbol = currency === 'eur' ? '€' : currency === 'gbp' ? '£' : '$';
  return `${symbol}${(amountMinor / 100).toFixed(2)}`;
}

export default function BillingPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  // Usage chart window (30d default, matching the backend retention).
  const [chartDays, setChartDays] = useState(30);

  const { data: subsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['billing-subscriptions'],
    queryFn: async () => {
      const { data } = await endpoints.billing.subscriptions();
      return Array.isArray(data) ? data : data?.subscriptions ?? [];
    },
    refetchInterval: 30000,
  });

  // Usage over time (audit P4.15 follow-up): per-day metrics/logs/traces from
  // the collector. Honest zero state when the meter has nothing recorded.
  const { data: usageHistoryData, isLoading: historyLoading } = useQuery({
    queryKey: ['billing-usage-history', chartDays],
    queryFn: async () => {
      try {
        const { data } = await endpoints.billing.usageHistory(chartDays);
        const unwrapped = data?.data ?? data;
        return Array.isArray(unwrapped?.days) ? unwrapped.days : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 60000,
  });

  // Invoice history from Stripe (payment-service GET /api/v1/billing/invoices).
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: async () => {
      try {
        const { data } = await endpoints.billing.invoices();
        return Array.isArray(data) ? data : data?.invoices ?? [];
      } catch {
        return [];
      }
    },
    refetchInterval: 60000,
  });

  const openPortal = async () => {
    setPortalLoading(true);
    setPortalError('');
    try {
      const { data } = await endpoints.billing.createPortalSession();
      const url = data?.url;
      if (url) {
        window.location.href = url;
      } else {
        setPortalError('No portal session URL returned. Is Stripe configured?');
      }
    } catch (err: any) {
      setPortalError(err?.response?.data?.error ?? 'Failed to open the billing portal.');
    } finally {
      setPortalLoading(false);
    }
  };

  const subs = subsData ?? [];
  const days = usageHistoryData ?? EMPTY_DAYS;
  const invoices = invoicesData ?? [];

  // ── Usage over time ─────────────────────────────────────────────────────
  const hasHistory = days.some((d: any) => Number(d.metrics ?? 0) + Number(d.logs ?? 0) + Number(d.traces ?? 0) > 0);
  const usageChartOption = useMemo<EChartsOption>(() => {
    // Backend sends YYYYMMDD (no separators, e.g. "20260806") — parse to MM/DD
    // (review fix: split('-') on a separator-less string produced raw 8-digit
    // labels on the x-axis).
    const labels = days.map((d: any) => {
      const s = String(d.date ?? '');
      if (s.length === 8) return `${s.slice(4, 6)}/${s.slice(6, 8)}`;
      return s;
    });
    const metrics = days.map((d: any) => Number(d.metrics ?? 0));
    const logs = days.map((d: any) => Number(d.logs ?? 0));
    const traces = days.map((d: any) => Number(d.traces ?? 0));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(6, 9, 17, 0.9)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        textStyle: { color: '#fff' },
      },
      legend: {
        data: ['Metrics', 'Logs', 'Traces'],
        textStyle: { color: '#94a3b8' },
        top: 0,
      },
      grid: { left: '4%', right: '4%', bottom: '6%', top: '14%', containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          name: 'Metrics',
          type: 'bar',
          stack: 'total',
          data: metrics,
          itemStyle: { color: '#3b82f6', borderRadius: [0, 0, 0, 0] },
        },
        {
          name: 'Logs',
          type: 'bar',
          stack: 'total',
          data: logs,
          itemStyle: { color: '#eab308' },
        },
        {
          name: 'Traces',
          type: 'bar',
          stack: 'total',
          data: traces,
          itemStyle: { color: '#22c55e', borderRadius: [3, 3, 0, 0] },
        },
      ],
    };
  }, [days]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Subscription"
        subtitle="Manage your plan, payment method, usage and invoices"
        meta={<MetaChip>{subs.length} subscription{subs.length === 1 ? '' : 's'}</MetaChip>}
        actions={
          <>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {portalLoading ? 'Opening...' : 'Billing Portal'}
            </button>
          </>
        }
      />

      {status === 'success' && (
        <div className="rounded-2xl border border-green-500/40 bg-green-500/5 text-green-400 p-4 text-sm">
          Payment successful — your subscription is being activated.
        </div>
      )}
      {status === 'cancelled' && (
        <div className="rounded-2xl border border-neutral-700 bg-neutral-900 text-gray-400 p-4 text-sm">
          Checkout cancelled — no changes were made.
        </div>
      )}
      {portalError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/5 text-red-400 p-4 text-sm">
          {portalError}
        </div>
      )}

      {/* Usage today (audit P4.15) */}
      <UsageTodayCard />

      {/* Usage over time — chart from the collector's /v1/usage/history */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Usage Over Time
          </h2>
          <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
            {/* 90d omitted: collector retention is 30d, so a longer window would
                be mostly zero-fill (review fix) — keep the toggle honest. */}
            {[7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setChartDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  chartDays === d ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'text-gray-400 hover:text-white border border-transparent'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {historyLoading ? (
          <SkeletonCard rows={3} className="border-0 bg-transparent p-0" />
        ) : !hasHistory ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Activity className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">
              No usage recorded in this window yet — the chart fills in as the collector ingests telemetry.
            </p>
          </div>
        ) : (
          <ReactECharts option={usageChartOption} style={{ height: 280 }} theme="dark" />
        )}
      </div>

      {/* Invoice history */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-blue-400" />
          Invoices
        </h2>

        {invoicesLoading ? (
          <SkeletonCard rows={3} className="border-0 bg-transparent p-0" />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-7 h-7" />}
            title="No invoices yet"
            description="Invoices appear here after your first successful Stripe payment. You can also view and download them from the billing portal."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Invoice</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Amount</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">View</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-neutral-800 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-300 font-mono">{inv.number || inv.id?.substring(0, 14)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {inv.created_at ? new Date(inv.created_at * 1000).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-mono">
                      {fmtCurrency(Number(inv.amount_paid ?? 0), inv.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${invoiceStatusColor[inv.status] ?? 'border-neutral-600 bg-neutral-800 text-gray-400'}`}>
                        {inv.status ?? 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inv.hosted_invoice_url ? (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subscriptions */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-400" />
          Subscriptions
        </h2>

        {isLoading ? (
          <SkeletonCard rows={3} className="border-0 bg-transparent p-0" />
        ) : isError ? (
          <p className="text-sm text-red-400">Failed to load subscriptions.</p>
        ) : subs.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No active subscriptions.</p>
            <Link
              to="/landing#pricing"
              className="mt-4 inline-flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 text-sm hover:from-blue-600 hover:to-blue-700 transition-all"
            >
              View Plans
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {subs.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-3 border-b border-neutral-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-white">{s.plan_id || 'Subscription'}</p>
                  <p className="text-xs text-gray-500 font-mono">{s.id}</p>
                </div>
                <div className="flex items-center gap-3">
                  {s.current_period_end ? (
                    <span className="text-xs text-gray-500">
                      Renews {new Date(s.current_period_end * 1000).toLocaleDateString()}
                    </span>
                  ) : null}
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusColor[s.status ?? s.local_status] ?? 'border-neutral-600 bg-neutral-800 text-gray-400'}`}>
                    {s.status ?? s.local_status ?? 'unknown'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 text-sm text-gray-400">
        <p>
          Need to upgrade, downgrade, or cancel? Use the <span className="text-blue-400">Billing Portal</span> — it lets
          you manage your payment method and invoices securely on Stripe.
        </p>
      </div>
    </div>
  );
}

// Extracted to keep the main component focused: today's counters with honest
// zero state (audit P4.15).
function UsageTodayCard() {
  const { data: usageData } = useQuery({
    queryKey: ['billing-usage'],
    queryFn: async () => {
      try {
        const { data } = await endpoints.billing.usage();
        return data?.data ?? data ?? null;
      } catch {
        return null;
      }
    },
    refetchInterval: 60000,
  });

  const usage = usageData ?? {};
  const usageMetrics = Number(usage.metrics ?? 0);
  const usageLogs = Number(usage.logs ?? 0);
  const usageTraces = Number(usage.traces ?? 0);

  return (
    <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
      <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-blue-400" />
        Usage Today
      </h2>
      {!usageData ? (
        <p className="text-sm text-gray-500">
          Usage metering is not reachable — data appears once the collector is configured and telemetry is ingested.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              Metric points
            </div>
            <p className="text-2xl font-bold text-white font-mono">{usageMetrics.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <FileText className="w-3.5 h-3.5 text-yellow-400" />
              Log lines
            </div>
            <p className="text-2xl font-bold text-white font-mono">{usageLogs.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <ListTree className="w-3.5 h-3.5 text-green-400" />
              Trace spans
            </div>
            <p className="text-2xl font-bold text-white font-mono">{usageTraces.toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  );
}
