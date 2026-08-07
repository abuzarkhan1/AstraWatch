import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Layers, Power } from 'lucide-react';
import RightChevron from '@/components/ui/right-chevron';
import { endpoints } from '@/lib/api';

interface Policy {
  id: string;
  name: string;
  orgId?: string;
  rotationId?: string | null;
  steps?: string;
  enabled?: boolean;
}

interface Step {
  level: number;
  afterMinutes: number;
  targets: string[];
}

export default function EscalationPoliciesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [rotationId, setRotationId] = useState('');
  const [stepsJson, setStepsJson] = useState('[{"level":1,"afterMinutes":5,"targets":["rotation"]}]');
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['escalation-policies'],
    queryFn: async () => {
      const { data } = await endpoints.escalation.listPolicies();
      return data?.data?.policies ?? data?.policies ?? [];
    },
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      endpoints.escalation.createPolicy({
        name,
        rotationId: rotationId.trim() || null,
        steps: stepsJson,
        enabled: true,
      }),
    onSuccess: () => {
      setShowForm(false);
      setName('');
      setRotationId('');
      setStepsJson('[{"level":1,"afterMinutes":5,"targets":["rotation"]}]');
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['escalation-policies'] });
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to create policy');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => endpoints.escalation.deletePolicy(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escalation-policies'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      endpoints.escalation.updatePolicy(id, { enabled: !enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escalation-policies'] }),
  });

  const policies: Policy[] = data ?? [];

  const parseSteps = (raw?: string): Step[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Escalation Policies</h1>
          <p className="text-sm text-gray-500 mt-1">Multi-step paging targets for incident escalation</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Policy
        </button>
      </div>

      {/* Policy flow summary (PagerDuty-style): how many policies, total escalation
          levels, and any policy missing a rotation link — the operational state
          at a glance (audit: page listed policies but had no summary strip). */}
      {policies.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Policies', value: policies.length, color: 'text-blue-400' },
            { label: 'Escalation levels', value: policies.reduce((acc: number, p: any) => acc + parseSteps(p.steps).length, 0), color: 'text-green-400' },
            { label: 'Without rotation link', value: policies.filter((p: any) => !p.rotationId).length, color: 'text-amber-400' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create escalation policy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sev-1 paging"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Rotation ID (optional)</label>
              <input
                value={rotationId}
                onChange={(e) => setRotationId(e.target.value)}
                placeholder="UUID of an on-call rotation"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Steps (JSON)</label>
              <textarea
                value={stepsJson}
                onChange={(e) => setStepsJson(e.target.value)}
                rows={3}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none transition-all resize-y"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Format: [{'{'}level, afterMinutes, targets: ['rotation' | email]{'}'}]
              </p>
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Policy'}
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
        <div className="text-center text-gray-500 py-12">Loading policies...</div>
      ) : policies.length === 0 ? (
        <div className="text-center py-16 text-gray-500 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No escalation policies yet. Create one to define how incidents page your team.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map((p) => {
            const steps = parseSteps(p.steps);
            return (
              <div key={p.id} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{p.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {steps.length} step{steps.length === 1 ? '' : 's'}
                      {p.rotationId ? ' · linked to rotation' : ' · rotation not linked'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleMutation.mutate({ id: p.id, enabled: p.enabled !== false })}
                      className="text-gray-500 hover:text-blue-400 transition-colors cursor-pointer"
                      title={p.enabled === false ? 'Enable policy' : 'Disable policy'}
                    >
                      <Power className={`w-4 h-4 ${p.enabled === false ? 'opacity-40' : ''}`} />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(p.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                      title="Delete policy"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Flow stepper (PagerDuty/OnPage style): incident → tier 1 → if
                    unacknowledged N min → tier 2 → … A visual pipeline instead of a
                    plain JSON list (audit: steps rendered as flat rows). */}
                <div className="border-t border-neutral-800 pt-3">
                  {steps.length === 0 ? (
                    <p className="text-xs text-gray-500">No steps configured.</p>
                  ) : (
                    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
                      {/* Start node */}
                      <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Incident</span>
                        <span className="text-xs text-gray-300">detected</span>
                      </div>
                      {steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <RightChevron className="w-4 h-4 text-gray-600 shrink-0" />
                          <div className={`flex flex-col rounded-xl border px-3 py-1.5 ${idx === 0 ? 'border-blue-500/30 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800'}`}>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                              Tier {step.level} · if unacked {step.afterMinutes}m
                            </span>
                            <span className="text-xs font-mono text-gray-300">
                              {(step.targets ?? []).join(', ') || '—'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Status</span>
                  <span className={`text-xs font-medium ${p.enabled === false ? 'text-gray-500' : 'text-green-400'}`}>
                    {p.enabled === false ? 'DISABLED' : 'ENABLED'}
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
