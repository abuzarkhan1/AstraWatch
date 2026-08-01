import React, { useState } from 'react';
import { Activity, Plus, Play, Pause, CheckCircle2, XCircle, Clock, Globe, Wifi } from 'lucide-react';

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

const sampleChecks: SyntheticCheck[] = [
  { id: '1', name: 'API Health Check', type: 'http', url: 'https://api.astrawatch.io/health', interval: '1m', status: 'passing', lastRun: new Date(Date.now() - 30000).toISOString(), responseTime: 42, uptime: 99.97 },
  { id: '2', name: 'Dashboard Uptime', type: 'http', url: 'https://app.astrawatch.io', interval: '5m', status: 'passing', lastRun: new Date(Date.now() - 120000).toISOString(), responseTime: 185, uptime: 100 },
  { id: '3', name: 'Kafka TCP Check', type: 'tcp', url: 'kafka.internal:9092', interval: '30s', status: 'failing', lastRun: new Date(Date.now() - 15000).toISOString(), responseTime: 0, uptime: 97.2 },
  { id: '4', name: 'DNS Resolution', type: 'dns', url: 'api.astrawatch.io', interval: '2m', status: 'passing', lastRun: new Date(Date.now() - 60000).toISOString(), responseTime: 8, uptime: 99.99 },
  { id: '5', name: 'Auth Service Probe', type: 'http', url: 'https://auth.astrawatch.io/ping', interval: '1m', status: 'paused', lastRun: new Date(Date.now() - 600000).toISOString(), responseTime: 0, uptime: 98.5 },
];

const statusConfig: Record<CheckStatus, { icon: React.ElementType; color: string; badge: string; label: string }> = {
  passing: { icon: CheckCircle2, color: 'text-green-500', badge: 'border-green-500/30 bg-green-500/10 text-green-400', label: 'Passing' },
  failing: { icon: XCircle, color: 'text-red-500', badge: 'border-red-500/30 bg-red-500/10 text-red-400', label: 'Failing' },
  paused: { icon: Pause, color: 'text-gray-500', badge: 'border-neutral-600 bg-neutral-800 text-gray-400', label: 'Paused' },
};

const typeIcon: Record<string, React.ElementType> = {
  http: Globe,
  tcp: Wifi,
  dns: Activity,
};

export default function SyntheticsPage() {
  const [checks, setChecks] = useState<SyntheticCheck[]>(sampleChecks);

  const toggleCheck = (id: string) => {
    setChecks(prev => prev.map(c =>
      c.id === id ? { ...c, status: c.status === 'paused' ? 'passing' : 'paused' } : c
    ));
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
        <button className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm">
          <Plus className="w-4 h-4" />
          New Check
        </button>
      </div>

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
                const { icon: StatusIcon, color, badge, label } = statusConfig[check.status];
                const TypeIcon = typeIcon[check.type] || Globe;
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
                        <Clock className="w-3 h-3" />
                        {new Date(check.lastRun).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleCheck(check.id)}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer ${check.status === 'paused' ? 'bg-gradient-to-t from-blue-500 to-blue-600 border-blue-500 text-white shadow-sm shadow-blue-900/50 hover:from-blue-600 hover:to-blue-700' : 'bg-gradient-to-t from-neutral-950 to-neutral-700 border-neutral-700 text-white hover:from-neutral-900 hover:to-neutral-600'}`}
                      >
                        {check.status === 'paused' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        {check.status === 'paused' ? 'Resume' : 'Pause'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
