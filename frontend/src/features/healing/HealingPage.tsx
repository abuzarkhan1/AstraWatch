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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Healing Actions</h1>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-500" />
          <span className="text-sm text-green-500">Auto-healing enabled</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-2xl font-bold text-blue-500">{actions.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Actions</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-2xl font-bold text-green-500">{completed}</div>
          <div className="text-sm text-gray-500 mt-1">Completed</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="text-2xl font-bold text-yellow-500">{pending}</div>
          <div className="text-sm text-gray-500 mt-1">Pending / Approved</div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
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
                    <tr key={action.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-300">{action.actionType}</span>
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
                      <td className="px-4 py-3">
                        <button onClick={async () => { await endpoints.healing.approve(action.id, 'admin'); window.location.reload(); }} className="text-xs text-blue-500 hover:text-blue-400 mr-3">Approve</button>
                        <button onClick={async () => { await endpoints.healing.rollback(action.id, 'Manual rollback'); window.location.reload(); }} className="text-xs text-red-500 hover:text-red-400">Rollback</button>
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
  );
}
