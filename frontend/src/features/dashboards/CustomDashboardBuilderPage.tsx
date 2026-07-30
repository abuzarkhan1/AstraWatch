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
      style: {
        background: '#1f2937',
        border: `2px solid ${widgetColors[type] || '#6b7280'}`,
        color: '#f3f4f6',
        borderRadius: 8,
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
        <h1 className="text-2xl font-bold">Custom Dashboard Builder</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Widget
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Widget</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 mt-2">
              {widgetTypes.map((w) => {
                const Icon = w.icon;
                return (
                  <button
                    key={w.type}
                    onClick={() => addWidget(w.type)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors text-left"
                  >
                    <Icon className="w-5 h-5 text-gray-300" />
                    <span className="text-sm text-gray-200">{w.label}</span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800" style={{ height: 600 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#374151" gap={20} />
          <Controls className="bg-gray-800 border-gray-700 rounded-lg" />
          <MiniMap
            style={{ background: '#111827' }}
            nodeColor={(node: any) => widgetColors[node.data?.label?.toLowerCase()] || '#6b7280'}
            maskColor="rgba(0,0,0,0.6)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
