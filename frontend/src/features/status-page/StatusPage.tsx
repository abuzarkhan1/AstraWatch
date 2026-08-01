import React from 'react';

export default function StatusPage() {
  return (
    <div className="bg-black min-h-screen text-white p-6 relative overflow-hidden">
      <div className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)', opacity: 0.25, mixBlendMode: 'screen' }} />
      <div className="space-y-6 relative z-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">Status Page</h1>
        <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-xl">
          <p className="text-gray-400">Admin and public status view configuration goes here.</p>
        </div>
      </div>
    </div>
  );
}
