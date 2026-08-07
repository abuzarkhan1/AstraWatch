import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import { endpoints } from '@/lib/api';

interface Window {
  id: string;
  serviceIds?: string;
  reason?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
}

export default function MaintenanceWindowsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [serviceIds, setServiceIds] = useState('');
  const [durationHours, setDurationHours] = useState(2);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-windows'],
    queryFn: async () => {
      const { data } = await endpoints.alerting.listMaintenanceWindows();
      return data?.data?.windows ?? data?.windows ?? [];
    },
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      endpoints.alerting.createMaintenanceWindow({
        serviceIds: serviceIds.trim() || '{}',
        reason,
        startedAt: new Date().toISOString(),
        endedAt: new Date(Date.now() + durationHours * 3600_000).toISOString(),
      }),
    onSuccess: () => {
      setShowForm(false);
      setReason('');
      setServiceIds('');
      setDurationHours(2);
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] });
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to create window');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => endpoints.alerting.deleteMaintenanceWindow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance-windows'] }),
  });

  const windows: Window[] = data ?? [];

  const isActive = (w: Window): boolean => {
    if (!w.startedAt) return false;
    const start = new Date(w.startedAt).getTime();
    const end = w.endedAt ? new Date(w.endedAt).getTime() : Infinity;
    const now = Date.now();
    return now >= start && now <= end;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Maintenance Windows</h1>
          <p className="text-sm text-gray-500 mt-1">Suppress alerts for planned maintenance</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Window
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create maintenance window</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Reason</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Database migration"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Duration (hours)</label>
              <input
                type="number"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                min={1}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Service IDs (comma separated, optional)</label>
              <input
                value={serviceIds}
                onChange={(e) => setServiceIds(e.target.value)}
                placeholder="e.g. uuid1,uuid2 — leave blank for all services"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!reason.trim() || createMutation.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Window'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 text-sm font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading windows...</div>
      ) : windows.length === 0 ? (
        <div className="text-center py-16 text-gray-500 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No maintenance windows. Create one to silence alerts during planned work.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {windows.map((w) => {
            const active = isActive(w);
            return (
              <div key={w.id} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{w.reason || 'Maintenance window'}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {w.startedAt ? new Date(w.startedAt).toLocaleString() : '—'}
                      {' → '}
                      {w.endedAt ? new Date(w.endedAt).toLocaleString() : '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(w.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                    title="Delete window"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Status</span>
                  <span className={`text-xs font-medium ${active ? 'text-green-400' : 'text-gray-500'}`}>
                    {active ? 'ACTIVE' : 'SCHEDULED / CLOSED'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
