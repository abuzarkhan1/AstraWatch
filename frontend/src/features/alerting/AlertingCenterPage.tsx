import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Plus, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white">Alerting Center</h1>
        <Button className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer">
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
          <Button className="mt-4 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer">
            <Plus className="w-4 h-4 mr-2" />
            Create your first rule
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 hover:border-neutral-700 transition-colors">
              <div className="flex items-center justify-between relative z-10">
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{rule.name}</p>
                      {rule.status === 'active' && <div className="h-2 w-2 bg-blue-500 rounded-full shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {rule.metric} {rule.condition} {rule.threshold}ms &middot; {rule.serviceId}
                    </p>
                    {rule.lastTriggered && (
                      <p className="text-xs text-gray-500 mt-0.5">
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
                    className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
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
  );
}
