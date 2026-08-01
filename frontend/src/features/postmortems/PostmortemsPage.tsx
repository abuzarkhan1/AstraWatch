import React from 'react';

export default function PostmortemsPage() {
  return (
    <div className="min-h-screen bg-[#060911] text-white p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[rgba(99,102,241,0.08)] blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[rgba(59,130,246,0.08)] blur-[140px] rounded-full pointer-events-none" />
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Postmortems</h1>
        </div>
        <div className="backdrop-blur-xl bg-neutral-950/70 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.5)] rounded-2xl p-6">
          <p className="text-gray-400">Incident postmortems and retrospective analysis go here.</p>
        </div>
      </div>
    </div>
  );
}
