import { useState, useEffect } from 'react';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import ClockIcon from '@/components/ui/clock-icon';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

function WaterfallView({ spans }: { spans: Span[] }) {
  const sorted = [...spans].sort((a, b) => a.startTime - b.startTime);
  const minTime = sorted.length > 0 ? sorted[0].startTime : 0;
  const maxTime = sorted.length > 0 ? Math.max(...sorted.map((s) => s.startTime + s.duration)) : 1;
  const totalDuration = maxTime - minTime || 1;

  return (
    <div className="space-y-1">
      {sorted.map((span) => {
        const left = ((span.startTime - minTime) / totalDuration) * 100;
        const width = (span.duration / totalDuration) * 100;
        const depth = span.parentSpanId ? 1 : 0;
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
  const now = Date.now();
  const defaultTraces: Trace[] = [
    {
      traceId: 'tr-98a4f12b89c04112a4501b87c001',
      startTime: now - 3 * 60 * 1000,
      duration: 345.2,
      spanCount: 5,
      serviceCount: 3,
      spans: [
        { spanId: 'sp-1', operationName: 'POST /api/v1/billing/checkout-session', service: 'Payment API', duration: 345.2, startTime: now - 3 * 60 * 1000, status: 'OK' },
        { spanId: 'sp-2', parentSpanId: 'sp-1', operationName: 'SELECT * FROM users WHERE id = $1', service: 'User Service', duration: 12.4, startTime: now - 3 * 60 * 1000 + 15, status: 'OK' },
        { spanId: 'sp-3', parentSpanId: 'sp-1', operationName: 'Stripe API: POST /v1/checkout/sessions', service: 'Payment API', duration: 280.0, startTime: now - 3 * 60 * 1000 + 35, status: 'OK' },
        { spanId: 'sp-4', parentSpanId: 'sp-1', operationName: 'Publish Kafka event: billing-checkout', service: 'Payment API', duration: 4.1, startTime: now - 3 * 60 * 1000 + 320, status: 'OK' },
        { spanId: 'sp-5', parentSpanId: 'sp-1', operationName: 'Audit Log write', service: 'Auth Gateway', duration: 12.0, startTime: now - 3 * 60 * 1000 + 325, status: 'OK' },
      ],
    },
    {
      traceId: 'tr-55c918a204e19900bb61c201',
      startTime: now - 14 * 60 * 1000,
      duration: 1250.8,
      spanCount: 4,
      serviceCount: 2,
      spans: [
        { spanId: 'sp-10', operationName: 'GET /api/v1/catalog/services', service: 'User Service', duration: 1250.8, startTime: now - 14 * 60 * 1000, status: 'ERROR' },
        { spanId: 'sp-11', parentSpanId: 'sp-10', operationName: 'PostgreSQL: SELECT * FROM services', service: 'User Service', duration: 1100.2, startTime: now - 14 * 60 * 1000 + 20, status: 'ERROR' },
        { spanId: 'sp-12', parentSpanId: 'sp-10', operationName: 'Redis GET service_cache', service: 'User Service', duration: 1.5, startTime: now - 14 * 60 * 1000 + 1125, status: 'OK' },
        { spanId: 'sp-13', parentSpanId: 'sp-10', operationName: 'Fallback: In-Memory Default Catalog', service: 'User Service', duration: 110.0, startTime: now - 14 * 60 * 1000 + 1130, status: 'OK' },
      ],
    },
  ];

  const [traces, setTraces] = useState<Trace[]>(defaultTraces);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(defaultTraces[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['traces', search],
    queryFn: async () => {
      try {
        const { data } = await endpoints.traces.query({ q: search || 'all' });
        if (data?.items || Array.isArray(data)) return data;
      } catch (err) {
        console.warn('API fallback to mock traces');
      }
      return { items: defaultTraces };
    },
    enabled: true,
  });

  useEffect(() => {
    if (data?.items || Array.isArray(data)) {
      const items = data.items || data;
      setTraces(items);
      if (!selectedTrace && items.length > 0) setSelectedTrace(items[0]);
    }
  }, [data]);

  const handleSearch = () => {
    const q = search.trim();
    if (q) {
      setTraces((prev) =>
        prev.filter(
          (t) =>
            t.traceId.toLowerCase().includes(q.toLowerCase()) ||
            t.spans.some((s) => s.service.toLowerCase().includes(q.toLowerCase()))
        )
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white">Trace Explorer</h1>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search by trace ID or service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>
        <Button onClick={handleSearch} className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer">Search</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <div className="text-center text-gray-500 py-8">Loading traces...</div>
          ) : traces.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No traces found. Enter a trace ID or service name to search.
            </div>
          ) : (
            traces.map((trace) => (
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
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">{trace.spanCount} spans</span>
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">{trace.serviceCount} services</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{new Date(trace.startTime).toLocaleTimeString()}</span>
                    <span>{trace.duration.toFixed(0)}ms</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-1">
            {selectedTrace ? (
              <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 h-fit">
                <h2 className="text-lg font-semibold mb-4 text-white">Trace Detail</h2>
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
              <div className="text-center text-gray-500 py-12 text-sm rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
                Select a trace to view details
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
