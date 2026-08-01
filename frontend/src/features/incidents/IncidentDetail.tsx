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
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden space-y-6">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />
      <Link to="/incidents" className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200">
        <ArrowLeft className="w-4 h-4" />
        Back to incidents
      </Link>

      <div className="backdrop-blur-2xl bg-neutral-950/40 border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)] rounded-2xl p-6 text-white relative z-10 hover:border-blue-500/40 hover:shadow-[0_12px_40px_0_rgba(32,108,232,0.2)] transition-all duration-300">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white relative z-10 mb-1">{incident.title || 'Incident'}</h1>
            <p className="text-sm text-gray-500">ID: {incident.id}</p>
          </div>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">
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
        <div className="backdrop-blur-2xl bg-neutral-950/40 border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)] rounded-2xl p-6 text-white relative z-10 hover:border-blue-500/40 hover:shadow-[0_12px_40px_0_rgba(32,108,232,0.2)] transition-all duration-300">
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
          className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all"
        >
          Resolve Incident
        </button>
        <button
          onClick={async () => {
            const { endpoints } = await import('@/lib/api');
            await endpoints.incidents.escalate(incident.id, 'manager', 'Needs immediate attention');
            navigate(0);
          }}
          className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all"
        >
          Escalate
        </button>
      </div>
    </div>
  );
}
