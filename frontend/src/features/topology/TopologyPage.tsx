import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useServices, useMetrics } from '@/hooks/useApi';
import { useAppStore } from '@/hooks/useStore';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import PlugConnectedIcon from '@/components/ui/plug-connected-icon';
import ExternalLinkIcon from '@/components/ui/external-link-icon';

const SERVICE_COLORS: Record<string, string> = {
  HEALTHY: '#22c55e',
  DEGRADED: '#eab308',
  CRITICAL: '#ef4444',
  DOWN: '#6b7280',
};

const SERVICE_LABELS: Record<string, string> = {
  HEALTHY: 'Healthy',
  DEGRADED: 'Degraded',
  CRITICAL: 'Critical',
  DOWN: 'Down',
};

// Column metrics for the layered layout (dagre-style, hand-rolled so we don't
// add a dependency): each node gets a column = its depth in the dependency
// graph (roots at 0, direct dependents at 1, ...). Within a column, nodes are
// stacked vertically. If the graph is acyclic this produces the classic
// left-to-right dependency flow.
const COLUMN_GAP = 300;
const ROW_GAP = 190;

// ReactFlow's Node<D> requires D to be a Record<string, unknown>; keep the
// typed shape and let the index signature satisfy the constraint.
interface TopoNodeData extends Record<string, unknown> {
  label: string;
  serviceId: string;
  health?: string;
  tier?: string;
  healthScore?: number;
}

function computeLayout(nodes: Node<TopoNodeData>[], edges: Edge[]): Map<string, { x: number; y: number }> {
  const depths = new Map<string, number>();
  nodes.forEach((n) => depths.set(n.id, 0));

  // BFS layering: repeatedly relax edge constraints (target depth >= source + 1)
  // until stable — handles diamonds and fan-outs. Pass count is bounded by the
  // number of nodes so cyclic graphs (A→B→A) and self-loops terminate instead of
  // relaxing forever (review fix: the unbound while-loop hung on cycles).
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const sd = depths.get(e.source) ?? 0;
      const td = depths.get(e.target) ?? 0;
      if (td < sd + 1) {
        depths.set(e.target, sd + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byDepth = new Map<number, string[]>();
  nodes.forEach((n) => {
    const d = depths.get(n.id) ?? 0;
    const bucket = byDepth.get(d) ?? [];
    bucket.push(n.id);
    byDepth.set(d, bucket);
  });

  const positions = new Map<string, { x: number; y: number }>();
  // Column centering around the origin (review fix: the previous expression
  // cancelled to `depth * COLUMN_GAP` — the centering terms were dead math).
  const maxDepth = Math.max(0, ...byDepth.keys());
  byDepth.forEach((ids, depth) => {
    ids.forEach((id, i) => {
      positions.set(id, {
        x: (depth - maxDepth / 2) * COLUMN_GAP,
        y: i * ROW_GAP - ((ids.length - 1) * ROW_GAP) / 2,
      });
    });
  });
  return positions;
}

// Lightweight SVG sparkline rendered inside each node — real latency series
// from the collector's /v1/query endpoint (honest data, not fabricated).
function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  if (values.length < 2) {
    return (
      <div className="flex items-center justify-center h-8 text-[10px] text-gray-600">
        No latency data
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 150;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const stroke = tone === 'red' ? '#ef4444' : tone === 'yellow' ? '#eab308' : '#22c55e';
  return (
    <svg width={w} height={h} className="block" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

// Custom ReactFlow node: status dot, name, tier, health bar + latency sparkline.
function TopoNode({ data }: { data: TopoNodeData }) {
  const { timeRangeMinutes, lastRefresh } = useAppStore();
  // One memoized window so the query key stays stable between refresh ticks and
  // the end never freezes at mount (review fix: `to` had empty deps).
  const { from, to } = useMemo(() => {
    const _to = new Date();
    return {
      from: new Date(_to.getTime() - timeRangeMinutes * 60_000).toISOString(),
      to: _to.toISOString(),
    };
  }, [timeRangeMinutes, lastRefresh]);
  const { data: metricData } = useMetrics(data.serviceId, 'latency', from, to, lastRefresh);

  const values = useMemo(() => {
    const series = Array.isArray(metricData?.series) ? metricData.series : [];
    return series
      .map((p: any) => (typeof p.value === 'number' ? p.value : null))
      .filter((v: number | null): v is number => v !== null);
  }, [metricData]);

  const health = data.health ?? 'HEALTHY';
  const score = data.healthScore ?? 0;
  const color = SERVICE_COLORS[health] || '#6b7280';
  const tone = health === 'CRITICAL' || health === 'DOWN' ? 'red' : health === 'DEGRADED' ? 'yellow' : 'green';

  return (
    <div
      className="relative rounded-2xl text-white bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border shadow-[0px_-13px_300px_0px_rgba(9,0,255,0.15)] p-5 transition-all duration-300"
      style={{ borderColor: color, width: 230 }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-sm font-semibold truncate">{data.label}</span>
        </div>
        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400 font-medium uppercase tracking-wider shrink-0">
          {data.tier || 'STANDARD'}
        </span>
      </div>
      <div className="text-[11px] text-gray-500 mb-2">{SERVICE_LABELS[health] || health} · {score}%</div>

      {/* Health bar */}
      <div className="w-full h-1.5 rounded-full bg-black/60 border border-neutral-700 overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, score)}%`, background: color }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">latency</span>
        <Sparkline values={values} tone={tone} />
      </div>
    </div>
  );
}

const nodeTypes = { topo: TopoNode };

export default function TopologyPage() {
  const { data: services, isLoading } = useServices();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TopoNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const serviceList = Array.isArray(services) ? services : [];

  // Layered auto-layout + edges. Recomputes when services or dependencies change.
  useEffect(() => {
    if (!services) return;
    let cancelled = false;

    const build = async () => {
      const svcNodes: Node<TopoNodeData>[] = serviceList.map((svc: any, i: number) => ({
        id: svc.id,
        type: 'topo',
        position: { x: 0, y: i * ROW_GAP }, // placeholder — layout below sets real positions
        data: {
          label: svc.name || svc.id,
          serviceId: svc.id,
          health: svc.status,
          tier: svc.tier,
          healthScore: svc.healthScore,
        },
      }));

      const svcEdges: Edge[] = [];
      const { endpoints } = await import('@/lib/api');
      for (const svc of serviceList) {
        try {
          const { data: deps } = await endpoints.services.getDependencies(svc.id);
          if (deps && Array.isArray(deps)) {
            for (const dep of deps) {
              svcEdges.push({
                id: `e-${svc.id}-${dep.targetId || dep.id || dep}`,
                source: svc.id,
                target: dep.targetId || dep.id || dep,
                animated: true,
                style: { stroke: '#3b3f6b' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#3b3f6b' },
              });
            }
          }
        } catch (e) {
          // A dependency fetch failure shouldn't kill the whole graph — the
          // other services still render.
          console.warn('Failed to fetch dependencies for', svc.id);
        }
      }

      if (cancelled) return;
      const positions = computeLayout(svcNodes, svcEdges);
      const positioned = svcNodes.map((n) => ({
        ...n,
        position: positions.get(n.id) ?? n.position,
      }));
      setNodes(positioned);
      setEdges(svcEdges);
    };

    build();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const selectedData = selectedNode?.data;

  const healthyCount = serviceList.filter((s: any) => s.status === 'HEALTHY').length;
  const degradedCount = serviceList.filter((s: any) => s.status === 'DEGRADED').length;
  const criticalCount = serviceList.filter(
    (s: any) => s.status === 'CRITICAL' || s.status === 'DOWN'
  ).length;

  const reLayout = useCallback(() => {
    const positions = computeLayout(nodes, edges);
    setNodes((nds) => nds.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })));
  }, [nodes, edges, setNodes]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Topology"
        subtitle="Live dependency graph — columns show dependency depth, colors show health."
        meta={<MetaChip>{serviceList.length} services</MetaChip>}
        actions={
          <button
            onClick={reLayout}
            className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
          >
            <PlugConnectedIcon className="w-4 h-4" />
            Re-layout
          </button>
        }
      />

      <div className="flex gap-4">
        <div className="relative flex-1 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-0 overflow-hidden" style={{ height: 640 }}>
          {isLoading ? (
            <div className="p-6 space-y-4">
              <SkeletonCard rows={3} />
              <SkeletonCard rows={2} />
            </div>
          ) : serviceList.length === 0 ? (
            <EmptyState
              icon={<PlugConnectedIcon className="w-7 h-7" />}
              title="No services to map yet"
              description="The topology renders your service catalog and its dependencies. Once services report telemetry, the dependency graph appears here automatically."
            />
          ) : (
            <>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onPaneClick={() => setSelectedId(null)}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                attributionPosition="bottom-left"
              >
                <Background color="#1a1a2e" gap={20} />
                <Controls className="rounded-lg [&_.react-flow__controls-button]:bg-neutral-900 [&_.react-flow__controls-button]:border-b-neutral-800 [&_.react-flow__controls-button]:text-neutral-300 [&_.react-flow__controls-button]:hover:bg-neutral-800" />
                <MiniMap
                  style={{ background: '#0a0a14' }}
                  nodeColor={(node: any) => SERVICE_COLORS[node.data?.health] || '#6b7280'}
                  maskColor="rgba(0,0,0,0.6)"
                />
              </ReactFlow>

              {/* Status legend (SaaS standard overlay) */}
              <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-neutral-800 bg-neutral-950/80 backdrop-blur px-3 py-2.5 space-y-1.5">
                {(
                  [
                    ['HEALTHY', healthyCount, '#22c55e'],
                    ['DEGRADED', degradedCount, '#eab308'],
                    ['CRITICAL', criticalCount, '#ef4444'],
                  ] as const
                ).map(([key, count, color]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    <span className="text-gray-300">{SERVICE_LABELS[key]}</span>
                    <span className="text-gray-500 font-mono">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {selectedData && (
          <div className="w-80 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4 h-fit shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg text-white">{selectedData.label}</h3>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERVICE_COLORS[selectedData.health || ''] || '#6b7280' }} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span style={{ color: SERVICE_COLORS[selectedData.health || ''] || '#6b7280' }} className="font-medium">
                  {SERVICE_LABELS[selectedData.health || ''] || selectedData.health || 'UNKNOWN'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Tier</span>
                <span className="text-gray-200">{selectedData.tier || 'STANDARD'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Health score</span>
                <span className="text-gray-200 font-mono">{selectedData.healthScore ?? '—'}%</span>
              </div>
            </div>

            {/* Node click → incidents for this service */}
            <button
              onClick={() => navigate(`/incidents?service=${encodeURIComponent(selectedData.serviceId)}`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
            >
              <TriangleAlertIcon className="w-4 h-4" />
              View Incidents
              <ExternalLinkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
