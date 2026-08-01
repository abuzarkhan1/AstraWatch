import React from 'react';

export default function StatusPage() {
  return (
    <div className="relative min-h-screen bg-[#060911] p-6">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[rgba(99,102,241,0.08)] blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[rgba(59,130,246,0.08)] blur-[140px] pointer-events-none" />
      <div className="space-y-6 relative z-10">
        <h1 className="text-2xl bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent font-bold">Status Page</h1>
        <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6">
          <p className="text-gray-400">Admin and public status view configuration goes here.</p>
        </div>
      </div>
    </div>
  );
}
