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
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />
      <div className="space-y-6 relative z-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">Admin & RBAC Settings</h1>
        <div className="backdrop-blur-2xl bg-neutral-950/40 border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)] rounded-2xl p-6 hover:border-blue-500/40 hover:shadow-[0_12px_40px_0_rgba(32,108,232,0.2)] transition-all duration-300 text-white">
          <p className="text-gray-400">Role-based access control and admin settings go here.</p>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-white mt-12">Billing & Subscriptions</h1>
        <div className="backdrop-blur-3xl bg-neutral-900/30 border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.6),inset_0_1px_1px_0_rgba(255,255,255,0.2)] rounded-2xl p-8 hover:border-blue-400/50 hover:shadow-[0_0_40px_rgba(32,108,232,0.3)] transition-all duration-500 text-white relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10">
            <h2 className="text-xl font-semibold mb-2">Manage Subscription</h2>
            <p className="text-gray-400 mb-6 max-w-md">Access the Stripe Customer Portal to update your payment methods, download invoices, or change your billing plan.</p>
            <button 
              onClick={handlePortalRedirect}
              disabled={loading}
              className="px-6 py-3 rounded-xl font-bold transition-all cursor-pointer bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 relative overflow-hidden group-hover:shadow-[0_0_20px_rgba(32,108,232,0.5)]"
            >
              {loading ? "Redirecting to Stripe..." : "Manage Billing & Subscriptions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
