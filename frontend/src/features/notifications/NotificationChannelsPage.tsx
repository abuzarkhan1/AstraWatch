import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Mail, Smartphone, Webhook, Power, Send } from 'lucide-react';
import { endpoints } from '@/lib/api';

interface Channel {
  id: string;
  name: string;
  type: string;
  config?: string;
  isEnabled?: boolean;
  createdAt?: string;
}

const typeOptions = ['email', 'slack', 'webhook', 'sms', 'pagerduty'];

const typeIcon: Record<string, React.ElementType> = {
  email: Mail,
  sms: Smartphone,
  webhook: Webhook,
};

const typeColor: Record<string, string> = {
  email: 'text-blue-400',
  slack: 'text-purple-400',
  webhook: 'text-teal-400',
  sms: 'text-yellow-400',
  pagerduty: 'text-orange-400',
};

export default function NotificationChannelsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('email');
  const [config, setConfig] = useState('{}');
  const [formError, setFormError] = useState('');
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: async () => {
      const { data } = await endpoints.alerting.listChannels();
      return data?.data?.channels ?? data?.channels ?? [];
    },
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      endpoints.alerting.createChannel({
        name,
        type,
        config,
        enabled: true,
      }),
    onSuccess: () => {
      setShowForm(false);
      setName('');
      setType('email');
      setConfig('{}');
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to create channel');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => endpoints.alerting.deleteChannel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-channels'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      endpoints.alerting.updateChannel(id, JSON.stringify({ enabled: !enabled })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-channels'] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => endpoints.alerting.testChannel(id),
    onSuccess: (res: any, id) => {
      const delivered = res?.data?.data?.delivered ?? res?.data?.delivered;
      setTestMsg((m) => ({
        ...m,
        [id]: delivered ? 'Test delivered ✓' : 'Delivery failed (check config)',
      }));
    },
    onError: (_e, id) => {
      setTestMsg((m) => ({ ...m, [id]: 'Delivery failed (check config)' }));
    },
  });

  const channels: Channel[] = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Notification Channels</h1>
          <p className="text-sm text-gray-500 mt-1">Delivery targets for alerts and incident notifications</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Channel
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
          <h2 className="font-semibold text-white">Create notification channel</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. On-call email"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Config (JSON)</label>
              <textarea
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                rows={3}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none transition-all resize-y"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                e.g. {'{"recipients":["oncall@example.com"],"url":"https://hooks.slack.com/..."}'}
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
              {createMutation.isPending ? 'Creating...' : 'Create Channel'}
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
        <div className="text-center text-gray-500 py-12">Loading channels...</div>
      ) : channels.length === 0 ? (
        <div className="text-center py-16 text-gray-500 rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No notification channels yet. Create one to route alerts to your team.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((c) => {
            const Icon = typeIcon[c.type] || Send;
            return (
              <div key={c.id} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3 hover:border-neutral-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${typeColor[c.type] || 'text-gray-400'}`} />
                    <div>
                      <h3 className="font-semibold text-white">{c.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 uppercase">{c.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testMutation.mutate(c.id)}
                      disabled={testMutation.isPending}
                      className="text-gray-500 hover:text-teal-400 transition-colors cursor-pointer"
                      title="Send test notification"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: c.id, enabled: c.isEnabled !== false })}
                      className="text-gray-500 hover:text-blue-400 transition-colors cursor-pointer"
                      title={c.isEnabled === false ? 'Enable channel' : 'Disable channel'}
                    >
                      <Power className={`w-4 h-4 ${c.isEnabled === false ? 'opacity-40' : ''}`} />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                      title="Delete channel"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {c.config && c.config !== '{}' && (
                  <pre className="text-[11px] text-gray-500 bg-neutral-950 border border-neutral-800 rounded-xl p-3 font-mono overflow-x-auto whitespace-pre-wrap">
                    {c.config}
                  </pre>
                )}

                {testMsg[c.id] && (
                  <p className={`text-xs ${testMsg[c.id].includes('✓') ? 'text-green-400' : 'text-red-400'}`}>
                    {testMsg[c.id]}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Status</span>
                  <span className={`text-xs font-medium ${c.isEnabled === false ? 'text-gray-500' : 'text-green-400'}`}>
                    {c.isEnabled === false ? 'DISABLED' : 'ENABLED'}
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
