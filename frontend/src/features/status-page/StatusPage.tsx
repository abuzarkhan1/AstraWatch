import React from 'react';

export default function StatusPage() {
  return (
    <div className="relative min-h-screen bg-[#060911] p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.12),transparent_50%)] pointer-events-none" />
      <div className="space-y-6 relative z-10">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">Status Page</h1>
        <div className="backdrop-blur-2xl bg-neutral-950/80 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] rounded-2xl p-6">
          <p className="text-gray-400">Admin and public status view configuration goes here.</p>
        </div>
      </div>
    </div>
  );
}
