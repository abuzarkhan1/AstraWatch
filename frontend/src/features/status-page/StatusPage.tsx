import React, { useState } from 'react';
import { Globe, CheckCircle2, AlertTriangle, XCircle, Clock, ArrowUpRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

const statusIcon: Record<string, React.ElementType> = {
  HEALTHY: CheckCircle2,
  DEGRADED: AlertTriangle,
  DOWN: XCircle,
};

const statusColor: Record<string, string> = {
  HEALTHY: 'text-green-500',
  DEGRADED: 'text-yellow-500',
  DOWN: 'text-red-500',
};

const uptimeCategories = [
  { label: 'All Systems Operational', color: 'bg-green-500', uptime: '99.98%' },
  { label: 'API Services', color: 'bg-green-500', uptime: '99.95%' },
  { label: 'Dashboard & UI', color: 'bg-green-500', uptime: '100%' },
  { label: 'Alerting Pipeline', color: 'bg-yellow-500', uptime: '99.2%' },
  { label: 'Data Ingestion', color: 'bg-green-500', uptime: '99.87%' },
];

export default function StatusPage() {
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['status-services'],
    queryFn: async () => {
      const { data } = await endpoints.services.list();
      return data?.services || data || [];
    },
  });

  const healthy = services.filter((s: any) => s.status === 'HEALTHY').length;
  const degraded = services.filter((s: any) => s.status === 'DEGRADED').length;
  const down = services.filter((s: any) => s.status === 'DOWN').length;
  const overallOk = down === 0 && degraded === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Status Page</h1>
          <p className="text-sm text-gray-500 mt-1">Live system status and uptime history</p>
        </div>
        <button className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors">
          <Globe className="w-4 h-4" />
          Public Status Page
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Overall Status */}
      <div className={`rounded-2xl text-white bg-neutral-900 border p-6 transition-colors ${overallOk ? 'border-green-500/40' : 'border-red-500/40'}`}>
        <div className="flex items-center gap-3">
          {overallOk ? (
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          )}
          <div>
            <h2 className="text-xl font-semibold text-white">
              {overallOk ? 'All Systems Operational' : 'Partial Service Disruption'}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Last updated: {new Date().toLocaleTimeString()}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Healthy</p>
          <p className="text-2xl font-bold text-green-500 mt-1">{healthy}</p>
        </div>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Degraded</p>
          <p className="text-2xl font-bold text-yellow-500 mt-1">{degraded}</p>
        </div>
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Down</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{down}</p>
        </div>
      </div>

      {/* Uptime Categories */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">30-Day Uptime</h2>
        <div className="space-y-3">
          {uptimeCategories.map((cat) => (
            <div key={cat.label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${cat.color}`} />
                <span className="text-sm text-gray-300">{cat.label}</span>
              </div>
              <span className="text-sm font-mono text-gray-400">{cat.uptime}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Services */}
      {!isLoading && services.length > 0 && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <h2 className="text-base font-semibold text-white mb-4">Service Status</h2>
          <div className="space-y-2">
            {services.map((svc: any) => {
              const Icon = statusIcon[svc.status] || CheckCircle2;
              return (
                <div key={svc.id} className="flex items-center justify-between py-2.5 border-b border-neutral-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${statusColor[svc.status] || 'text-gray-400'}`} />
                    <span className="text-sm text-gray-300">{svc.name}</span>
                    <span className="text-xs text-gray-600">{svc.tier}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-500">
                      {svc.healthScore ? `${svc.healthScore}%` : '—'}
                    </span>
                    <span className={`text-xs font-medium ${statusColor[svc.status] || 'text-gray-400'}`}>
                      {svc.status || 'UNKNOWN'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
