import React, { useState, useEffect } from 'react';
import { endpoints } from '@/lib/api';
import GithubIcon from '@/components/ui/github-icon';
import GearIcon from '@/components/ui/gear-icon';
import CheckedIcon from '@/components/ui/checked-icon';
import CodeIcon from '@/components/ui/code-icon';
import GitHubIntegrationModal from './GitHubIntegrationModal';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [githubRepo, setGithubRepo] = useState('astrawatch/payment-service');
  const [autoPR, setAutoPR] = useState(true);

  useEffect(() => {
    const savedRepo = localStorage.getItem('astrawatch_github_repo');
    const savedAutoPR = localStorage.getItem('astrawatch_github_auto_pr');
    if (savedRepo) setGithubRepo(savedRepo);
    if (savedAutoPR !== null) setAutoPR(savedAutoPR === 'true');
  }, []);

  const handlePortalRedirect = async () => {
    try {
      setLoading(true);
      const res = await endpoints.billing.createPortalSession();
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (error) {
      console.error("Portal redirect error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* GitHub Integration Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Integrations & VCS</h1>
            <p className="text-sm text-gray-400">Connect version control repositories and configure automated remediation</p>
          </div>
          <button
            onClick={() => setIsGitHubModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-900/40 border border-purple-500/50 text-white font-bold rounded-xl px-4 py-2.5 text-xs transition-all cursor-pointer"
          >
            <GearIcon className="w-4 h-4" />
            <span>Configure Integration</span>
          </button>
        </div>

        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <GithubIcon className="w-32 h-32 text-purple-400" />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  <GithubIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">GitHub Remediation Bot</h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <CheckedIcon className="w-3 h-3" /> Connected
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">Target Repo: <span className="text-purple-300 font-semibold">{githubRepo}</span></p>
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed">
                AstraWatch listens to Isolation Forest metric drift and eBPF anomaly triggers to draft code fixes, create pull requests, and trigger container build tests.
              </p>
            </div>

            <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 min-w-[280px] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 flex items-center gap-1.5">
                  <CodeIcon className="w-4 h-4 text-purple-400" />
                  Automated AI Remediation PRs
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${autoPR ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-gray-800 text-gray-500'}`}>
                  {autoPR ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 leading-tight">
                {autoPR ? 'Auto-PRs will be opened automatically for high-severity anomalies.' : 'Auto-PR creation is currently paused.'}
              </div>
              <button
                onClick={() => setIsGitHubModalOpen(true)}
                className="w-full text-center py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-semibold text-purple-300 transition-colors cursor-pointer"
              >
                Edit Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RBAC Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Admin & RBAC Settings</h1>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
          <p className="text-gray-400 mb-4 text-sm">Role-based access control and team permission levels.</p>
          <div className="bg-neutral-950/50 rounded-xl border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-900/50 text-gray-400 border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Role Name</th>
                  <th className="px-4 py-3 font-medium">Permissions Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                <tr>
                  <td className="px-4 py-3 font-medium text-white">Admin</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs text-blue-400 font-medium">Full Access</span></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-white">Editor</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs text-blue-400 font-medium">Read/Write</span></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-white">Viewer</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-gray-500/30 bg-gray-500/10 px-2.5 py-0.5 text-xs text-gray-400 font-medium">Read Only</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Billing Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Billing & Subscriptions</h1>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-8">
          <div className="relative z-10">
            <h2 className="text-xl font-semibold mb-2">Manage Subscription</h2>
            <p className="text-gray-400 mb-4 max-w-md text-sm">Access the Stripe Customer Portal to update your payment methods, download invoices, or change your billing plan.</p>
            
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-3 text-sm text-gray-300">
                <div className="h-2 w-2 bg-blue-500 rounded-full shrink-0" />
                Update payment methods securely
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-300">
                <div className="h-2 w-2 bg-blue-500 rounded-full shrink-0" />
                View and download past invoices
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-300">
                <div className="h-2 w-2 bg-blue-500 rounded-full shrink-0" />
                Upgrade or downgrade your current plan
              </li>
            </ul>

            <button 
              onClick={handlePortalRedirect}
              disabled={loading}
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-5 py-3 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50 text-xs"
            >
              {loading ? "Redirecting to Stripe..." : "Manage Billing & Subscriptions"}
            </button>
          </div>
        </div>
      </div>

      {/* GitHub Integration Modal */}
      <GitHubIntegrationModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
        onSaved={(repo, auto) => {
          setGithubRepo(repo);
          setAutoPR(auto);
        }}
      />
    </div>
  );
}
