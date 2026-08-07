import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users, Clock } from 'lucide-react';
import { endpoints } from '@/lib/api';

interface Schedule {
  id: string;
  name: string;
  description?: string;
  memberIds?: string[];
  shiftLengthHours?: number;
  timezone?: string;
  currentOnCall?: string | null;
  enabled?: boolean;
}

export default function OnCallPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shiftLengthHours, setShiftLengthHours] = useState(168);
  const [timezone, setTimezone] = useState('UTC');

  const { data, isLoading } = useQuery({
    queryKey: ['oncall-schedules'],
    queryFn: async () => {
      const { data } = await endpoints.oncall.listSchedules();
      return data?.data?.schedules ?? data?.schedules ?? [];
    },
    refetchInterval: 30000,
  });

  // "Who is on call right now" — PagerDuty-style banner fed by the backend's
  // per-rotation currentOnCall computation (audit: this page only had a CRUD
  // list; the primary on-call value proposition was missing).
  const { data: onCallData } = useQuery({
    queryKey: ['oncall-who'],
    queryFn: async () => {
      const { data } = await endpoints.oncall.whoIsOnCall();
      return (data?.data?.onCall ?? {}) as Record<string, string>;
    },
    refetchInterval: 30000,
  });
  const onCallNow = onCallData ?? {};
  const onCallNames = Object.keys(onCallNow);
  const currentOnCallMember = onCallNames.length > 0
    ? Object.entries(onCallNow)
        .map(([schedule, member]) => ({ schedule, member: member === 'nobody' ? 'Nobody' : member.slice(0, 8) }))
    : [];

  const createMutation = useMutation({
    mutationFn: () =>
      endpoints.oncall.createSchedule({
        name,
        description,
        memberIds: [],
        shiftLengthHours,
        timezone,
      }),
    onSuccess: () => {
      setShowForm(false);
      setName('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['oncall-schedules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => endpoints.oncall.deleteSchedule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oncall-schedules'] }),
  });

  const schedules: Schedule[] = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">On-Call</h1>
          <p className="text-sm text-gray-500 mt-1">Rotation schedules and current on-call assignment</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {/* Who's on call now (PagerDuty-style banner) */}
      {currentOnCallMember.length > 0 && (
        <div className="rounded-2xl text-white bg-gradient-to-r from-blue-500/10 via-neutral-900 to-neutral-900 border border-blue-500/20 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <span className="text-sm font-semibold text-white">On call now</span>
          </div>
          <div className="flex flex-wrap gap-2 flex-1">
            {currentOnCallMember.map(({ schedule, member }) => (
              <span key={schedule} className="flex items-center gap-2 rounded-xl bg-neutral-800/80 border border-neutral-700 px-3 py-1.5 text-xs">
                <span className="text-gray-400">{schedule}</span>
                <span className="text-blue-400 font-mono">{member}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create rotation schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Primary on-call"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Shift length (hours)</label>
              <input
                type="number"
                value={shiftLengthHours}
                onChange={(e) => setShiftLengthHours(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this rotation covers"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name || createMutation.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
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
        <div className="text-center text-gray-500 py-12">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-500 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No on-call schedules yet. Create one to start assigning shifts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schedules.map((s) => (
            <div key={s.id} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white">{s.name}</h3>
                  {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                </div>
                <button
                  onClick={() => deleteMutation.mutate(s.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                  title="Delete schedule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="border-t border-neutral-800 pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Members
                  </span>
                  <span className="text-gray-300">{(s.memberIds ?? []).length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Shift length
                  </span>
                  <span className="text-gray-300">{s.shiftLengthHours ?? 168}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Timezone</span>
                  <span className="text-gray-300 font-mono">{s.timezone ?? 'UTC'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={`text-xs font-medium ${s.enabled === false ? 'text-gray-500' : 'text-green-400'}`}>
                    {s.enabled === false ? 'DISABLED' : 'ENABLED'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Current on-call</span>
                  <span className="text-blue-400 font-mono">
                    {s.currentOnCall ? `${s.currentOnCall.slice(0, 8)}...` : '—'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
