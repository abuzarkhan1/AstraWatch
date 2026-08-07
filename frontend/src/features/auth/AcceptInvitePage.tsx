import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, AlertTriangle } from 'lucide-react';
import { endpoints } from '@/lib/api';

/**
 * Invite acceptance screen (audit 2.6): the backend /api/v1/auth/accept-invite
 * and the api.ts helper existed but no UI ever called them. A team member who
 * clicks an invite link (e.g. /invite?token=...) lands here to redeem it.
 */
export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleAccept = async () => {
    if (!token.trim()) {
      setStatus('error');
      setMessage('Missing invite token. Check the link in your email.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      await endpoints.authExtra.acceptInvite(token.trim());
      setStatus('success');
      setMessage('Invite accepted! You can now sign in or reset your password to set one.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.response?.data?.data?.error ?? err?.message ?? 'This invite is invalid, expired, or already used.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
          {status === 'success' ? (
            <MailCheck className="h-6 w-6 text-blue-400" />
          ) : status === 'error' ? (
            <AlertTriangle className="h-6 w-6 text-red-400" />
          ) : (
            <MailCheck className="h-6 w-6 text-blue-400" />
          )}
        </div>

        <h1 className="text-xl font-semibold text-white">Team Invitation</h1>
        <p className="mt-2 text-sm text-gray-400">
          {status === 'success'
            ? 'Your invite has been redeemed.'
            : status === 'error'
              ? 'We could not accept this invite.'
              : 'You have been invited to join an AstraWatch team. Accept the invite to get started.'}
        </p>

        {message && (
          <p className={`mt-3 text-sm ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}

        <div className="mt-6 space-y-3">
          {status !== 'success' && (
            <button
              onClick={handleAccept}
              disabled={status === 'loading'}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Accepting...' : 'Accept Invite'}
            </button>
          )}
          <Link
            to="/auth/login"
            className="block w-full rounded-xl border border-neutral-700 py-2.5 text-sm font-medium text-gray-300 hover:bg-neutral-800 transition-colors"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
