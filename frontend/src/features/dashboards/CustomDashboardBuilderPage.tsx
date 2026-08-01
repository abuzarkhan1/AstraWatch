import { useState, useCallback } from 'react';
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
import { Plus, BarChart3, Bell, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const widgetTypes = [
  { type: 'metric-chart', label: 'Metric Chart', icon: BarChart3 },
  { type: 'status', label: 'Status', icon: Activity },
  { type: 'alert-list', label: 'Alert List', icon: Bell },
];

const widgetColors: Record<string, string> = {
  'metric-chart': '#3b82f6',
  status: '#22c55e',
  'alert-list': '#ef4444',
};

export default function CustomDashboardBuilderPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [widgetCount, setWidgetCount] = useState(0);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addWidget = (type: string) => {
    const id = `widget-${widgetCount}`;
    const widgetDef = widgetTypes.find((w) => w.type === type);
    const newNode: Node = {
      id,
      type: 'default',
      position: { x: 100 + (widgetCount % 3) * 300, y: 100 + Math.floor(widgetCount / 3) * 200 },
      data: { label: widgetDef?.label || type },
      className: 'backdrop-blur-2xl bg-neutral-950/50 border border-white/10 rounded-2xl shadow-xl text-white',
      style: {
        borderColor: widgetColors[type] || 'rgba(255,255,255,0.1)',
        padding: 16,
        width: 260,
        height: 160,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setWidgetCount((c) => c + 1);
    setDialogOpen(false);
  };

  const removeWidget = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Custom Dashboard Builder</h1>
          <p className="text-sm text-gray-500 mt-1">Drag and drop widgets to build your monitoring view</p>
        </div>
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
                    onClick={() => addWidget(w.type)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-blue-500/40 transition-colors text-left cursor-pointer"
                  >
                    <Icon className="w-5 h-5 text-blue-400" />
                    <span className="text-sm text-gray-200">{w.label}</span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden" style={{ height: 600 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#1a1a2e" gap={20} />
          <Controls className="bg-neutral-900 border-neutral-700 rounded-lg" />
          <MiniMap
            style={{ background: '#0a0a14' }}
            nodeColor={(node: any) => widgetColors[node.data?.label?.toLowerCase()] || '#6b7280'}
            maskColor="rgba(0,0,0,0.6)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
