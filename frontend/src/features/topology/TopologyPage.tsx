import { useState, useEffect } from 'react';
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
import { useServices } from '@/hooks/useApi';

const SERVICE_COLORS: Record<string, string> = {
  HEALTHY: '#22c55e',
  DEGRADED: '#eab308',
  CRITICAL: '#ef4444',
  DOWN: '#6b7280',
};

export default function TopologyPage() {
  const { data: services, isLoading } = useServices();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  useEffect(() => {
    if (!services) return;

    const fetchTopology = async () => {
      const svcNodes: Node[] = services.map((svc: any, i: number) => ({
        id: svc.id,
        type: 'default',
        position: { x: 200 + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 150 },
        data: { label: svc.name, health: svc.status, tier: svc.tier },
        style: {
          background: '#0b101d',
          border: `2px solid ${SERVICE_COLORS[svc.status] || '#6b7280'}`,
          color: '#f3f4f6',
          borderRadius: 8,
          padding: 12,
          width: 180,
        },
      }));
      setNodes(svcNodes);

      const svcEdges: Edge[] = [];
      const { endpoints } = await import('@/lib/api');
      for (const svc of services) {
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
          console.error('Failed to fetch dependencies for', svc.id, e);
        }
      }
      setEdges(svcEdges);
    };
    fetchTopology();
  }, [services, setNodes, setEdges]);

  const data = selectedNode?.data as { label?: string; health?: string; tier?: string } | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Service Topology</h1>
        <span className="text-sm text-gray-500">{services?.length || 0} services</span>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl shadow-[0_16px_40px_0_rgba(0,0,0,0.6)]" style={{ height: 600 }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-gray-500">Loading topology...</div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedNode(node)}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#1e293b" gap={20} />
              <Controls className="bg-neutral-950/80 border-white/10 rounded-lg" />
              <MiniMap
                style={{ background: '#0b101d' }}
                nodeColor={(node: any) => SERVICE_COLORS[node.data?.health] || '#6b7280'}
                maskColor="rgba(0,0,0,0.6)"
              />
            </ReactFlow>
          )}
        </div>

        {data && (
          <div className="w-72 backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl p-4 space-y-3 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)]">
            <h3 className="font-semibold text-lg">{data.label}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span style={{ color: SERVICE_COLORS[data.health || ''] || '#6b7280' }}>
                  {data.health}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tier</span>
                <span>{data.tier}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
