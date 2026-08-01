import { useIncidents } from '@/hooks/useApi';
import { useAppStore } from '@/hooks/useStore';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';

const severityColors: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 text-red-500 border-red-500/20',
  HIGH: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  MEDIUM: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  LOW: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const stateColors: Record<string, string> = {
  DETECTED: 'text-yellow-400',
  TRIAGED: 'text-blue-400',
  INVESTIGATING: 'text-blue-400',
  HEALING: 'text-orange-400',
  RESOLVED: 'text-green-400',
  ESCALATED: 'text-red-400',
};

export default function IncidentsPage() {
  const { incidents, setIncidents, setSelectedIncident } = useAppStore();
  const { data } = useIncidents();
  const navigate = useNavigate();

  useEffect(() => {
    if (data) setIncidents(data.items || []);
  }, [data]);

  return (
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden space-y-6">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white relative z-10">Incidents</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search incidents..."
            className="pl-9 pr-4 py-2 bg-neutral-900/90 border border-neutral-700/80 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 w-64 transition-all"
          />
        </div>
      </div>

      <div className="backdrop-blur-2xl bg-neutral-950/40 border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)] rounded-2xl p-6 text-white relative z-10 overflow-hidden hover:border-blue-500/40 hover:shadow-[0_12px_40px_0_rgba(32,108,232,0.2)] transition-all duration-300">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Severity</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Title</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Service</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">State</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-500">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No incidents found
                  </td>
                </tr>
              ) : (
                incidents.map((incident) => (
                  <tr
                    key={incident.id}
                    className="border-b border-white/10 hover:bg-white/[0.04] cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedIncident(incident);
                      navigate(`/incidents/${incident.id}`);
                    }}
                  >
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">
                        {incident.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {incident.title || incident.id?.substring(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {incident.serviceId?.substring(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${stateColors[incident.state] || 'text-gray-400'}`}>
                        {incident.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(incident.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
