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
    <div className="backdrop-blur-2xl bg-neutral-950/80 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] rounded-2xl p-6 space-y-3 hover:border-blue-500/40 transition-colors">
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
        <div className="w-full bg-black/60 border border-white/10 rounded-full h-2 mt-1 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${isBreaching ? 'bg-red-500' : 'bg-green-500'}`}
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

  return (
    <div className="min-h-screen bg-[#060911] text-white p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[rgba(6,182,212,0.12)] blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[rgba(6,182,212,0.12)] blur-[120px] rounded-full pointer-events-none" />
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">Service Level Objectives</h1>
          <BarChart3 className="w-5 h-5 text-gray-500" />
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
    </div>
  );
}
