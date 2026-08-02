import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import BookIcon from '@/components/ui/book-icon';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import RightChevron from '@/components/ui/right-chevron';
import ClockIcon from '@/components/ui/clock-icon';
import HashtagIcon from '@/components/ui/hashtag-icon';

const sampleRunbooks = [
  { id: '1', title: 'Database Connection Pool Exhaustion', tags: ['database', 'postgresql'], lastUpdated: new Date(Date.now() - 86400000 * 2).toISOString(), severity: 'HIGH', steps: 6 },
  { id: '2', title: 'K8s Pod CrashLoopBackOff Recovery', tags: ['kubernetes', 'pods'], lastUpdated: new Date(Date.now() - 86400000 * 5).toISOString(), severity: 'CRITICAL', steps: 8 },
  { id: '3', title: 'High Memory Usage — Node Restart', tags: ['memory', 'nodes'], lastUpdated: new Date(Date.now() - 86400000 * 1).toISOString(), severity: 'STANDARD', steps: 4 },
  { id: '4', title: 'SSL Certificate Expiry Renewal', tags: ['ssl', 'certificates'], lastUpdated: new Date(Date.now() - 86400000 * 10).toISOString(), severity: 'STANDARD', steps: 5 },
  { id: '5', title: 'Kafka Consumer Lag Remediation', tags: ['kafka', 'streaming'], lastUpdated: new Date(Date.now() - 86400000 * 3).toISOString(), severity: 'HIGH', steps: 7 },
];

const severityBadge: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  STANDARD: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

export default function RunbooksPage() {
  const [search, setSearch] = useState('');

  const filtered = sampleRunbooks.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.tags.some(t => t.includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Runbooks</h1>
          <p className="text-sm text-gray-500 mt-1">Operational playbooks and remediation guides</p>
        </div>
        <button className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm">
          <Plus className="w-4 h-4" />
          New Runbook
        </button>
      </div>

      <div className="max-w-sm">
        <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search runbooks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((runbook) => (
          <div
            key={runbook.id}
            className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5 cursor-pointer group hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-xl bg-neutral-800 border border-neutral-700 group-hover:border-blue-500/30 transition-colors">
                  <BookIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-base group-hover:text-blue-300 transition-colors">{runbook.title}</h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <ClockIcon className="w-3 h-3" />
                      {new Date(runbook.lastUpdated).toLocaleDateString()}
                    </div>
                    <span className="text-gray-600">·</span>
                    <span className="text-xs text-gray-500">{runbook.steps} steps</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {runbook.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-gray-400">
                        <HashtagIcon className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${severityBadge[runbook.severity] || severityBadge.STANDARD}`}>
                  {runbook.severity}
                </span>
                <RightChevron className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
