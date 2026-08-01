import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Plus, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AlertRule {
  id: string;
  name: string;
  serviceId: string;
  metric: string;
  condition: string;
  threshold: number;
  status: 'active' | 'inactive' | 'error';
  lastTriggered?: string;
}

const statusColors: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  active: 'success',
  inactive: 'secondary',
  error: 'destructive',
};

export default function AlertingCenterPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const { data, isLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const { data } = await endpoints.incidents.list();
      return data;
    },
  });

  useEffect(() => {
    if (data?.items) {
      setRules(
        data.items.slice(0, 10).map((item: any, i: number) => ({
          id: item.id || `rule-${i}`,
          name: `Alert Rule ${i + 1}`,
          serviceId: item.serviceId || 'unknown',
          metric: 'latency',
          condition: '>',
          threshold: 200,
          status: (['active', 'inactive', 'error'] as const)[i % 3],
          lastTriggered: item.createdAt,
        }))
      );
    }
  }, [data]);

  const toggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: r.status === 'active' ? 'inactive' : 'active' }
          : r
      )
    );
  };

  return (
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />
      <div className="space-y-6 relative z-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white">Alerting Center</h1>
        <Button className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all">
          <Plus className="w-4 h-4 mr-2" />
          New Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-8">Loading alert rules...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No alert rules configured</p>
          <Button className="mt-4 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all">
            <Plus className="w-4 h-4 mr-2" />
            Create your first rule
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="backdrop-blur-2xl bg-neutral-950/40 border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)] rounded-2xl p-6 hover:border-blue-500/40 hover:shadow-[0_12px_40px_0_rgba(32,108,232,0.2)] transition-all duration-300 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {rule.status === 'active' ? (
                      <Bell className="w-5 h-5 text-green-500" />
                    ) : rule.status === 'error' ? (
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    ) : (
                      <BellOff className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{rule.name}</p>
                    <p className="text-xs text-gray-500">
                      {rule.metric} {rule.condition} {rule.threshold}ms &middot; {rule.serviceId}
                    </p>
                    {rule.lastTriggered && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        Last triggered: {new Date(rule.lastTriggered).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium capitalize">
                    {rule.status}
                  </span>
                  <Button
                    size="sm"
                    className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all"
                    onClick={() => toggleRule(rule.id)}
                  >
                    {rule.status === 'active' ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
