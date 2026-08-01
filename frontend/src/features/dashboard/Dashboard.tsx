import { useEffect, useState } from 'react';
import { useAppStore } from '@/hooks/useStore';
import { useServices, useIncidents } from '@/hooks/useApi';
import wsManager from '@/hooks/useWebSocket';
import { Activity, AlertTriangle, Shield, BarChart3, ArrowUp, ArrowDown } from 'lucide-react';

function StatCard({ icon: Icon, label, value, change, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  change?: number;
  color: string;
}) {
  return (
    <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6 hover:border-white/20 transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
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
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    wsManager.connect(token);

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
    <div className="space-y-6 relative z-0 bg-[#060911] p-6 rounded-3xl overflow-hidden">
      <div className="absolute inset-0 bg-[rgba(99,102,241,0.08)] blur-[140px] pointer-events-none -z-10" />
      <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Services"
          value={services.length}
          change={2}
          color="text-blue-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="Active Incidents"
          value={activeIncidents}
          change={-15}
          color="text-red-500"
        />
        <StatCard
          icon={Shield}
          label="Healthy Services"
          value={`${services.length > 0 ? Math.round((healthyServices / services.length) * 100) : 0}%`}
          color="text-green-500"
        />
        <StatCard
          icon={BarChart3}
          label="Critical"
          value={criticalIncidents}
          color="text-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6">
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4">Recent Incidents</h2>
          {incidents.slice(0, 5).map((incident) => (
            <a
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-0 hover:bg-white/[0.04] px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  incident.severity === 'CRITICAL' ? 'bg-red-500' :
                  incident.severity === 'HIGH' ? 'bg-orange-500' :
                  incident.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <span className="text-sm text-gray-300">{incident.title || incident.serviceId}</span>
              </div>
              <span className="text-xs text-gray-500">{new Date(incident.createdAt).toLocaleTimeString()}</span>
            </a>
          ))}
        </div>

        <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6">
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4">Service Health</h2>
          <div className="space-y-2">
            {services.slice(0, 8).map((service) => (
              <div key={service.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    service.healthScore >= 90 ? 'bg-green-500' :
                    service.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <span className="text-sm text-gray-300">{service.name}</span>
                  <span className="text-xs text-gray-600">{service.tier}</span>
                </div>
                <span className={`text-sm font-mono ${
                  service.healthScore >= 90 ? 'text-green-500' :
                  service.healthScore >= 70 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {service.healthScore}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
