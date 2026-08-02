import React, { useState, useEffect } from 'react';
import { endpoints } from '@/lib/api';
import { User, UserRole } from '@/types';
import { UsersIcon } from '@/components/ui/users-icon';
import { ShieldCheck } from '@/components/ui/shield-check';
import { GearIcon } from '@/components/ui/gear-icon';
import { MagnifierIcon } from '@/components/ui/magnifier-icon';
import { CheckedIcon } from '@/components/ui/checked-icon';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { DownChevron } from '@/components/ui/down-chevron';
import { RefreshIcon } from '@/components/ui/refresh-icon';
import { DotsHorizontalIcon } from '@/components/ui/dots-horizontal-icon';
import { TriangleAlertIcon } from '@/components/ui/triangle-alert-icon';
import { EyeIcon } from '@/components/ui/eye-icon';
import {
  UserX,
  CreditCard,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ userId: string; text: string; type: 'success' | 'error' } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await endpoints.users.list();
      const rawData = res.data;
      const usersList: User[] = Array.isArray(rawData)
        ? rawData
        : (rawData?.data || rawData?.items || []);
      
      setUsers(usersList);
    } catch (err: any) {
      console.error('Failed to fetch registered users:', err);
      toast.error('Could not load registered users from server');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleSelectChange = (userId: string, newRole: UserRole) => {
    setSelectedRoles((prev) => ({ ...prev, [userId]: newRole }));
  };

  const handleUpdateRole = async (user: User) => {
    const targetRole = selectedRoles[user.id] || user.role;
    if (targetRole === user.role) {
      toast.info(`User ${user.email} already has role ${user.role}`);
      return;
    }

    setUpdatingUserId(user.id);
    try {
      await endpoints.users.updateRole(user.id, targetRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: targetRole } : u))
      );
      setFeedbackMsg({
        userId: user.id,
        text: `Role updated to ${targetRole}`,
        type: 'success'
      });
      toast.success(`Role for ${user.email} updated to ${targetRole}`);
    } catch (error: any) {
      console.error('Failed to update role:', error);
      toast.error(`Failed to update role for ${user.email}`);
    } finally {
      setUpdatingUserId(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleTogglePromoteAdmin = async (user: User) => {
    const newRole: UserRole = user.role === 'ADMIN' ? 'OPERATOR' : 'ADMIN';
    setUpdatingUserId(user.id);
    try {
      await endpoints.users.updateRole(user.id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
      );
      setSelectedRoles((prev) => ({ ...prev, [user.id]: newRole }));
      toast.success(
        newRole === 'ADMIN'
          ? `Promoted ${user.email} to ADMIN`
          : `Demoted ${user.email} to OPERATOR`
      );
    } catch (error: any) {
      console.error('Failed to toggle admin status:', error);
      toast.error(`Could not change admin privileges for ${user.email}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const isCurrentlyActive = user.status === 'Active' || user.isActive !== false;
    const newStatus = isCurrentlyActive ? 'Deactivated' : 'Active';
    setUpdatingUserId(user.id);
    try {
      await endpoints.users.toggleStatus(user.id);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: newStatus, isActive: !isCurrentlyActive } : u))
      );
      toast.success(`User ${user.email} status changed to ${newStatus}`);
    } catch (error: any) {
      console.error('Failed to toggle status:', error);
      toast.error(`Could not update active status for ${user.email}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  // Stats calculation
  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const operatorCount = users.filter((u) => u.role === 'OPERATOR').length;
  const viewerCount = users.filter((u) => u.role === 'VIEWER').length;
  const billingCount = users.filter((u) => u.role === 'BILLING_OWNER').length;

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-500/50 shadow-[0_0_12px_rgba(32,108,232,0.3)]">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            ADMIN
          </span>
        );
      case 'OPERATOR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
            <GearIcon className="w-3.5 h-3.5 text-cyan-400" />
            OPERATOR
          </span>
        );
      case 'VIEWER':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-neutral-900 text-gray-300 border border-neutral-700">
            <EyeIcon className="w-3.5 h-3.5 text-gray-400" />
            VIEWER
          </span>
        );
      case 'BILLING_OWNER':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <CreditCard className="w-3.5 h-3.5 text-amber-400" />
            BILLING_OWNER
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-neutral-900 text-gray-400 border border-neutral-800">
            {role || 'USER'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">User Management</h1>
          <p className="text-sm text-gray-400">
            Manage organization user accounts, grant Admin role permissions, and control access policies.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-medium rounded-lg px-4 py-2 transition-colors cursor-pointer self-start md:self-auto text-sm"
        >
          <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh List</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-400">Total Users</span>
            <UsersIcon className="w-5 h-5 text-blue-500" />
          </div>
          <span className="text-3xl font-bold text-white">{totalUsers}</span>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-400">Admins</span>
            <ShieldCheck className="w-5 h-5 text-purple-500" />
          </div>
          <span className="text-3xl font-bold text-white">{adminCount}</span>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-400">Operators</span>
            <GearIcon className="w-5 h-5 text-emerald-500" />
          </div>
          <span className="text-3xl font-bold text-white">{operatorCount}</span>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-400">Viewers & Billing</span>
            <EyeIcon className="w-5 h-5 text-gray-400" />
          </div>
          <span className="text-3xl font-bold text-white">{viewerCount + billingCount}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <MagnifierIcon className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-sm text-gray-400">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="OPERATOR">Operator</option>
              <option value="VIEWER">Viewer</option>
              <option value="BILLING_OWNER">Billing Owner</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-950/50 text-gray-400 text-xs uppercase tracking-wider border-b border-neutral-800">
              <tr>
                <th className="px-6 py-4 font-medium">User Account</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Admin Access</th>
                <th className="px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshIcon className="w-5 h-5 animate-spin text-blue-500" />
                      <span>Loading accounts...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <UserX className="w-8 h-8 text-neutral-700" />
                      <span>No users found.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const currentSelectedRole = selectedRoles[user.id] || user.role;
                  const isUpdating = updatingUserId === user.id;
                  const isAdmin = user.role === 'ADMIN';
                  const isActive = user.status === 'Active' || user.isActive !== false;

                  return (
                    <tr key={user.id} className="hover:bg-neutral-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-900/40 border border-blue-700/50 flex items-center justify-center text-blue-400 font-bold">
                            {(user.name?.[0] || user.email[0]).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white">
                              {user.name || user.email.split('@')[0]}
                            </div>
                            <div className="text-xs text-gray-400">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                          user.role === 'ADMIN' ? 'bg-purple-900/30 text-purple-400 border-purple-700/30' :
                          user.role === 'OPERATOR' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30' :
                          user.role === 'BILLING_OWNER' ? 'bg-amber-900/30 text-amber-400 border-amber-700/30' :
                          'bg-neutral-800 text-gray-300 border-neutral-700'
                        }`}>
                          {user.role === 'ADMIN' && <ShieldCheck className="w-3.5 h-3.5" />}
                          {user.role === 'OPERATOR' && <GearIcon className="w-3.5 h-3.5" />}
                          {user.role === 'VIEWER' && <EyeIcon className="w-3.5 h-3.5" />}
                          {user.role === 'BILLING_OWNER' && <CreditCard className="w-3.5 h-3.5" />}
                          {user.role}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleStatus(user)}
                          disabled={isUpdating}
                          className="cursor-pointer"
                        >
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-900/30 text-green-400 border border-green-700/30 hover:bg-green-900/50 transition-colors">
                              <UserCheck className="w-3.5 h-3.5" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-900/30 text-red-400 border border-red-700/30 hover:bg-red-900/50 transition-colors">
                              <UserX className="w-3.5 h-3.5" /> Disabled
                            </span>
                          )}
                        </button>
                      </td>

                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleTogglePromoteAdmin(user)}
                          disabled={isUpdating}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isAdmin ? 'bg-blue-600' : 'bg-neutral-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isAdmin ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={currentSelectedRole}
                            onChange={(e) => handleRoleSelectChange(user.id, e.target.value as UserRole)}
                            disabled={isUpdating}
                            className="bg-neutral-950 border border-neutral-700 hover:border-neutral-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="ADMIN">ADMIN</option>
                            <option value="OPERATOR">OPERATOR</option>
                            <option value="VIEWER">VIEWER</option>
                            <option value="BILLING_OWNER">BILLING_OWNER</option>
                          </select>
                          <button
                            onClick={() => handleUpdateRole(user)}
                            disabled={isUpdating || currentSelectedRole === user.role}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                              currentSelectedRole !== user.role
                                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                                : 'bg-neutral-800 text-gray-500 cursor-not-allowed opacity-50'
                            }`}
                          >
                            {isUpdating ? <RefreshIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckedIcon className="w-3.5 h-3.5" />}
                            Update
                          </button>
                        </div>
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
