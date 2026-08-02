import ShieldCheck from '@/components/ui/shield-check';
import CheckedIcon from '@/components/ui/checked-icon';
import XIcon from '@/components/ui/x-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import { useHealingActions } from '@/hooks/useApi';
import { endpoints } from '@/lib/api';

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
        <h1 className="text-3xl font-bold tracking-tight text-white">Healing Actions</h1>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-green-500" />
          <span className="text-sm text-green-500">Auto-healing enabled</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 border-b border-neutral-800 hover:bg-white/[0.03] transition-colors">Loading...</td></tr>
              ) : actions.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 border-b border-neutral-800 hover:bg-white/[0.03] transition-colors">No healing actions</td></tr>
              ) : (
                actions.map((action: any) => {
                  const Icon: any = statusIcons[action.status] || ShieldCheck;
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
                          <Icon className={`w-4 h-4 ${statusColors[action.status]}`} />
                          <span className={`text-sm ${statusColors[action.status]}`}>{action.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(action.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={async () => { await endpoints.healing.approve(action.id, 'admin'); window.location.reload(); }} className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer">Approve</button>
                        <button onClick={async () => { await endpoints.healing.rollback(action.id, 'Manual rollback'); window.location.reload(); }} className="bg-gradient-to-t from-neutral-950 to-neutral-700 shadow-lg shadow-neutral-900 border border-neutral-700 text-white font-bold rounded-xl px-4 py-2.5 hover:from-neutral-900 hover:to-neutral-600 transition-all cursor-pointer">Rollback</button>
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
