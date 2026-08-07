import ShieldCheck from '@/components/ui/shield-check';
import CheckedIcon from '@/components/ui/checked-icon';
import XIcon from '@/components/ui/x-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import { useHealingActions } from '@/hooks/useApi';
import { endpoints } from '@/lib/api';
import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useIncidents } from '@/hooks/useApi';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const statusIcons: Record<string, React.ElementType> = {
  COMPLETED: CheckedIcon,
  APPROVED: CheckedIcon,
  PENDING: TriangleAlertIcon,
  FAILED: XIcon,
  ROLLED_BACK: XIcon,
  EXECUTING: ShieldCheck,
};

const statusColors: Record<string, string> = {
  COMPLETED: 'text-green-500',
  APPROVED: 'text-blue-500',
  PENDING: 'text-yellow-500',
  FAILED: 'text-red-500',
  ROLLED_BACK: 'text-orange-500',
  EXECUTING: 'text-blue-500',
  VALIDATING: 'text-purple-500',
  DRY_RUN: 'text-gray-400',
};

const riskColor = (score: number) =>
  score < 40 ? 'text-green-500' : score < 75 ? 'text-yellow-500' : 'text-red-500';

export default function HealingPage() {
  const { data: actions = [], isLoading } = useHealingActions();
  const queryClient = useQueryClient();

  // ── Trigger healing (audit Part 2.1: healing/trigger existed on the backend
  // but the page only listed actions — no way to request a remediation).
  const { data: incidentsData } = useIncidents();
  const incidents = Array.isArray(incidentsData) ? incidentsData : (incidentsData?.items ?? []);
  const [showTrigger, setShowTrigger] = useState(false);
  const [tIncident, setTIncident] = useState('');
  const [tActionType, setTActionType] = useState('restart_pod');
  const [tParams, setTParams] = useState('{}');
  const [tError, setTError] = useState('');
  const [tMsg, setTMsg] = useState('');

  const triggerMutation = useMutation({
    mutationFn: () => {
      let params: Record<string, unknown> = {};
      try {
        params = tParams.trim() ? JSON.parse(tParams) : {};
      } catch {
        throw new Error('Parameters must be valid JSON');
      }
      return endpoints.healing.trigger({ incidentId: tIncident, actionType: tActionType, parameters: params });
    },
    onSuccess: () => {
      setShowTrigger(false);
      setTIncident('');
      setTParams('{}');
      setTMsg('Healing action triggered.');
      setTimeout(() => setTMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['healing-actions'] });
      setTError('');
    },
    onError: (err: any) => setTError(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to trigger healing'),
  });

  // SaaS status filter chips — quick pivot between pipeline stages (Sentry
  // issues-list pattern). Client-side only; honest counts from loaded actions.
  const [statusFilter, setStatusFilter] = useState('ALL');

  const completed = actions.filter((a: any) => a.status === 'COMPLETED').length;
  const pending = actions.filter((a: any) => a.status === 'PENDING' || a.status === 'APPROVED').length;
  const failed = actions.filter((a: any) => a.status === 'FAILED' || a.status === 'ROLLED_BACK').length;

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return actions;
    if (statusFilter === 'ACTIVE') {
      return actions.filter((a: any) => ['PENDING', 'APPROVED', 'EXECUTING', 'VALIDATING'].includes(a.status));
    }
    return actions.filter((a: any) => a.status === statusFilter);
  }, [actions, statusFilter]);

  const statusChips: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'EXECUTING', label: 'Executing' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'ROLLED_BACK', label: 'Rolled back' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Healing Actions"
        subtitle="Automated remediation for incidents — approve, monitor and roll back actions."
        meta={<MetaChip>{actions.length} actions</MetaChip>}
        actions={
          <>
            <button
              onClick={() => setShowTrigger(true)}
              className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
            >
              <Play className="w-4 h-4" />
              Trigger Healing
            </button>
            <span className="hidden sm:flex items-center gap-2 text-sm text-green-500">
              <ShieldCheck className="w-5 h-5 text-green-500" />
              Auto-healing enabled
            </span>
          </>
        }
      />

      {showTrigger && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Trigger Healing Action</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Incident</label>
              <select
                value={tIncident}
                onChange={(e) => setTIncident(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                <option value="">Select an incident...</option>
                {(incidents as any[]).map((inc: any) => (
                  <option key={inc.id} value={inc.id}>{inc.title || inc.id?.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Action Type</label>
              <select
                value={tActionType}
                onChange={(e) => setTActionType(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                <option value="restart_pod">Restart Pod</option>
                <option value="scale_deployment">Scale Deployment</option>
                <option value="delete_pod">Delete Pod</option>
                <option value="update_deployment">Update Deployment</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Parameters (JSON)</label>
              <textarea
                value={tParams}
                onChange={(e) => setTParams(e.target.value)}
                rows={2}
                placeholder='{"podName":"payment-api-7d9f-4","namespace":"default"}'
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none transition-all resize-y"
              />
            </div>
          </div>
          {tError && <p className="text-sm text-red-400">{tError}</p>}
          {tMsg && <p className="text-sm text-green-400">{tMsg}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => triggerMutation.mutate()}
              disabled={!tIncident || triggerMutation.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {triggerMutation.isPending ? 'Triggering...' : 'Trigger'}
            </button>
            <button
              onClick={() => setShowTrigger(false)}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 text-sm font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <div className="text-2xl font-bold text-blue-500">{actions.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Actions</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <div className="text-2xl font-bold text-green-500">{completed}</div>
          <div className="text-sm text-gray-500 mt-1">Completed</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <div className="text-2xl font-bold text-yellow-500">{pending}</div>
          <div className="text-sm text-gray-500 mt-1">Pending / Approved</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <div className="text-2xl font-bold text-red-500">{failed}</div>
          <div className="text-sm text-gray-500 mt-1">Failed / Rolled back</div>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1 flex-wrap">
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
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length} of {actions.length} actions
        </span>
      </div>

      {/* The table card is hidden entirely when the workspace is empty so the
          dashed EmptyState below is the single honest message (review fix: the
          table also rendered a 'No actions' row, duplicating it). */}
      {(isLoading || actions.length > 0) && (
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 overflow-hidden">
        <div className="overflow-x-auto relative z-10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Action</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Risk Score</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Created</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-800">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 border-b border-neutral-800 transition-colors">No {statusFilter.toLowerCase()} actions</td></tr>
              ) : (
                filtered.map((action: any) => {
                  const Icon: any = statusIcons[action.status] || ShieldCheck;
                  // Only render lifecycle actions the status actually supports
                  // (audit: Approve/Rollback were shown for every row, even
                  // COMPLETED/FAILED ones — a control that can never succeed).
                  // COMPLETED stays rollbackable: undoing a completed fix that
                  // made things worse is a real operational path.
                  const canApprove = action.status === 'PENDING';
                  const canRollback = ['APPROVED', 'EXECUTING', 'VALIDATING', 'COMPLETED'].includes(action.status);
                  return (
                    <tr key={action.id} className="border-b border-neutral-800 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">{action.actionType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-mono ${riskColor(action.riskScore)}`}>
                          {action.riskScore}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${statusColors[action.status] || 'text-gray-400'}`} />
                          <span className={`text-sm ${statusColors[action.status] || 'text-gray-400'}`}>{action.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {action.createdAt ? new Date(action.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {canApprove && (
                            <button onClick={async () => { await endpoints.healing.approve(action.id, 'admin'); window.location.reload(); }} className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer">Approve</button>
                          )}
                          {canRollback && (
                            <button onClick={async () => { await endpoints.healing.rollback(action.id, 'Manual rollback'); window.location.reload(); }} className="bg-gradient-to-t from-neutral-950 to-neutral-700 shadow-lg shadow-neutral-900 border border-neutral-700 text-white font-bold rounded-xl px-4 py-2.5 hover:from-neutral-900 hover:to-neutral-600 transition-all cursor-pointer">Rollback</button>
                          )}
                          {!canApprove && !canRollback && (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Empty workspace state (rendered outside the table so the dashed card
          doesn't nest inside a table cell — review fix). */}
      {!isLoading && actions.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="w-7 h-7" />}
          title="No healing actions yet"
          description="When the orchestrator detects an anomaly it can trigger automated remediation here. You can also trigger one manually from an open incident."
          action={
            <button
              onClick={() => setShowTrigger(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold px-4 py-2 text-sm hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Trigger Healing
            </button>
          }
        />
      )}
    </div>
  );
}
