import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { useServices } from '@/hooks/useApi';

const sloTargets: Record<string, number> = {
  'Payment API': 99.95,
  'User Service': 99.5,
  'Notification Service': 99.0,
};

import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

function ServiceSLO({ svc }: { svc: any }) {
  const { data: sloData } = useQuery({
    queryKey: ['slo', svc.id],
    queryFn: async () => {
      const { data } = await endpoints.slo.get(svc.id);
      return data;
    },
  });

  const target = sloData?.target ?? sloTargets[svc.name] ?? 99.0;
  const current = sloData?.current ?? svc.sloAttainment ?? svc.healthScore ?? target - 0.3;
  const remaining = Math.max(0, current - target);
  const burnRate = sloData?.burnRate ?? 0.5;
  const isBreaching = current < target;

  return (
    <div className={`rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors ${isBreaching ? 'border-t-2 border-t-red-500/50' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{svc.name}</h3>
        {isBreaching ? (
          <TrendingDown className="w-4 h-4 text-red-500" />
        ) : (
          <TrendingUp className="w-4 h-4 text-green-500" />
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Current</span>
          <span className={isBreaching ? 'text-red-500' : 'text-green-500'}>
            {current.toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Target</span>
          <span className="text-gray-300">{target}%</span>
        </div>
        <div className="w-full bg-neutral-800 border-0 rounded-full h-1.5 mt-1 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${isBreaching ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, (current / target) * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-600 pt-1">
        <span>Error budget: {remaining.toFixed(2)}%</span>
        <span>Burn rate: {burnRate.toFixed(1)}x</span>
      </div>
    </div>
  );
}

export default function SLOPage() {
  const { data: services = [], isLoading } = useServices();

  const totalServices = services.length;
  const breachingServices = services.filter((svc: any) => {
    const target = sloTargets[svc.name] ?? 99.0;
    const current = svc.sloAttainment ?? svc.healthScore ?? target - 0.3;
    return current < target;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white">Service Level Objectives</h1>
        <BarChart3 className="w-5 h-5 text-gray-500" />
      </div>

      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold mb-1">SLO Overview</h2>
          <p className="text-sm text-gray-400">Total trackable services and active breaches</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-blue-500 rounded-full shrink-0"></div>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">{totalServices} Total</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-red-500 rounded-full shrink-0"></div>
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-400 font-medium">{breachingServices} Breaching</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center text-gray-500 py-8">Loading...</div>
        ) : services.length === 0 ? (
          <div className="col-span-full text-center text-gray-500 py-8">No services available</div>
        ) : (
          services.map((svc: any) => <ServiceSLO key={svc.id} svc={svc} />)
        )}
      </div>
    </div>
  );
}
