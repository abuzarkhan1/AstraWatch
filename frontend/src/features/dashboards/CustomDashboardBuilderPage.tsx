import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Save, Trash2, RotateCcw, LineChart } from 'lucide-react';
import ChartBarIcon from '@/components/ui/chart-bar-icon';
import FilledBellIcon from '@/components/ui/filled-bell-icon';
import ChartLineIcon from '@/components/ui/chart-line-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MetricsChart } from '@/components/ui/metrics-chart';
import { useServices, useMetrics } from '@/hooks/useApi';
import { useAppStore } from '@/hooks/useStore';

const widgetTypes = [
  { type: 'metric-chart', label: 'Metric Chart', icon: ChartBarIcon },
  { type: 'status', label: 'Status', icon: ChartLineIcon },
  { type: 'alert-list', label: 'Alert List', icon: FilledBellIcon },
];

const widgetColors: Record<string, string> = {
  'metric-chart': '#3b82f6',
  status: '#22c55e',
  'alert-list': '#ef4444',
};

const STORAGE_KEY = 'astrawatch_custom_dashboards_v1';

// Inner chart body so useMetrics is only mounted once a service is configured
// (review fix: the previous MetricWidget fired a bogus /v1/query with a fake
// "__none__" service id before any service was selected).
function MetricChartBody({ serviceId, metric }: { serviceId: string; metric: string }) {
  // Respect the global time window (header picker) + auto-refresh tick so the
  // custom builder behaves like the rest of the product. Window is memoized on
  // [timeRangeMinutes, lastRefresh] so the query key stays stable between
  // refresh ticks (review fix: it recomputed `to` on every render, churning
  // the react-query key and refetching continuously).
  const { timeRangeMinutes, lastRefresh } = useAppStore();
  const { from, to } = useMemo(() => {
    const _to = new Date();
    return {
      from: new Date(_to.getTime() - timeRangeMinutes * 60 * 1000).toISOString(),
      to: _to.toISOString(),
    };
  }, [timeRangeMinutes, lastRefresh]);
  const { data: result } = useMetrics(serviceId, metric, from, to, lastRefresh);

  const series = Array.isArray(result?.series) ? result.series : [];
  const xAxisData = series.map((p: any) =>
    p.ts ? new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  );
  const seriesData = series.map((p: any) => (typeof p.value === 'number' ? p.value : 0));

  if (seriesData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <LineChart className="w-6 h-6 text-gray-600 mb-1" />
        <p className="text-xs text-gray-500">No {metric} data in the selected window</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <MetricsChart
        title={`${metric} — ${serviceId.slice(0, 12)}`}
        xAxisData={xAxisData}
        seriesData={seriesData}
        height={140}
      />
    </div>
  );
}

// Real metric widget: queries the collector's /v1/query endpoint and renders a
// time-series chart (audit Part 5.10: widgets were placeholder nodes with no
// data behind them). Empty series render an honest empty state.
function MetricWidget({ node }: { node: any }) {
  const metric = node.data?.metric || 'latency';
  const serviceId = node.data?.serviceId;

  if (!serviceId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <LineChart className="w-6 h-6 text-gray-600 mb-1" />
        <p className="text-xs text-gray-500">Configure a service</p>
      </div>
    );
  }

  return <MetricChartBody serviceId={serviceId} metric={metric} />;
}

// Custom node renderer that shows the right widget body per type.
function WidgetNode({ data }: { data: any }) {
  const Icon = data.icon || ChartBarIcon;
  return (
    <div className="flex flex-col h-full overflow-hidden rounded-2xl bg-neutral-950/50 border border-white/10 text-white shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-medium truncate">{data.label}</span>
        </div>
        <span className="text-[9px] font-mono text-gray-500">{data.type}</span>
      </div>
      <div className="flex-1 min-h-0 p-2">
        <MetricWidget node={{ data }} />
      </div>
    </div>
  );
}

const nodeTypes = { widget: WidgetNode };

export default function CustomDashboardBuilderPage() {
  const { data: services = [] } = useServices();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [widgetCount, setWidgetCount] = useState(0);
  const [saveMsg, setSaveMsg] = useState('');
  // Pending config for the widget about to be added.
  const [newWidgetType, setNewWidgetType] = useState('metric-chart');
  const [newService, setNewService] = useState('');
  const [newMetric, setNewMetric] = useState('latency');
  // Persistence (audit Part 5.10: widgets vanished on refresh — dashboards were
  // never saved). Load the last dashboard from localStorage on mount; the
  // persist effect below writes any subsequent change back.
  const loadedRef = useRef(false);
  const firstLoadDone = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.nodes)) setNodes(saved.nodes);
        if (Array.isArray(saved.edges)) setEdges(saved.edges);
        if (typeof saved.widgetCount === 'number') setWidgetCount(saved.widgetCount);
      }
    } catch {
      // Corrupt cache — start fresh.
    }
    firstLoadDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((n: Node[], e: Edge[], c: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: n, edges: e, widgetCount: c }));
    } catch {
      // Storage full/unavailable — non-fatal.
    }
  }, []);

  // Review fix: persist in a single effect watching the real state instead of
  // inside each state setter (the old removeWidget wrote the stale `nodes`
  // closure back to storage, resurrecting deleted widgets on reload).
  useEffect(() => {
    if (!firstLoadDone.current) return;
    if (loadedRef.current) return; // skip the persist triggered by the load itself
    persist(nodes, edges, widgetCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, widgetCount]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addWidget = (type: string) => {
    const id = `widget-${widgetCount}`;
    const widgetDef = widgetTypes.find((w) => w.type === type);
    // metric-chart widgets carry their service/metric config; status and
    // alert-list keep the generic placeholder shape. The icon is resolved here
    // (review fix: WidgetNode used to read a never-set data.icon).
    const config: any =
      type === 'metric-chart'
        ? { serviceId: newService || undefined, metric: newMetric }
        : {};
    const newNode: Node = {
      id,
      type: 'widget',
      position: { x: 100 + (widgetCount % 3) * 320, y: 100 + Math.floor(widgetCount / 3) * 220 },
      data: { label: widgetDef?.label || type, type, icon: widgetDef?.icon, ...config },
      style: {
        borderColor: widgetColors[type] || 'rgba(255,255,255,0.1)',
        width: 300,
        height: 190,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setWidgetCount((c) => c + 1);
    setDialogOpen(false);
    setNewService('');
    setNewMetric('latency');
    setNewWidgetType('metric-chart');
  };

  const removeWidget = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const saveDashboard = () => {
    persist(nodes, edges, widgetCount);
    setSaveMsg('Dashboard saved to this browser.');
    setTimeout(() => setSaveMsg(''), 2500);
  };

  const resetDashboard = () => {
    localStorage.removeItem(STORAGE_KEY);
    loadedRef.current = true; // don't re-persist empty state on the next effect tick
    setNodes([]);
    setEdges([]);
    setWidgetCount(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Custom Dashboard Builder</h1>
          <p className="text-sm text-gray-500 mt-1">Drag and drop widgets to build your monitoring view</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-xs text-green-400">{saveMsg}</span>}
          <button
            onClick={resetDashboard}
            className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-gray-300 hover:border-neutral-600 hover:text-white transition-all cursor-pointer"
            title="Clear the saved dashboard"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={saveDashboard}
            className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400 hover:bg-green-500/20 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Dashboard
          </button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <button className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm">
                <Plus className="w-4 h-4" />
                Add Widget
              </button>
            </DialogTrigger>
            <DialogContent className="bg-neutral-900 border border-neutral-800 text-white shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-white">Add Widget</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 mt-2">
                {widgetTypes.map((w) => {
                  const Icon = w.icon;
                  return (
                    <button
                      key={w.type}
                      onClick={() => {
                        if (w.type === 'metric-chart') {
                          setNewWidgetType(w.type);
                        } else {
                          addWidget(w.type);
                        }
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-blue-500/40 transition-colors text-left cursor-pointer"
                    >
                      <Icon className="w-5 h-5 text-blue-400" />
                      <span className="text-sm text-gray-200">{w.label}</span>
                    </button>
                  );
                })}

                {newWidgetType === 'metric-chart' && (
                  <div className="rounded-xl border border-neutral-700 bg-neutral-950/60 p-3 space-y-2">
                    <p className="text-xs text-gray-400">
                      Metric Chart — pick a service and metric, then Add.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={newService}
                        onChange={(e) => setNewService(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none transition-all"
                      >
                        <option value="">Service...</option>
                        {services.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name || s.id.slice(0, 12)}</option>
                        ))}
                      </select>
                      <select
                        value={newMetric}
                        onChange={(e) => setNewMetric(e.target.value)}
                        className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none transition-all"
                      >
                        <option value="latency">latency</option>
                        <option value="error_rate">error_rate</option>
                        <option value="cpu">cpu</option>
                        <option value="memory">memory</option>
                        <option value="request_rate">request_rate</option>
                      </select>
                    </div>
                    <button
                      onClick={() => addWidget('metric-chart')}
                      disabled={!newService}
                      className="w-full rounded-lg bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 text-white text-xs font-bold py-2 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50"
                    >
                      Add Metric Chart
                    </button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden" style={{ height: 600 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_: any, node: any) => {
            if (node.type === 'widget') removeWidget(node.id);
          }}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#1a1a2e" gap={20} />
          <Controls className="bg-neutral-900 border-neutral-700 rounded-lg" />
          <MiniMap
            style={{ background: '#0a0a14' }}
            nodeColor={(node: any) => widgetColors[node.data?.type] || '#6b7280'}
            maskColor="rgba(0,0,0,0.6)"
          />
        </ReactFlow>
      </div>
      <p className="text-xs text-gray-600">
        Double-click a widget to remove it. Dashboards persist to this browser (audit: widgets used to vanish on refresh).
      </p>
    </div>
  );
}
