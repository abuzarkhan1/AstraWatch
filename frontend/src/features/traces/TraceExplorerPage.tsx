import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/hooks/useStore';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import ClockIcon from '@/components/ui/clock-icon';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import ScanBarcodeIcon from '@/components/ui/scan-barcode-icon';
import ChartLineIcon from '@/components/ui/chart-line-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';

interface Span {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  service: string;
  startTime: number;
  duration: number;
  status: 'OK' | 'ERROR';
  tags?: Record<string, string>;
}

interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  duration: number;
  serviceCount: number;
  spanCount: number;
}

// SaaS trace list filters (Datadog/Sentry style): status (any span errored) and
// a duration quick-filter for slow traces.
type StatusFilter = 'ALL' | 'ERROR' | 'OK';
type DurationFilter = 'ALL' | 'SLOW' | 'FAST';

function WaterfallView({ spans }: { spans: Span[] }) {
  const sorted = [...spans].sort((a, b) => a.startTime - b.startTime);
  const minTime = sorted.length > 0 ? sorted[0].startTime : 0;
  const maxTime = sorted.length > 0 ? Math.max(...sorted.map((s) => s.startTime + s.duration)) : 1;
  const totalDuration = maxTime - minTime || 1;

  // Real tree depth: walk each span's parent chain (audit: depth was hardcoded
  // to `parentSpanId ? 1 : 0`, so all children of children flattened to level 1
  // — the waterfall could never show real distributed-trace nesting).
  const depthBySpan = new Map<string, number>();
  const computeDepth = (spanId: string, visited: Set<string>): number => {
    if (depthBySpan.has(spanId)) return depthBySpan.get(spanId)!;
    if (visited.has(spanId)) return 0; // cycle guard
    visited.add(spanId);
    const span = sorted.find((s) => s.spanId === spanId);
    let depth = 0;
    if (span?.parentSpanId) {
      depth = 1 + computeDepth(span.parentSpanId, visited);
    }
    depthBySpan.set(spanId, depth);
    return depth;
  };
  sorted.forEach((s) => computeDepth(s.spanId, new Set()));

  return (
    <div className="space-y-1">
      {sorted.map((span) => {
        const left = ((span.startTime - minTime) / totalDuration) * 100;
        const width = (span.duration / totalDuration) * 100;
        const depth = depthBySpan.get(span.spanId) ?? 0;
        return (
          <div key={span.spanId} className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1 w-48 shrink-0 text-gray-400" style={{ paddingLeft: depth * 16 }}>
              <span className="truncate">{span.operationName}</span>
            </div>
            <div className="flex-1 h-5 bg-neutral-800 border-0 rounded relative overflow-hidden">
              <div
                className={`absolute h-full rounded ${
                  span.status === 'ERROR' ? 'bg-red-500/60' : 'bg-blue-500/50'
                }`}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
              />
            </div>
            <span className="w-16 text-right text-gray-500 shrink-0">
              {span.duration.toFixed(1)}ms
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function TraceExplorerPage() {
  const [search, setSearch] = useState('');
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('ALL');

  // Wire the global header time-range into the trace query so the page honours
  // the same window the dashboard uses (audit: traces always queried the full
  // history — the header picker had no effect here).
  const { timeRangeMinutes, lastRefresh } = useAppStore();
  const from = useMemo(() => new Date(Date.now() - timeRangeMinutes * 60_000).toISOString(), [timeRangeMinutes, lastRefresh]);
  const to = useMemo(() => new Date().toISOString(), [lastRefresh]);

  const { data, isLoading } = useQuery({
    queryKey: ['traces', search, from, to],
    queryFn: async () => {
      try {
        const { data } = await endpoints.traces.query({ q: search || 'all', from, to });
        // The collector wraps results in {success, data: {items}, ...} (audit F7);
        // unwrap defensively so real backend traces render instead of the mock
        // fallback. Backend startTime/duration arrive as RFC3339 strings and
        // numbers, so normalize to the numeric epoch-ms shape the UI expects.
        const items = data?.data?.items ?? data?.data ?? data?.items ?? null;
        if (Array.isArray(items)) {
          // Guard against a missing/undefined startTime so the waterfall's
          // min/max math never sees NaN from a real backend payload.
          const toMs = (v: any) => (v ? new Date(v).getTime() : 0);
          const normalized: Trace[] = items.map((t: any) => ({
            traceId: t.traceId,
            startTime: toMs(t.startTime),
            duration: Number(t.duration) || 0,
            spanCount: Number(t.spanCount) || (t.spans?.length || 0),
            serviceCount: Number(t.serviceCount) || 0,
            spans: (t.spans || []).map((s: any) => ({
              spanId: s.spanId,
              parentSpanId: s.parentSpanId,
              operationName: s.operationName,
              service: s.service,
              startTime: toMs(s.startTime),
              duration: Number(s.duration) || 0,
              status: s.status === 'ERROR' ? 'ERROR' : 'OK',
              tags: s.tags,
            })),
          }));
          return { items: normalized };
        }
      } catch (err) {
        // Honest empty state — no fabricated mock traces (audit: this log claimed
        // a mock fallback that no longer exists).
        console.warn('Failed to load traces; showing empty state');
      }
      return { items: [] };
    },
    enabled: true,
  });

  useEffect(() => {
    const items = (data as { items?: Trace[] } | Trace[] | null | undefined) as
      | { items?: Trace[] }
      | Trace[]
      | null
      | undefined;
    if (!items) return;
    const list = Array.isArray(items) ? items : items.items;
    // A successful response — even an empty one — replaces the current list so a
    // zero-result search never leaves stale traces on screen (review fix).
    if (Array.isArray(list)) {
      setTraces(list);
      setSelectedTrace((prev) => prev || list[0] || null);
    }
  }, [data]);

  // Combined client-side filters + derived summary stats (all honest — computed
  // from the real loaded traces).
  const hasError = (t: Trace) => t.spans.some((s) => s.status === 'ERROR');
  const filtered = traces.filter((t) => {
    if (statusFilter === 'ERROR' && !hasError(t)) return false;
    if (statusFilter === 'OK' && hasError(t)) return false;
    if (durationFilter === 'SLOW' && t.duration < 500) return false;
    if (durationFilter === 'FAST' && t.duration >= 500) return false;
    return true;
  });

  // Keep the detail panel in sync with the filtered list (review fix: selecting
  // a trace then applying a filter left the panel showing a trace the list no
  // longer contained).
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedTrace(null);
      return;
    }
    setSelectedTrace((prev) => (prev && filtered.some((t) => t.traceId === prev.traceId) ? prev : filtered[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, durationFilter]);

  const summary = useMemo(() => {
    const errorCount = traces.filter(hasError).length;
    const avgDuration =
      traces.length > 0 ? traces.reduce((sum, t) => sum + t.duration, 0) / traces.length : 0;
    const slowest = traces.reduce((max, t) => (t.duration > max ? t.duration : max), 0);
    return { total: traces.length, errorCount, avgDuration, slowest };
  }, [traces]);

  const statusChips: Array<{ value: StatusFilter; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'ERROR', label: `Errors · ${summary.errorCount}` },
    { value: 'OK', label: 'OK only' },
  ];
  const durationChips: Array<{ value: DurationFilter; label: string }> = [
    { value: 'ALL', label: 'Any duration' },
    { value: 'SLOW', label: 'Slow (> 500ms)' },
    { value: 'FAST', label: 'Fast (< 500ms)' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trace Explorer"
        subtitle="Search distributed traces and inspect span waterfalls."
        meta={<MetaChip>{summary.total} traces</MetaChip>}
      />

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-blue-500">{summary.total}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Traces</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-red-500">{summary.errorCount}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">With errors</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-green-500">
            {summary.avgDuration > 0 ? `${summary.avgDuration.toFixed(0)}ms` : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Avg duration</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-yellow-500">
            {summary.slowest > 0 ? `${summary.slowest.toFixed(0)}ms` : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Slowest</div>
        </div>
      </div>

      {/* Search + filter chips */}
      <div className="relative max-w-xl">
        <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          placeholder="Search by trace ID or service..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
          {statusChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === chip.value
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
          {durationChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setDurationFilter(chip.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                durationFilter === chip.value
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length} of {traces.length} traces
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <SkeletonCard rows={3} />
              <SkeletonCard rows={3} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={search || statusFilter !== 'ALL' || durationFilter !== 'ALL' ? <TriangleAlertIcon className="w-7 h-7" /> : <ScanBarcodeIcon className="w-7 h-7" />}
              title={search || statusFilter !== 'ALL' || durationFilter !== 'ALL' ? 'No traces match your filters' : 'No traces found'}
              description={
                search || statusFilter !== 'ALL' || durationFilter !== 'ALL'
                  ? 'Try a different trace ID, service name, status, or duration filter.'
                  : 'Traces appear here once the collector starts receiving distributed traces (OTLP or agent-reported).'
              }
            />
          ) : (
            filtered.map((trace) => (
              <div
                key={trace.traceId}
                className={`rounded-2xl text-white bg-neutral-900 border p-6 cursor-pointer hover:border-neutral-700 transition-colors ${
                  selectedTrace?.traceId === trace.traceId ? 'border-blue-500' : 'border-neutral-800'
                }`}
                onClick={() => setSelectedTrace(trace)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-300 font-mono">{trace.traceId.substring(0, 16)}...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasError(trace) && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-400 font-medium">ERROR</span>
                    )}
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">{trace.spanCount} spans</span>
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">{trace.serviceCount} services</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{new Date(trace.startTime).toLocaleTimeString()}</span>
                  <span className={trace.duration >= 500 ? 'text-yellow-500 font-medium' : ''}>{trace.duration.toFixed(0)}ms</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-1">
          {selectedTrace ? (
            <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 h-fit">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Trace Detail</h2>
                {hasError(selectedTrace) && (
                  <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-400 font-medium">
                    <TriangleAlertIcon className="w-3 h-3" /> Errors
                  </span>
                )}
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Trace ID</span>
                  <span className="text-gray-300 font-mono">{selectedTrace.traceId.substring(0, 16)}...</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Duration</span>
                  <span className="text-gray-300">{selectedTrace.duration.toFixed(0)}ms</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Services</span>
                  <span className="text-gray-300">{selectedTrace.serviceCount}</span>
                </div>
              </div>
              <div className="border-t border-neutral-800 pt-4">
                <h4 className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Waterfall</h4>
                <WaterfallView spans={selectedTrace.spans} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 text-center text-sm text-gray-500 py-12">
              <ChartLineIcon className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              Select a trace to view its waterfall
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
