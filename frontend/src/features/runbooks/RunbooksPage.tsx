import React from 'react';

export default function RunbooksPage() {
  return (
    <div className="min-h-screen bg-[#060911] text-white p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[rgba(6,182,212,0.12)] blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[rgba(6,182,212,0.12)] blur-[120px] rounded-full pointer-events-none" />
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">Runbooks</h1>
        </div>
        <div className="backdrop-blur-2xl bg-neutral-950/80 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] rounded-2xl p-6">
          <p className="text-gray-400">Operational runbooks and playbooks go here.</p>
        </div>
      </div>
    </div>
  );
}
