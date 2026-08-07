import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Monitor, ShieldCheck, UserPlus, Users, Smartphone } from 'lucide-react';
import { endpoints } from '@/lib/api';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-blue-300 font-mono break-all">
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="bg-neutral-800 border border-neutral-700 text-gray-300 text-xs font-bold rounded-xl px-3 py-2 hover:bg-neutral-700 transition-all cursor-pointer"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-[11px] text-yellow-500/80 mt-1">
        This value is shown only once. Store it somewhere safe.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  // Backend wraps every response in ApiResponse {success, data: {keys}} —
  // unwrap the envelope before reading the list (audit: read data?.keys on the
  // envelope top level, so keys/sessions always rendered as empty).
  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data } = await endpoints.authExtra.listApiKeys();
      return data?.data?.keys ?? data?.keys ?? [];
    },
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data } = await endpoints.authExtra.sessions();
      return data?.data?.sessions ?? data?.sessions ?? [];
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: (name: string) => endpoints.authExtra.createApiKey(name),
    onSuccess: (res: any) => {
      setCreatedKey(res?.data?.data?.key ?? res?.data?.key ?? '');
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => endpoints.authExtra.revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const terminateSessionMutation = useMutation({
    mutationFn: (id: string) => endpoints.authExtra.terminateSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      endpoints.authExtra.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setPwMsg('Password updated successfully.');
      setPwError('');
      setCurrentPassword('');
      setNewPassword('');
    },
    onError: (err: any) => {
      setPwError(err?.response?.data?.data?.error ?? 'Password change failed.');
      setPwMsg('');
    },
  });

  // ── Audit P3: MFA, invites, and switch-team existed on the backend but had
  // no UI. Real RFC 6238 TOTP: /mfa/setup returns a secret + otpauth URI,
  // /mfa/verify enables it only after a correct code, /mfa/disable clears it.
  const [mfaSetup, setMfaSetup] = useState<{ secret?: string; qrCodeUrl?: string; backupCodes?: string[] } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMsg, setMfaMsg] = useState('');
  const [mfaErr, setMfaErr] = useState('');

  const mfaSetupMutation = useMutation({
    mutationFn: () => endpoints.mfa.setup(),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      setMfaSetup({
        secret: d?.secret,
        qrCodeUrl: d?.qrCodeUrl,
        backupCodes: d?.backupCodes ?? [],
      });
      setMfaMsg('');
      setMfaErr('');
    },
    onError: (err: any) => setMfaErr(err?.response?.data?.data?.error ?? 'MFA setup failed'),
  });

  const mfaVerifyMutation = useMutation({
    mutationFn: () => endpoints.mfa.verify(mfaCode),
    onSuccess: () => {
      setMfaMsg('MFA enabled — authenticator app now required on login.');
      setMfaErr('');
      setMfaCode('');
      setMfaSetup(null);
    },
    onError: (err: any) => setMfaErr(err?.response?.data?.data?.error ?? 'Invalid code — try again.'),
  });

  const mfaDisableMutation = useMutation({
    mutationFn: () => endpoints.mfa.disable(),
    onSuccess: () => {
      setMfaMsg('MFA disabled.');
      setMfaErr('');
      setMfaSetup(null);
    },
    onError: (err: any) => setMfaErr(err?.response?.data?.data?.error ?? 'Failed to disable MFA'),
  });

  // Invite + switch team.
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('VIEWER');
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamMsg, setTeamMsg] = useState('');
  const [teamErr, setTeamErr] = useState('');

  const inviteMutation = useMutation({
    mutationFn: () => endpoints.invite.create({ email: inviteEmail, role: inviteRole }),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      setInviteMsg(`Invite sent to ${d?.email ?? inviteEmail}${d?.token ? ` — token: ${d.token}` : ''}`);
      setInviteErr('');
      setInviteEmail('');
    },
    onError: (err: any) => setInviteErr(err?.response?.data?.data?.error ?? 'Invite failed (admin role required).'),
  });

  const switchTeamMutation = useMutation({
    mutationFn: () => endpoints.team.switch(teamId),
    onSuccess: () => {
      setTeamMsg('Switched team. Reloading session...');
      setTeamErr('');
      setTimeout(() => window.location.reload(), 800);
    },
    onError: (err: any) => setTeamErr(err?.response?.data?.data?.error ?? 'Switch failed.'),
  });

  const keys = keysData ?? [];
  const sessions = sessionsData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">API keys, sessions, and account security</p>
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-white">API Keys</h2>
        </div>

        {createdKey && <CopyField label="New API key (shown once)" value={createdKey} />}

        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. CI deploy key)"
            className="flex-1 bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
          <button
            onClick={() => createKeyMutation.mutate(newKeyName || 'default')}
            disabled={createKeyMutation.isPending}
            className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
          >
            {createKeyMutation.isPending ? 'Creating...' : 'Create Key'}
          </button>
        </div>

        {keysLoading ? (
          <p className="text-sm text-gray-500">Loading keys...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys yet. Keys authenticate the collector agent and WebSocket clients.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k: any) => (
              <div key={k.id} className="flex items-center justify-between py-2.5 border-b border-neutral-800 last:border-0">
                <div>
                  <p className="text-sm text-gray-300 font-medium">{k.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{k.prefix}••••••••</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600">
                    {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : ''}
                  </span>
                  <button
                    onClick={() => revokeKeyMutation.mutate(k.id)}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Monitor className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-white">Active Sessions</h2>
        </div>

        {sessionsLoading ? (
          <p className="text-sm text-gray-500">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-neutral-800 last:border-0">
                <div>
                  <p className="text-sm text-gray-300">{s.device || 'Unknown device'}</p>
                  <p className="text-xs text-gray-500 font-mono">{s.ip || '—'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600">
                    {s.lastActive ? new Date(s.lastActive).toLocaleString() : ''}
                  </span>
                  <button
                    onClick={() => terminateSessionMutation.mutate(s.id)}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors cursor-pointer"
                  >
                    Terminate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Factor Authentication (audit P3: backend real TOTP, no UI) */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-white">Two-Factor Authentication</h2>
        </div>

        {mfaMsg && <p className="text-sm text-green-400">{mfaMsg}</p>}
        {mfaErr && <p className="text-sm text-red-400">{mfaErr}</p>}

        {!mfaSetup ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 max-w-lg">
              Protect your account with an authenticator app (TOTP).
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => mfaSetupMutation.mutate()}
                disabled={mfaSetupMutation.isPending}
                className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
              >
                {mfaSetupMutation.isPending ? 'Setting up...' : 'Set up MFA'}
              </button>
              <button
                onClick={() => mfaDisableMutation.mutate()}
                disabled={mfaDisableMutation.isPending}
                className="bg-neutral-800 border border-neutral-700 text-gray-300 text-sm font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer"
              >
                Disable MFA
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-3 max-w-xl">
            <p className="text-xs text-gray-300">Scan the QR code or enter the secret in your authenticator app, then confirm with a 6-digit code.</p>
            {mfaSetup.qrCodeUrl && (
              <a
                href={mfaSetup.qrCodeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 underline break-all"
              >
                Open otpauth URI (or scan in your authenticator app)
              </a>
            )}
            {mfaSetup.secret && <CopyField label="Secret key" value={mfaSetup.secret} />}
            {mfaSetup.backupCodes && mfaSetup.backupCodes.length > 0 && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Backup codes (save these)</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {mfaSetup.backupCodes.map((c, i) => (
                    <code key={i} className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-[11px] text-blue-300 font-mono">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="w-40 bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
              <button
                onClick={() => mfaVerifyMutation.mutate()}
                disabled={mfaCode.length < 6 || mfaVerifyMutation.isPending}
                className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
              >
                {mfaVerifyMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Team: invite + switch (audit P3: both existed on backend, no UI) */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-white">Team</h2>
        </div>

        {inviteMsg && <p className="text-sm text-green-400">{inviteMsg}</p>}
        {inviteErr && <p className="text-sm text-red-400">{inviteErr}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Invite by email (admin)</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
            >
              <option value="VIEWER">VIEWER</option>
              <option value="OPERATOR">OPERATOR</option>
              <option value="BILLING_OWNER">BILLING_OWNER</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => inviteMutation.mutate()}
          disabled={!inviteEmail.includes('@') || inviteMutation.isPending}
          className="inline-flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
        >
          <UserPlus className="w-4 h-4" />
          {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
        </button>

        <div className="border-t border-neutral-800 pt-4">
          <label className="text-xs text-gray-400 block mb-1">Switch team</label>
          {teamMsg && <p className="text-sm text-green-400 mb-1">{teamMsg}</p>}
          {teamErr && <p className="text-sm text-red-400 mb-1">{teamErr}</p>}
          <div className="flex gap-2 max-w-xl">
            <input
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="Team ID (UUID)"
              className="flex-1 bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
            />
            <button
              onClick={() => switchTeamMutation.mutate()}
              disabled={!teamId.trim() || switchTeamMutation.isPending}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 text-sm font-bold rounded-xl px-4 py-2.5 hover:bg-neutral-700 transition-all cursor-pointer disabled:opacity-50"
            >
              {switchTeamMutation.isPending ? 'Switching...' : 'Switch'}
            </button>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-white">Change Password</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-all"
            />
          </div>
        </div>

        {pwMsg && <p className="text-sm text-green-400">{pwMsg}</p>}
        {pwError && <p className="text-sm text-red-400">{pwError}</p>}

        <button
          onClick={() => changePasswordMutation.mutate()}
          disabled={!currentPassword || !newPassword || changePasswordMutation.isPending}
          className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm disabled:opacity-50"
        >
          {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}
