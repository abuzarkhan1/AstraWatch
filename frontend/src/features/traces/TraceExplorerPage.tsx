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
    <div className="relative min-h-screen bg-[#060911] text-white p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-[rgba(6,182,212,0.12)] blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full bg-[rgba(6,182,212,0.12)] blur-[120px]" />
      </div>

      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent font-bold">Trace Explorer</h1>
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
          <Button onClick={handleSearch} className="bg-cyan-600 hover:bg-cyan-700 text-white">Search</Button>
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
                  className={`backdrop-blur-2xl bg-neutral-950/80 border shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] rounded-2xl p-4 cursor-pointer transition-colors ${
                    selectedTrace?.traceId === trace.traceId ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-white/10 hover:bg-neutral-900/80'
                  }`}
                  onClick={() => setSelectedTrace(trace)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm text-gray-300 font-mono">{trace.traceId.substring(0, 16)}...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400 font-medium">{trace.spanCount} spans</span>
                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400 font-medium">{trace.serviceCount} services</span>
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
              <div className="backdrop-blur-2xl bg-neutral-950/80 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] rounded-2xl p-6 h-fit">
                <h2 className="text-lg font-semibold mb-4 text-cyan-100">Trace Detail</h2>
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
              <div className="text-center text-gray-500 py-12 text-sm backdrop-blur-2xl bg-neutral-950/80 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] rounded-2xl">
                Select a trace to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
