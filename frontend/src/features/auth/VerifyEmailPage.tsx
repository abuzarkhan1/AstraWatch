import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { endpoints } from '@/lib/api';

export default function VerifyEmailPage() {
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendEmail, setResendEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (code.trim().length < 4) {
      setErrorMsg('Enter the 6-digit verification code from your email.');
      return;
    }
    setLoading(true);
    try {
      await endpoints.auth.verifyEmail({ code: code.trim() });
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.data?.error ?? 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!resendEmail.trim()) {
      setErrorMsg('Enter your email to resend the code.');
      return;
    }
    try {
      await endpoints.auth.resendVerification({ email: resendEmail.trim() });
      setResent(true);
      setErrorMsg('');
    } catch {
      setErrorMsg('Failed to resend — try again shortly.');
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
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Email Verified</h2>
              <p className="text-sm text-gray-400">Your account is now verified. You can sign in and start using AstraWatch.</p>
              <Link to="/auth/login" className="inline-block w-full py-3 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 text-white font-bold text-sm transition-all hover:from-blue-600 hover:to-blue-700 border border-blue-500">
                Continue to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Verify Your Email</h2>
                <p className="text-xs text-gray-400 font-mono">Enter the 6-digit code we emailed you.</p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center">
                  {errorMsg}
                </div>
              )}

              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full bg-neutral-900/90 text-white border border-neutral-700/80 focus:border-blue-500 rounded-xl py-3.5 px-4 text-sm text-center tracking-[0.5em] font-mono focus:outline-none transition-all placeholder-gray-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-sm transition-all cursor-pointer shadow-lg shadow-blue-800/80 border border-blue-500 disabled:opacity-60"
              >
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>

              <div className="pt-2 space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Resend to</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="flex-1 bg-neutral-900/90 text-white border border-neutral-700/80 focus:border-blue-500 rounded-xl px-4 py-2 text-sm focus:outline-none transition-all placeholder-gray-600"
                    />
                    <button
                      type="button"
                      onClick={handleResend}
                      className="bg-neutral-800 border border-neutral-700 text-gray-300 font-bold rounded-xl px-4 py-2 text-xs hover:bg-neutral-700 transition-all cursor-pointer"
                    >
                      {resent ? 'Sent!' : 'Resend'}
                    </button>
                  </div>
                </div>
                <div className="text-center">
                  <Link to="/auth/login" className="text-xs text-gray-400 hover:text-white transition-colors">
                    Back to Sign In
                  </Link>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
