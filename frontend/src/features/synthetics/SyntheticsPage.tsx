import React from 'react';

export default function SyntheticsPage() {
  return (
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />
      <div className="space-y-6 relative z-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">Synthetic Monitoring</h1>
        <div className="backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-xl p-4 text-white hover:border-blue-500/40 hover:bg-white/[0.04] transition-all duration-300">
          <p className="text-gray-400">Synthetic tests and uptime checks configuration goes here.</p>
        </div>
      </div>
    </div>
  );
}
