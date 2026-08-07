import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import BookIcon from '@/components/ui/book-icon';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import ClockIcon from '@/components/ui/clock-icon';
import HashtagIcon from '@/components/ui/hashtag-icon';
import RefreshIcon from '@/components/ui/refresh-icon';
import { endpoints } from '@/lib/api';

interface Runbook {
  id: string;
  title: string;
  lastUpdated: string;
  steps: number;
  tags: string[];
  severity: 'CRITICAL' | 'HIGH' | 'STANDARD';
  content?: string;
}

const severityBadge: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  STANDARD: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

export default function RunbooksPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState('');
  const [severity, setSeverity] = useState('STANDARD');
  const [tags, setTags] = useState('');
  const [formError, setFormError] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['runbooks'],
    queryFn: async () => {
      const { data } = await endpoints.runbooks.list();
      // The controller returns ApiResponse { data: { runbooks: [...] } } —
      // unwrap the envelope before reading (audit: previously read the envelope
      // top level and silently rendered an empty list).
      const unwrapped = data?.data ?? data;
      const items = Array.isArray(unwrapped)
        ? unwrapped
        : unwrapped?.runbooks ?? data?.runbooks ?? data?.items ?? [];
      return items as Runbook[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      endpoints.runbooks.create({
        title,
        severity,
        steps: steps.split('\n').filter((s) => s.trim()),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      setShowCreate(false);
      setTitle('');
      setSteps('');
      setTags('');
      setSeverity('STANDARD');
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to create runbook');
    },
  });

  // Audit P3: runbook execution is real on the backend (POST /{id}/execute →
  // executionId) but the page only listed runbooks. Now each row can execute
  // the playbook and show the returned execution id / message.
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [execResults, setExecResults] = useState<Record<string, { executionId?: string; message?: string; error?: string }>>({});
  const executeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await endpoints.runbooks.execute(id);
      const unwrapped = data?.data ?? data;
      return unwrapped;
    },
    onSuccess: (res: any, id) => {
      setExecResults((m) => ({
        ...m,
        [id]: {
          executionId: res?.executionId ?? res?.id,
          message: res?.message ?? (res?.executionId ? 'Execution started.' : JSON.stringify(res)),
        },
      }));
      setExecutingId(null);
    },
    onError: (err: any, id) => {
      setExecResults((m) => ({
        ...m,
        [id]: { error: err?.response?.data?.data?.error ?? err?.message ?? 'Execution failed' },
      }));
      setExecutingId(null);
    },
  });

  const filtered = (data ?? []).filter(
    (r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Runbooks</h1>
          <p className="text-sm text-gray-500 mt-1">Operational playbooks and remediation guides</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
        >
          <Plus className="w-4 h-4" />
          New Runbook
        </button>
      </div>

      <div className="max-w-sm relative z-10">
        <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search runbooks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
        />
      </div>

      {showCreate && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create Runbook</h2>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Payment API degradation playbook"
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                <option value="STANDARD">STANDARD</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="payments, database"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Steps (one per line)</label>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={'1. Check database connection pool\n2. Restart payment workers\n3. Verify recovery'}
              rows={4}
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all resize-y"
            />
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!title.trim() || createMutation.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Runbook'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading runbooks...</div>
      ) : isError ? (
        <div className="text-center text-red-400 py-12">Failed to load runbooks</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <BookIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{search ? 'No runbooks match your search' : 'No runbooks yet — create your first playbook'}</p>
        </div>
      ) : (
        <div className="space-y-3 relative z-10">
          {filtered.map((runbook) => (
            <div
              key={runbook.id}
              className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5 group hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-xl bg-neutral-800 border border-neutral-700 group-hover:border-blue-500/30 transition-colors">
                    <BookIcon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base group-hover:text-blue-300 transition-colors">{runbook.title}</h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <ClockIcon className="w-3 h-3" />
                        {runbook.lastUpdated ? new Date(runbook.lastUpdated).toLocaleDateString() : 'Never updated'}
                      </div>
                      <span className="text-gray-600">·</span>
                      <span className="text-xs text-gray-500">{runbook.steps ?? 0} steps</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(runbook.tags ?? []).map((tag) => (
                        <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-gray-400">
                          <HashtagIcon className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${severityBadge[runbook.severity] || severityBadge.STANDARD}`}>
                    {runbook.severity}
                  </span>
                  <button
                    onClick={() => {
                      setExecutingId(runbook.id);
                      executeMutation.mutate(runbook.id);
                    }}
                    disabled={executingId === runbook.id || executeMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer disabled:opacity-50"
                    title="Execute runbook"
                  >
                    {executingId === runbook.id ? (
                      <><RefreshIcon className="w-3.5 h-3.5 animate-spin" /> Running...</>
                    ) : (
                      <>Run</>
                    )}
                  </button>
                </div>
              </div>
              {execResults[runbook.id] && (
                <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${execResults[runbook.id].error ? 'border-red-500/30 bg-red-500/5 text-red-400' : 'border-green-500/30 bg-green-500/5 text-green-400'}`}>
                  {execResults[runbook.id].error
                    ? `Execution failed: ${execResults[runbook.id].error}`
                    : (execResults[runbook.id].message ?? 'Execution started.')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
