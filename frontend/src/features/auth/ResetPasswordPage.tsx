import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { endpoints } from '@/lib/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!token) {
      setErrorMsg('Missing reset token — check the link in your email.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await endpoints.authExtra.resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.data?.error ??
          err?.response?.data?.error ??
          'Failed to reset password. The link may be invalid or expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans relative overflow-hidden flex items-center justify-center px-6">
      <div className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full pointer-events-none"
        style={{ border: '200px solid #3131f5', filter: 'blur(92px)', WebkitFilter: 'blur(92px)' }} />
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.4, mixBlendMode: 'screen' }} />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 shadow-[0px_-13px_300px_0px_rgba(9,0,255,0.15)] p-8">
          {success ? (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <KeyRound className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Password Reset Complete</h2>
              <p className="text-sm text-gray-400">Your password has been updated. You can now sign in with the new password.</p>
              <Link to="/auth/login" className="inline-block w-full py-3 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 text-white font-bold text-sm transition-all hover:from-blue-600 hover:to-blue-700 border border-blue-500">
                Return to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <KeyRound className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Create New Password</h2>
                <p className="text-xs text-gray-400 font-mono">Enter a new password for your account.</p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-neutral-900/90 text-white border border-neutral-700/80 focus:border-blue-500 rounded-xl py-3.5 px-4 text-sm focus:outline-none transition-all placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat the new password"
                  className="w-full bg-neutral-900/90 text-white border border-neutral-700/80 focus:border-blue-500 rounded-xl py-3.5 px-4 text-sm focus:outline-none transition-all placeholder-gray-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-sm transition-all cursor-pointer shadow-lg shadow-blue-800/80 border border-blue-500 disabled:opacity-60"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <div className="text-center">
                <Link to="/auth/login" className="text-xs text-gray-400 hover:text-white transition-colors">
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
