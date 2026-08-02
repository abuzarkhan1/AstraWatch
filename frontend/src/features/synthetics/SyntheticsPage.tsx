import React, { useEffect, useState } from 'react';
import { Plus, Play, Pause, Trash2, RefreshCw } from 'lucide-react';
import ChartLineIcon from '@/components/ui/chart-line-icon';
import CheckedIcon from '@/components/ui/checked-icon';
import XIcon from '@/components/ui/x-icon';
import ClockIcon from '@/components/ui/clock-icon';
import WorldIcon from '@/components/ui/world-icon';
import WifiIcon from '@/components/ui/wifi-icon';
import { endpoints } from '@/lib/api';

type CheckStatus = 'passing' | 'failing' | 'paused';

interface SyntheticCheck {
  id: string;
  name: string;
  type: 'http' | 'tcp' | 'dns';
  url: string;
  interval: string;
  status: CheckStatus;
  lastRun: string;
  responseTime: number;
  uptime: number;
}

const statusConfig: Record<CheckStatus, { icon: React.ElementType; color: string; badge: string; label: string }> = {
  passing: { icon: CheckedIcon, color: 'text-green-500', badge: 'border-green-500/30 bg-green-500/10 text-green-400', label: 'Passing' },
  failing: { icon: XIcon, color: 'text-red-500', badge: 'border-red-500/30 bg-red-500/10 text-red-400', label: 'Failing' },
  paused: { icon: Pause, color: 'text-gray-500', badge: 'border-neutral-600 bg-neutral-800 text-gray-400', label: 'Paused' },
};

const typeIcon: Record<string, React.ElementType> = {
  http: WorldIcon,
  tcp: WifiIcon,
  dns: ChartLineIcon,
};

const EMPTY: SyntheticCheck[] = [];

export default function SyntheticsPage() {
  const [checks, setChecks] = useState<SyntheticCheck[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newCheck, setNewCheck] = useState({ name: '', url: '', type: 'http' as SyntheticCheck['type'] });

  // Load real checks from the orchestrator (audit: this page rendered fabricated
  // sampleChecks with invented uptime/response values).
  const loadChecks = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await endpoints.synthetics.list();
      const rows = data?.data?.checks;
      if (Array.isArray(rows)) {
        setChecks(rows.map((r: any) => ({
          id: String(r.id),
          name: r.name ?? 'Unnamed check',
          type: (r.type ?? 'http') as SyntheticCheck['type'],
          url: r.url ?? '',
          interval: r.interval ?? '1m',
          status: (r.status ?? 'paused') as CheckStatus,
          lastRun: r.lastRun ?? new Date().toISOString(),
          responseTime: Number(r.responseTime ?? 0),
          uptime: Number(r.uptime ?? 0),
        })));
      } else {
        setChecks(EMPTY);
      }
    } catch (err) {
      setError('Could not load synthetic checks from the orchestrator.');
      setChecks(EMPTY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChecks();
  }, []);

  const toggleCheck = async (id: string) => {
    try {
      await endpoints.synthetics.toggle(id);
      setChecks(prev => prev.map(c =>
        c.id === id ? { ...c, status: c.status === 'paused' ? 'passing' : 'paused' } : c
      ));
    } catch (err) {
      setError('Could not update the check.');
    }
  };

  const deleteCheck = async (id: string) => {
    try {
      await endpoints.synthetics.remove(id);
      setChecks(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError('Could not delete the check.');
    }
  };

  const createCheck = async () => {
    if (!newCheck.name.trim() || !newCheck.url.trim()) return;
    try {
      await endpoints.synthetics.create({
        name: newCheck.name.trim(),
        url: newCheck.url.trim(),
        type: newCheck.type,
      });
      setNewCheck({ name: '', url: '', type: 'http' });
      setShowCreate(false);
      await loadChecks();
    } catch (err) {
      setError('Could not create the check.');
    }
  };

  const passing = checks.filter(c => c.status === 'passing').length;
  const failing = checks.filter(c => c.status === 'failing').length;
  const paused = checks.filter(c => c.status === 'paused').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Synthetic Monitoring</h1>
          <p className="text-sm text-gray-500 mt-1">Automated uptime checks and endpoint probes</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadChecks}
            className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-gray-300 hover:bg-neutral-800 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            New Check
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 p-4 text-sm">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={newCheck.name}
              onChange={e => setNewCheck({ ...newCheck, name: e.target.value })}
              placeholder="Check name (e.g. API Health Check)"
              className="rounded-xl bg-neutral-950 border border-neutral-700 focus:border-blue-500 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
            />
            <input
              value={newCheck.url}
              onChange={e => setNewCheck({ ...newCheck, url: e.target.value })}
              placeholder="URL or host (https://… or host:port)"
              className="rounded-xl bg-neutral-950 border border-neutral-700 focus:border-blue-500 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
            />
            <select
              value={newCheck.type}
              onChange={e => setNewCheck({ ...newCheck, type: e.target.value as SyntheticCheck['type'] })}
              className="rounded-xl bg-neutral-950 border border-neutral-700 focus:border-blue-500 px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="http">HTTP</option>
              <option value="tcp">TCP</option>
              <option value="dns">DNS</option>
            </select>
            <button
              onClick={createCheck}
              className="rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 text-white font-bold px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
            >
              Create check
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Passing', value: passing, color: 'text-green-500' },
          { label: 'Failing', value: failing, color: 'text-red-500' },
          { label: 'Paused', value: paused, color: 'text-gray-400' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Checks Table */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
        {checks.length === 0 && !loading ? (
          <div className="py-16 text-center">
            <p className="text-gray-500 text-sm">No synthetic checks yet. Create your first check to start probing endpoints.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Check</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Response</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Uptime</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Last Run</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => {
                  const { icon: StatusIcon, color, badge, label } = statusConfig[check.status] ?? statusConfig.paused;
                  const TypeIcon = typeIcon[check.type] || WorldIcon;
                  return (
                    <tr key={check.id} className="border-b border-neutral-800 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-200">{check.name}</p>
                          <p className="text-xs text-gray-500 font-mono truncate max-w-xs">{check.url}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <TypeIcon className="w-3.5 h-3.5" />
                          {check.type.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={`w-4 h-4 ${color}`} />
                          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge}`}>{label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-mono ${check.responseTime > 0 ? (check.responseTime < 100 ? 'text-green-500' : check.responseTime < 500 ? 'text-yellow-500' : 'text-red-500') : 'text-gray-600'}`}>
                          {check.responseTime > 0 ? `${check.responseTime}ms` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-mono ${check.uptime >= 99.9 ? 'text-green-500' : check.uptime >= 99 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {check.uptime}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <ClockIcon className="w-3 h-3" />
                          {new Date(check.lastRun).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleCheck(check.id)}
                            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer ${check.status === 'paused' ? 'bg-gradient-to-t from-blue-500 to-blue-600 border-blue-500 text-white shadow-sm shadow-blue-900/50 hover:from-blue-600 hover:to-blue-700' : 'bg-gradient-to-t from-neutral-950 to-neutral-700 border-neutral-700 text-white hover:from-neutral-900 hover:to-neutral-600'}`}
                          >
                            {check.status === 'paused' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                            {check.status === 'paused' ? 'Resume' : 'Pause'}
                          </button>
                          <button
                            onClick={() => deleteCheck(check.id)}
                            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
