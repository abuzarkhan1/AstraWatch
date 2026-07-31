import React from 'react';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin & RBAC Settings</h1>
      <div className="backdrop-blur-2xl bg-white/[0.03] p-6 rounded-3xl border border-white/15 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)]">
        <p className="text-gray-400">Role-based access control and admin settings go here.</p>
      </div>
    </div>
  );
}
