import { useEffect, useState } from 'react';
import { useAppStore } from '@/hooks/useStore';
import { useServices, useIncidents } from '@/hooks/useApi';
import wsManager from '@/hooks/useWebSocket';
import ChartLineIcon from '@/components/ui/chart-line-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import ShieldCheckIcon from '@/components/ui/shield-check';
import ChartBarIcon from '@/components/ui/chart-bar-icon';
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon';
import ArrowNarrowDownIcon from '@/components/ui/arrow-narrow-down-icon';

function StatCard({ icon: Icon, label, value, change, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  change?: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 overflow-hidden hover:border-neutral-700 transition-colors relative">
      
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full shrink-0 ${color.replace('text-', 'bg-')}`} />
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      <div className="text-2xl font-bold relative z-10">{value}</div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-xs relative z-10 ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {change >= 0 ? <ArrowNarrowUpIcon className="w-3 h-3" /> : <ArrowNarrowDownIcon className="w-3 h-3" />}
          {Math.abs(change)}%
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { incidents, setIncidents, services, setServices } = useAppStore();
  const { data: servicesData } = useServices();
  const { data: incidentsData } = useIncidents();

  useEffect(() => {
    if (servicesData?.services) setServices(servicesData.services);
  }, [servicesData]);

  useEffect(() => {
    if (incidentsData) setIncidents(incidentsData.items || []);
  }, [incidentsData]);

  useEffect(() => {
    wsManager.connect();

    const unsubAnomaly = wsManager.on('anomaly.detected', (data: any) => {
      console.log('Anomaly detected:', data);
    });

    const unsubIncident = wsManager.on('incident.updated', (data: any) => {
      if (data?.incidentId) {
        useAppStore.getState().updateIncident(data.incidentId, data);
      }
    });

    return () => {
      unsubAnomaly();
      unsubIncident();
    };
  }, []);

  const activeIncidents = incidents.filter(
    (i) => i.state !== 'RESOLVED' && i.state !== 'ROLLED_BACK'
  ).length;

  const criticalIncidents = incidents.filter(
    (i) => i.severity === 'CRITICAL' && i.state !== 'RESOLVED'
  ).length;

  const healthyServices = services.filter(
    (s) => s.status === 'HEALTHY' || s.healthScore >= 80
  ).length;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        <StatCard
          icon={ChartLineIcon}
          label="Services"
          value={services.length}
          change={2}
          color="text-blue-500"
        />
        <StatCard
          icon={TriangleAlertIcon}
          label="Active Incidents"
          value={activeIncidents}
          change={-15}
          color="text-red-500"
        />
        <StatCard
          icon={ShieldCheckIcon}
          label="Healthy Services"
          value={`${services.length > 0 ? Math.round((healthyServices / services.length) * 100) : 0}%`}
          color="text-green-500"
        />
        <StatCard
          icon={ChartBarIcon}
          label="Critical"
          value={criticalIncidents}
          color="text-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <h2 className="text-xl font-semibold text-white mb-4 relative z-10">Recent Incidents</h2>
          {incidents.slice(0, 5).map((incident) => (
            <a
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="flex items-center justify-between py-2.5 border-b border-neutral-700 last:border-0 hover:bg-white/[0.03] px-2 rounded-lg transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  incident.severity === 'CRITICAL' ? 'bg-red-500' :
                  incident.severity === 'HIGH' ? 'bg-orange-500' :
                  incident.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <span className="text-sm text-gray-300">{incident.title || incident.serviceId}</span>
              </div>
              <span className="text-xs text-gray-500 uppercase tracking-wider">{new Date(incident.createdAt).toLocaleTimeString()}</span>
            </a>
          ))}
        </div>

        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <h2 className="text-xl font-semibold text-white mb-4 relative z-10">Service Health</h2>
          <div className="space-y-4">
            {services.slice(0, 8).map((service) => (
              <div key={service.id} className="flex flex-col gap-1.5 py-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      service.healthScore >= 90 ? 'bg-green-500' :
                      service.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm text-gray-300">{service.name}</span>
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400 font-medium uppercase tracking-wider">{service.tier}</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    service.healthScore >= 90 ? 'text-green-500' :
                    service.healthScore >= 70 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {service.healthScore}%
                  </span>
                </div>
                {/* Health progress bar */}
                <div className="w-full bg-black/60 border border-neutral-700 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      service.healthScore >= 90 ? 'bg-green-500' :
                      service.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${service.healthScore}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
