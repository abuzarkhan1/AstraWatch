import { useIncidents } from '@/hooks/useApi';
import { useAppStore } from '@/hooks/useStore';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import { Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { useServices } from '@/hooks/useApi';

const severityColors: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  MEDIUM: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  LOW: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

const stateColors: Record<string, string> = {
  DETECTED: 'text-yellow-400',
  TRIAGED: 'text-blue-400',
  INVESTIGATING: 'text-blue-400',
  HEALING: 'text-orange-400',
  VALIDATING: 'text-purple-400',
  RESOLVED: 'text-green-400',
  ROLLED_BACK: 'text-gray-400',
  ESCALATED: 'text-red-400',
};

export default function IncidentsPage() {
  const { incidents, setIncidents, setSelectedIncident } = useAppStore();
  const { data } = useIncidents();
  const navigate = useNavigate();
  // Topology node click deep-links here with ?service=<id> — prefill the search
  // box so the table filters to that service on arrival.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialService = searchParams.get('service') ?? '';
  const [searchQuery, setSearchQuery] = useState(initialService);
  // SaaS table filters: status + severity chips (previous page only had search).
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // ── Create incident (audit Part 2.1: create existed on the backend, no UI) ──
  const queryClient = useQueryClient();
  const { data: services = [] } = useServices();
  const [showCreate, setShowCreate] = useState(false);
  const [cTitle, setCTitle] = useState('');
  const [cService, setCService] = useState('');
  const [cSeverity, setCSeverity] = useState('MEDIUM');
  const [cDescription, setCDescription] = useState('');
  const [cError, setCError] = useState('');

  const createIncident = useMutation({
    mutationFn: () =>
      endpoints.incidents.create({
        serviceId: cService || null,
        severity: cSeverity,
        title: cTitle,
        description: cDescription || undefined,
      }),
    onSuccess: () => {
      setShowCreate(false);
      setCTitle('');
      setCService('');
      setCSeverity('MEDIUM');
      setCDescription('');
      setCError('');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (err: any) => setCError(err?.response?.data?.data?.error ?? err?.response?.data?.error ?? err?.message ?? 'Failed to create incident'),
  });

  useEffect(() => {
    if (data) setIncidents(data.items || []);
  }, [data]);

  // Keep the URL in sync when the user edits the search box (so the filter
  // stays shareable/deep-linkable).
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchParams({ service: searchQuery }, { replace: true });
    } else if (searchParams.get('service')) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Same-route navigation: clicking a topology node while ALREADY on /incidents
  // changes only the ?service= param (no remount), so the useState initializer
  // never re-runs. Sync the external param into the search box when it changes
  // (guarded so the two effects converge without fighting).
  const urlService = searchParams.get('service') ?? '';
  useEffect(() => {
    if (urlService !== searchQuery) {
      setSearchQuery(urlService);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlService]);

  // Client-side filter so the search box actually filters the table (audit:
  // the input rendered but had no state — it was a dead control).
  const filtered = incidents.filter((incident) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'ACTIVE') {
        if (incident.state === 'RESOLVED' || incident.state === 'ROLLED_BACK') return false;
      } else if ((incident.state ?? '') !== statusFilter) {
        return false;
      }
    }
    if (severityFilter !== 'ALL' && (incident.severity ?? '') !== severityFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      (incident.title ?? '').toLowerCase().includes(q) ||
      (incident.serviceId ?? '').toLowerCase().includes(q) ||
      (incident.state ?? '').toLowerCase().includes(q) ||
      (incident.severity ?? '').toLowerCase().includes(q)
    );
  });

  // MTTR / MTTD KPIs (PagerDuty-style operational metrics). Computed from the
  // REAL incident timestamps: MTTR = mean resolvedAt - createdAt for resolved
  // incidents; MTTD = mean time to first comment after creation (when a
  // timeline exists) — fall back to investigation start when present.
  const resolvedIncidents = incidents.filter((i: any) => i.resolvedAt && i.createdAt);
  const mttrHours = resolvedIncidents.length > 0
    ? resolvedIncidents.reduce((acc: number, i: any) => {
        const ms = new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime();
        return acc + Math.max(0, ms) / 3600000;
      }, 0) / resolvedIncidents.length
    : null;
  const detectedCount = incidents.filter((i: any) => i.createdAt).length;

  const statusChips: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'DETECTED', label: 'Detected' },
    { value: 'INVESTIGATING', label: 'Investigating' },
    { value: 'HEALING', label: 'Healing' },
    { value: 'RESOLVED', label: 'Resolved' },
  ];
  const severityChips: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'CRITICAL', label: 'Critical' },
    { value: 'HIGH', label: 'High' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'LOW', label: 'Low' },
  ];


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white">Incidents</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search incidents..."
              className="pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none w-64 transition-all"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            New Incident
          </button>
        </div>
      </div>

      {/* Operational KPIs (PagerDuty-standard: MTTR + incident load) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Mean time to resolve', value: mttrHours != null ? `${mttrHours.toFixed(1)}h` : '—', color: 'text-blue-400', hint: 'Average resolvedAt − createdAt across resolved incidents' },
          { label: 'Total incidents', value: detectedCount, color: 'text-gray-200', hint: 'All incidents in the current view' },
          { label: 'Open right now', value: incidents.filter((i) => i.state !== 'RESOLVED' && i.state !== 'ROLLED_BACK').length, color: 'text-amber-400', hint: 'Unresolved incidents requiring attention' },
        ].map((stat) => (
          <div key={stat.label} title={stat.hint} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create Incident</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Title</label>
              <input
                value={cTitle}
                onChange={(e) => setCTitle(e.target.value)}
                placeholder="e.g. Payment API latency spike"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Service (optional)</label>
              <select
                value={cService}
                onChange={(e) => setCService(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                <option value="">No service</option>
                {services.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name || s.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Severity</label>
              <select
                value={cSeverity}
                onChange={(e) => setCSeverity(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Description (optional)</label>
              <textarea
                value={cDescription}
                onChange={(e) => setCDescription(e.target.value)}
                rows={3}
                placeholder="What happened?"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all resize-y"
              />
            </div>
          </div>
          {cError && <p className="text-sm text-red-400">{cError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createIncident.mutate()}
              disabled={!cTitle.trim() || createIncident.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {createIncident.isPending ? 'Creating...' : 'Create Incident'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 text-sm font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter chips — status and severity (SaaS table standard) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
          {statusChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === chip.value
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
          {severityChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setSeverityFilter(chip.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                severityFilter === chip.value
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length} of {incidents.length} incidents
        </span>
      </div>

      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 overflow-hidden">
        <div className="overflow-x-auto relative z-10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Severity</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Title</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Service</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">State</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-500">
                    <TriangleAlertIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    {searchQuery.trim() ? 'No incidents match your search' : 'No incidents found'}
                  </td>
                </tr>
              ) : (
                filtered.map((incident) => (
                  <tr
                    key={incident.id}
                    className="border-b border-neutral-800 hover:bg-white/[0.03] cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedIncident(incident);
                      navigate(`/incidents/${incident.id}`);
                    }}
                  >
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${severityColors[incident.severity] || severityColors.LOW}`}>
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
                      {incident.createdAt ? new Date(incident.createdAt).toLocaleString() : '—'}
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
