import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FilledBellIcon from '@/components/ui/filled-bell-icon';
import BellOffIcon from '@/components/ui/bell-off-icon';
import { endpoints } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import ClockIcon from '@/components/ui/clock-icon';

interface AlertRule {
  id: string;
  name: string;
  serviceId: string;
  metric: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  lastTriggered?: string;
}

export default function AlertingCenterPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('');
  const [condition, setCondition] = useState('>');
  const [threshold, setThreshold] = useState('100');
  const [formError, setFormError] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const { data } = await endpoints.alerting.listRules();
      // The controller returns ApiResponse { data: { rules: [...] } } — unwrap
      // the envelope before reading (audit: previously read the envelope top
      // level and silently rendered an empty rules list).
      const unwrapped = data?.data ?? data;
      const raw = Array.isArray(unwrapped) ? unwrapped : unwrapped?.rules ?? data?.rules ?? [];
      const items = raw ?? [];
      return items.map((r: any) => {
        // The DTO returns conditions as a JSON string (jsonb) plus channelIds
        // (UUID[]), isEnabled — not flat metric/condition/threshold fields.
        // Parse the stored condition for display; fall back to defaults.
        let metric = '';
        let condition = '>';
        let threshold = 0;
        try {
          const cond = JSON.parse(r.conditions ?? '[]');
          const first = Array.isArray(cond) ? cond[0] : cond;
          if (first) {
            metric = first.metric ?? first.name ?? '';
            condition = first.operator ?? first.condition ?? '>';
            threshold = Number(first.threshold ?? 0);
          }
        } catch {
          // Unparseable conditions — keep defaults
        }
        return {
          id: r.id,
          name: r.name ?? 'Untitled rule',
          serviceId: r.serviceId ?? '',
          metric,
          condition,
          threshold,
          enabled: r.isEnabled ?? r.enabled ?? true,
          lastTriggered: r.lastTriggered,
        };
      }) as AlertRule[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      endpoints.alerting.createRule({
        name,
        // Backend NotificationRule requires conditions (jsonb string) and
        // channelIds (UUID[] literal) — both NOT NULL. Sending the previous
        // {metric, condition, threshold} shape would 500 on the DB constraint.
        conditions: JSON.stringify([{ metric, operator: condition, threshold: Number(threshold) }]),
        channelIds: '{}',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      setShowCreate(false);
      setName(''); setMetric(''); setCondition('>'); setThreshold('100'); setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to create rule');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      endpoints.alerting.toggleRule(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const rules = data ?? [];

  // SaaS rule-status filters (Sentry/Alertmanager pattern) — client-side only.
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENABLED' | 'DISABLED' | 'TRIGGERED'>('ALL');

  const enabled = rules.filter((r) => r.enabled).length;
  const triggered = rules.filter((r) => r.lastTriggered).length;

  const filtered = rules.filter((r) => {
    if (statusFilter === 'ENABLED') return r.enabled;
    if (statusFilter === 'DISABLED') return !r.enabled;
    if (statusFilter === 'TRIGGERED') return !!r.lastTriggered;
    return true;
  });

  const statusChips: Array<{ value: 'ALL' | 'ENABLED' | 'DISABLED' | 'TRIGGERED'; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'ENABLED', label: `Enabled · ${enabled}` },
    { value: 'DISABLED', label: `Disabled · ${rules.length - enabled}` },
    { value: 'TRIGGERED', label: `Triggered · ${triggered}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerting Center"
        subtitle="Notification rules that page your team when a service metric crosses a threshold."
        meta={<MetaChip>{rules.length} rules</MetaChip>}
        actions={
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Rule
          </Button>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-blue-500">{rules.length}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Total rules</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-green-500">{enabled}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Enabled</div>
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-2xl font-bold text-yellow-500">{triggered}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Ever triggered</div>
        </div>
      </div>

      {/* Status filter chips */}
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
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length} of {rules.length} rules
        </span>
      </div>

      {showCreate && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create Alert Rule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. High latency on payment API"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Metric</label>
              <input
                type="text"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                placeholder="e.g. latency_ms"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&ge;</option>
                <option value="<=">&le;</option>
                <option value="==">=</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Threshold</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || !metric.trim() || createMutation.isPending}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Rule'}
            </Button>
            <Button
              onClick={() => setShowCreate(false)}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      ) : isError ? (
        <div className="text-center text-red-400 py-8">Failed to load alert rules</div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={<FilledBellIcon className="w-7 h-7" />}
          title="No alert rules configured"
          description="Create a rule to get paged when a metric crosses a threshold — for example, latency above 200ms on your payment API."
          action={
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create your first rule
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/50 p-10 text-center text-gray-500">
          No {statusFilter.toLowerCase()} rules
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((rule) => {
            const active = rule.enabled;
            return (
              <div key={rule.id} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 hover:border-neutral-700 transition-colors">
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {active ? (
                        <FilledBellIcon className="w-5 h-5 text-green-500" />
                      ) : (
                        <BellOffIcon className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{rule.name}</p>
                        {active && <div className="h-2 w-2 bg-blue-500 rounded-full shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {rule.metric} {rule.condition} {rule.threshold} &middot; {rule.serviceId || 'All services'}
                      </p>
                      {rule.lastTriggered && (
                        <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                          <ClockIcon className="w-3 h-3" />
                          Last triggered: {new Date(rule.lastTriggered).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${active ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-neutral-600 bg-neutral-800 text-gray-400'}`}>
                      {active ? 'active' : 'inactive'}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !active })}
                      disabled={toggleMutation.isPending}
                      className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {active ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
