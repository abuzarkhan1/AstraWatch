import { useParams, Link, useNavigate } from 'react-router-dom';
import { useIncident, useIncidentTimeline } from '@/hooks/useApi';
import { useAppStore } from '@/hooks/useStore';
import { ArrowLeft, AlertTriangle, Clock, User } from 'lucide-react';

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: incident, isLoading } = useIncident(id);
  const { data: timeline } = useIncidentTimeline(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Incident not found</p>
        <Link to="/incidents" className="text-blue-500 hover:underline mt-2 inline-block">
          Back to incidents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/incidents" className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200">
        <ArrowLeft className="w-4 h-4" />
        Back to incidents
      </Link>

      <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl p-6 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold mb-1">{incident.title || 'Incident'}</h1>
            <p className="text-sm text-gray-500">ID: {incident.id}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
            incident.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
            incident.severity === 'HIGH' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
            'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
          }`}>
            {incident.severity}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-black/60 border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Clock className="w-3 h-3" />
              State
            </div>
            <span className="text-sm font-medium">{incident.state}</span>
          </div>
          <div className="bg-black/60 border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Clock className="w-3 h-3" />
              Created
            </div>
            <span className="text-sm">{new Date(incident.createdAt).toLocaleString()}</span>
          </div>
          <div className="bg-black/60 border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <User className="w-3 h-3" />
              Assigned To
            </div>
            <span className="text-sm">{incident.assignedTo || 'Unassigned'}</span>
          </div>
          <div className="bg-black/60 border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <AlertTriangle className="w-3 h-3" />
              Service
            </div>
            <span className="text-sm">{incident.serviceId}</span>
          </div>
        </div>

        {incident.description && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
            <p className="text-sm text-gray-300 bg-black/60 border border-white/10 rounded-xl p-3">{incident.description}</p>
          </div>
        )}
      </div>

      {timeline && timeline.length > 0 && (
        <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl p-6 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)]">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Timeline</h2>
          <div className="space-y-3">
            {timeline.map((event: any) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />
                <div>
                  <span className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString()}</span>
                  <p className="text-sm text-gray-300 mt-0.5">{event.eventType}</p>
                  {event.payload && (
                    <pre className="text-xs text-gray-500 mt-1 bg-black/60 border border-white/10 rounded-lg p-2 overflow-x-auto">
                      {JSON.stringify(JSON.parse(event.payload), null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={async () => {
            const { endpoints } = await import('@/lib/api');
            await endpoints.incidents.resolve(incident.id, 'Resolved via dashboard');
            navigate(0);
          }}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          Resolve Incident
        </button>
        <button
          onClick={async () => {
            const { endpoints } = await import('@/lib/api');
            await endpoints.incidents.escalate(incident.id, 'manager', 'Needs immediate attention');
            navigate(0);
          }}
          className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition-colors"
        >
          Escalate
        </button>
      </div>
    </div>
  );
}
