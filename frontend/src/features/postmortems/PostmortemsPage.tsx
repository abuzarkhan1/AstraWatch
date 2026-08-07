import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import FileDescriptionIcon from '@/components/ui/file-description-icon';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import ClockIcon from '@/components/ui/clock-icon';
import RightChevron from '@/components/ui/right-chevron';
import InfoCircleIcon from '@/components/ui/info-circle-icon';
import { endpoints } from '@/lib/api';

const severityBadge: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  STANDARD: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

interface PostmortemView {
  id: string;
  incidentId: string;
  title: string;
  severity: string;
  date: string;
  author: string;
  hasContent: boolean;
  openActionItems: number;
}

export default function PostmortemsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const navigate = useNavigate();

  // Audit fix: this page used to fabricate a postmortem row for EVERY incident
  // — fake "Postmortem — {incident}" titles, a fake "Incident system" author,
  // a made-up PUBLISHED/DRAFT status, and `createdAt ?? new Date()`. The backend
  // has a real postmortems table; /api/v1/postmortems now returns only records
  // that actually exist, joined with the real incident and author. Empty state
  // is shown honestly when nothing has been written yet.
  const { data: postmortems, isLoading, isError } = useQuery({
    queryKey: ['postmortems'],
    queryFn: async () => {
      const { data } = await endpoints.postmortems.list();
      const unwrapped = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      return (unwrapped ?? []) as any[];
    },
  });

  const rows: PostmortemView[] = (postmortems ?? []).map((pm: any) => ({
    id: pm.id,
    incidentId: pm.incidentId,
    title: pm.title ?? 'Untitled postmortem',
    severity: pm.severity ?? 'STANDARD',
    date: pm.createdAt,
    author: pm.author ?? '—',
    hasContent: !!(pm.summary || pm.lessonsLearned),
    openActionItems: Number(pm.openActionItems ?? 0),
  }));

  const filtered = rows.filter(
    (p) =>
      (!search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.author.toLowerCase().includes(search.toLowerCase())) &&
      (statusFilter === 'ALL' ||
        (statusFilter === 'OPEN_ITEMS' && p.openActionItems > 0) ||
        (statusFilter === 'WRITTEN' && p.hasContent) ||
        (statusFilter === 'DRAFT' && !p.hasContent))
  );

  const withContent = rows.filter((p) => p.hasContent).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Postmortems</h1>
          <p className="text-sm text-gray-500 mt-1">Incident retrospectives and root cause analyses</p>
        </div>
        <button
          onClick={() => navigate('/incidents')}
          className="flex items-center gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2.5 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer text-sm"
        >
          <Plus className="w-4 h-4" />
          New Postmortem
        </button>
      </div>

      {/* Stats (honest: real records only) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Reports', value: rows.length, color: 'text-blue-400' },
          { label: 'With Writeups', value: withContent, color: 'text-green-400' },
          { label: 'Empty Drafts', value: rows.length - withContent, color: 'text-yellow-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 relative z-10">
        <div className="relative max-w-sm flex-1">
          <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search postmortems..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500/50 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>
        {/* Status chips (SaaS list filter): ALL / With writeups / Open action items */}
        <div className="flex gap-2">
          {[
            { key: 'ALL', label: 'All' },
            { key: 'WRITTEN', label: 'With writeups' },
            { key: 'DRAFT', label: 'Drafts' },
            { key: 'OPEN_ITEMS', label: 'Open items' },
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={() => setStatusFilter(chip.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === chip.key
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                  : 'border-neutral-700 bg-neutral-800 text-gray-400 hover:border-neutral-600 hover:text-gray-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading postmortems...</div>
      ) : isError ? (
        <div className="text-center text-red-400 py-12">Failed to load postmortems</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileDescriptionIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>
            {search
              ? 'No postmortems match your search'
              : 'No postmortems yet — write one from an incident detail page'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 relative z-10">
          {filtered.map((pm) => (
            <div
              key={pm.id}
              onClick={() => navigate(`/incidents/${pm.incidentId}`)}
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
                        {pm.date ? new Date(pm.date).toLocaleDateString() : 'No recorded date'}
                      </div>
                      <span className="text-gray-600">·</span>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <InfoCircleIcon className="w-3 h-3" />
                        Incident {pm.incidentId ? pm.incidentId.slice(0, 8) : '—'}
                      </div>
                      <span className="text-gray-600">·</span>
                      <span className="text-xs text-gray-500">{pm.author}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {pm.openActionItems > 0 && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                      {pm.openActionItems} open item{pm.openActionItems > 1 ? 's' : ''}
                    </span>
                  )}
                  {pm.hasContent && (
                    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-400">
                      WRITTEN
                    </span>
                  )}
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${severityBadge[pm.severity] || severityBadge.STANDARD}`}>{pm.severity}</span>
                  <RightChevron className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors ml-1" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
