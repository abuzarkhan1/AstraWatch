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
  INVESTIGATING: 'text-purple-400',
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Incidents</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search incidents..."
            className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500 w-64"
          />
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
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
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedIncident(incident);
                      navigate(`/incidents/${incident.id}`);
                    }}
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        severityColors[incident.severity] || 'bg-gray-500/10 text-gray-500'
                      }`}>
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
