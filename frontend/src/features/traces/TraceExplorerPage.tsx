import { useState, useEffect } from 'react';
import { Search, Clock, ArrowRight } from 'lucide-react';
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
            <div className="flex-1 h-5 bg-black/60 border border-white/10 rounded relative overflow-hidden">
              <div
                className={`absolute h-full rounded ${
                  span.status === 'ERROR' ? 'bg-red-500/60' : 'bg-blue-500/40'
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

  const { data, isLoading } = useQuery({
    queryKey: ['traces', search],
    queryFn: async () => {
      const { data } = await endpoints.metrics.query({ type: 'traces', q: search || 'all' });
      return data;
    },
    enabled: true,
  });

  useEffect(() => {
    if (data?.items || Array.isArray(data)) {
      setTraces(data.items || data);
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
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />

      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white">Trace Explorer</h1>
        </div>

        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by trace ID or service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9 bg-neutral-900/50 border-white/10 text-white"
            />
          </div>
          <Button onClick={handleSearch} className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all">Search</Button>
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
                  className={`bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border text-white rounded-2xl p-6 shadow-xl cursor-pointer transition-colors ${
                    selectedTrace?.traceId === trace.traceId ? 'border-blue-500/50 bg-blue-500/10' : 'border-neutral-800 hover:border-neutral-700'
                  }`}
                  onClick={() => setSelectedTrace(trace)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
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
              <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-xl h-fit">
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
                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Waterfall</h4>
                  <WaterfallView spans={selectedTrace.spans} />
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12 text-sm bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl shadow-xl">
                Select a trace to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
