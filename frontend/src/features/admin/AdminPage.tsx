import React, { useState } from 'react';
import { endpoints } from '@/lib/api';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);

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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-white">Admin & RBAC Settings</h1>
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
        <p className="text-gray-400 mb-4">Role-based access control and admin settings go here.</p>
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

      <h1 className="text-3xl font-bold tracking-tight text-white mt-12">Billing & Subscriptions</h1>
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-8">
          <div className="relative z-10">
            <h2 className="text-xl font-semibold mb-2">Manage Subscription</h2>
            <p className="text-gray-400 mb-4 max-w-md">Access the Stripe Customer Portal to update your payment methods, download invoices, or change your billing plan.</p>
            
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
              className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-5 py-3 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Redirecting to Stripe..." : "Manage Billing & Subscriptions"}
            </button>
          </div>
        </div>
      </div>
  );
}
