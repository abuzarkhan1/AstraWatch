import React, { useState, useEffect } from 'react';
import XIcon from '@/components/ui/x-icon';
import CheckedIcon from '@/components/ui/checked-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import RefreshIcon from '@/components/ui/refresh-icon';
import GithubIcon from '@/components/ui/github-icon';
import ShieldCheck from '@/components/ui/shield-check';
import SparklesIcon from '@/components/ui/sparkles-icon';
import CodeIcon from '@/components/ui/code-icon';
import { endpoints } from '@/lib/api';

interface GitHubIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (repo: string, autoPR: boolean) => void;
}

export default function GitHubIntegrationModal({ isOpen, onClose, onSaved }: GitHubIntegrationModalProps) {
  const [repo, setRepo] = useState('');
  const [autoPR, setAutoPR] = useState(true);
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);

  // Audit fix: the modal previously faked success on every error and the token
  // shipped with a fabricated 'ghp_***' default. Now the fields start honest
  // (empty), the real /test endpoint reports the truth, and save errors are
  // surfaced instead of being silently converted into 'success'.
  const splitRepo = (value: string): { owner: string; name: string } => {
    const parts = value.trim().split('/');
    return { owner: parts[0] ?? '', name: parts.slice(1).join('/') };
  };
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Load saved settings from localStorage fallback
      const savedRepo = localStorage.getItem('astrawatch_github_repo');
      const savedAutoPR = localStorage.getItem('astrawatch_github_auto_pr');
      if (savedRepo) setRepo(savedRepo);
      if (savedAutoPR !== null) setAutoPR(savedAutoPR === 'true');

      // Fetch connected repos from the real API (GET /api/v1/integrations/github/repos)
      endpoints.github.getIntegration()
        .then((res: any) => {
          const unwrapped = res?.data?.data ?? res?.data;
          const repos = Array.isArray(unwrapped) ? unwrapped : [];
          if (repos.length > 0) {
            const r = repos[0];
            if (r?.repoOwner && r?.repoName) {
              setRepo(`${r.repoOwner}/${r.repoName}`);
              setConnected(true);
            }
          }
        })
        .catch(() => {
          // Keep localStorage fallback; connected stays false until a real check passes
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    const { owner, name } = splitRepo(repo);
    if (!owner || !name) {
      setMessage({ type: 'error', text: 'Enter a repository in owner/repo format.' });
      setTesting(false);
      return;
    }
    try {
      const res: any = await endpoints.github.testConnection({ repoOwner: owner, repoName: name, accessToken: token || undefined });
      const result = res?.data?.data ?? res?.data;
      if (result?.success === true) {
        setConnected(true);
        setMessage({ type: 'success', text: `Successfully connected to ${owner}/${name}.` });
      } else {
        setConnected(false);
        setMessage({ type: 'error', text: `Connection failed: ${result?.error ?? result?.message ?? 'GitHub rejected the request'}` });
      }
    } catch (err: any) {
      setConnected(false);
      setMessage({ type: 'error', text: `Connection failed: ${err?.response?.data?.data?.error ?? err?.message ?? 'GitHub API unreachable'}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { owner, name } = splitRepo(repo);
    if (!owner || !name) {
      setMessage({ type: 'error', text: 'Enter a repository in owner/repo format.' });
      setLoading(false);
      return;
    }
    if (!token.trim()) {
      setMessage({ type: 'error', text: 'A GitHub access token is required to connect.' });
      setLoading(false);
      return;
    }

    try {
      await endpoints.github.updateIntegration({ repoOwner: owner, repoName: name, accessToken: token });
      localStorage.setItem('astrawatch_github_repo', repo);
      localStorage.setItem('astrawatch_github_auto_pr', String(autoPR));

      setConnected(true);
      setMessage({ type: 'success', text: 'GitHub integration connected successfully!' });
      if (onSaved) onSaved(repo, autoPR);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      // Honest error surfaced — no fabricated success.
      setMessage({ type: 'error', text: `Save failed: ${err?.response?.data?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'GitHub API unreachable'}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950 p-6 sm:p-8 shadow-2xl">
        
        {/* Glow backdrop */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-purple-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <GithubIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">GitHub Integration</h2>
              <p className="text-xs text-gray-400 font-mono">Connect repositories & configure automated AI remediation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            className={`mb-6 p-3.5 rounded-xl border text-xs font-mono flex items-center gap-2.5 ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {message.type === 'success' ? <CheckedIcon className="w-4 h-4 shrink-0" /> : <TriangleAlertIcon className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          
          {/* Connection Status Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-950/80 border border-neutral-800">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-xs font-semibold text-gray-300">
                {connected ? 'Connected as @astrawatch-bot' : 'Not Connected'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="text-xs font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {testing ? <RefreshIcon className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>{testing ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>

          {/* Repository Target Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              GitHub Repository (<span className="text-purple-400">owner/repo</span>)
            </label>
            <div className="relative">
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="astrawatch/payment-service"
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 py-3 px-4 text-sm text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 font-mono"
                required
              />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">
              Specify the target repository where AI remediation pull requests will be opened.
            </p>
          </div>

          {/* Access Token / App Secret */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              GitHub Access Token / App Secret
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_..."
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 py-3 px-4 text-sm text-white focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 font-mono"
            />
          </div>

          {/* Toggle for Automated AI Remediation Pull Requests */}
          <div className="p-4 rounded-2xl bg-neutral-950/80 border border-purple-500/20 relative overflow-hidden">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-bold text-white">Automated AI Remediation Pull Requests</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Automatically generate pull requests containing root-cause diagnoses, proposed bug fixes, and unit tests whenever an incident is detected.
                </p>
              </div>
              
              {/* Custom Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={autoPR}
                onClick={() => setAutoPR(!autoPR)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoPR ? 'bg-purple-600' : 'bg-neutral-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoPR ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {autoPR && (
              <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-purple-300 font-mono">
                <span className="flex items-center gap-1.5">
                  <CodeIcon className="w-3.5 h-3.5" />
                  Mode: Active Auto-PR Generation
                </span>
                <span className="text-emerald-400 font-bold">Enabled</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-gray-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-900/50 border border-purple-500/50 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Integration Settings</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
