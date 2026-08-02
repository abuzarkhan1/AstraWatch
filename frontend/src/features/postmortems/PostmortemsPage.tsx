import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import FileDescriptionIcon from '@/components/ui/file-description-icon';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import ClockIcon from '@/components/ui/clock-icon';
import RightChevron from '@/components/ui/right-chevron';
import InfoCircleIcon from '@/components/ui/info-circle-icon';

const samplePostmortems: any[] = [];

const severityBadge: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  STANDARD: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

const statusBadge: Record<string, string> = {
  Published: 'border-green-500/30 bg-green-500/10 text-green-400',
  Draft: 'border-neutral-600 bg-neutral-800 text-gray-400',
};

export default function PostmortemsPage() {
  const [search, setSearch] = useState('');

  const filtered = samplePostmortems.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.author.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Postmortems</h1>
          <p className="text-sm text-gray-500 mt-1">Incident retrospectives and root cause analyses</p>
        </div>
        <button className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm">
          <Plus className="w-4 h-4" />
          New Postmortem
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Reports', value: samplePostmortems.length, color: 'text-blue-400' },
          { label: 'Published', value: samplePostmortems.filter(p => p.status === 'Published').length, color: 'text-green-400' },
          { label: 'In Draft', value: samplePostmortems.filter(p => p.status === 'Draft').length, color: 'text-yellow-400' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="relative z-10 max-w-sm">
        <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search postmortems..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500/50 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
        />
      </div>

      <div className="space-y-3 relative z-10">
        {filtered.map((pm) => (
          <div
            key={pm.id}
            className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5 cursor-pointer group hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-xl bg-neutral-800 border border-neutral-700 group-hover:border-blue-500/30 transition-colors shrink-0">
                  <FileDescriptionIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors">{pm.title}</h3>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <ClockIcon className="w-3 h-3" />
                      {new Date(pm.date).toLocaleDateString()}
                    </div>
                    <span className="text-gray-600">·</span>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <InfoCircleIcon className="w-3 h-3" />
                      Duration: {pm.duration}
                    </div>
                    <span className="text-gray-600">·</span>
                    <span className="text-xs text-gray-500">{pm.author}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${severityBadge[pm.severity] || severityBadge.STANDARD}`}>{pm.severity}</span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge[pm.status]}`}>{pm.status}</span>
                <RightChevron className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors ml-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
