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
  EXECUTING: 'text-purple-500',
};

const riskColor = (score: number) =>
  score < 40 ? 'text-green-500' : score < 75 ? 'text-yellow-500' : 'text-red-500';

export default function HealingPage() {
  const { data: actions = [], isLoading } = useHealingActions();

  const completed = actions.filter((a: any) => a.status === 'COMPLETED').length;
  const pending = actions.filter((a: any) => a.status === 'PENDING' || a.status === 'APPROVED').length;

  return (
    <div className="min-h-screen bg-[#060911] text-white p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[rgba(99,102,241,0.08)] blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[rgba(59,130,246,0.08)] blur-[140px] rounded-full pointer-events-none" />
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Healing Actions</h1>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            <span className="text-sm text-green-500">Auto-healing enabled</span>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6">
          <div className="text-2xl font-bold text-blue-500">{actions.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Actions</div>
        </div>
        <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6">
          <div className="text-2xl font-bold text-green-500">{completed}</div>
          <div className="text-sm text-gray-500 mt-1">Completed</div>
        </div>
        <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6">
          <div className="text-2xl font-bold text-yellow-500">{pending}</div>
          <div className="text-sm text-gray-500 mt-1">Pending / Approved</div>
        </div>
      </div>

      <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6 overflow-hidden">
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
                        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300 font-medium">{action.actionType}</span>
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
                        <button onClick={async () => { await endpoints.healing.approve(action.id, 'admin'); window.location.reload(); }} className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-all">Approve</button>
                        <button onClick={async () => { await endpoints.healing.rollback(action.id, 'Manual rollback'); window.location.reload(); }} className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-all">Rollback</button>
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
