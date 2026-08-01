import { Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useHealingActions } from '@/hooks/useApi';
import { endpoints } from '@/lib/api';

const statusIcons: Record<string, React.ElementType> = {
  COMPLETED: CheckCircle,
  APPROVED: CheckCircle,
  PENDING: AlertTriangle,
  FAILED: XCircle,
  ROLLED_BACK: XCircle,
  EXECUTING: Shield,
};

const statusColors: Record<string, string> = {
  COMPLETED: 'text-green-500',
  APPROVED: 'text-blue-500',
  PENDING: 'text-yellow-500',
  FAILED: 'text-red-500',
  ROLLED_BACK: 'text-orange-500',
  EXECUTING: 'text-blue-500',
};

const riskColor = (score: number) =>
  score < 40 ? 'text-green-500' : score < 75 ? 'text-yellow-500' : 'text-red-500';

export default function HealingPage() {
  const { data: actions = [], isLoading } = useHealingActions();

  const completed = actions.filter((a: any) => a.status === 'COMPLETED').length;
  const pending = actions.filter((a: any) => a.status === 'PENDING' || a.status === 'APPROVED').length;

  return (
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white">Healing Actions</h1>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            <span className="text-sm text-green-500">Auto-healing enabled</span>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-xl">
          <div className="text-2xl font-bold text-blue-500">{actions.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Actions</div>
        </div>
        <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-xl">
          <div className="text-2xl font-bold text-green-500">{completed}</div>
          <div className="text-sm text-gray-500 mt-1">Completed</div>
        </div>
        <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-xl">
          <div className="text-2xl font-bold text-yellow-500">{pending}</div>
          <div className="text-sm text-gray-500 mt-1">Pending / Approved</div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Risk Score</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Created</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : actions.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No healing actions</td></tr>
              ) : (
                actions.map((action: any) => {
                  const Icon: any = statusIcons[action.status] || Shield;
                  return (
                    <tr key={action.id} className="border-b border-white/10 hover:bg-white/[0.04]">
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
                          <Icon className={`w-4 h-4 ${statusColors[action.status]}`} />
                          <span className={`text-sm ${statusColors[action.status]}`}>{action.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(action.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={async () => { await endpoints.healing.approve(action.id, 'admin'); window.location.reload(); }} className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all">Approve</button>
                        <button onClick={async () => { await endpoints.healing.rollback(action.id, 'Manual rollback'); window.location.reload(); }} className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-900/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 hover:from-blue-600 hover:to-blue-700 transition-all">Rollback</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
