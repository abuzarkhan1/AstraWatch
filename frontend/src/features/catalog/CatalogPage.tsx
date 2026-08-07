import React, { useState } from 'react';
import { useServices, useMetrics } from '@/hooks/useApi';
import { Box, Circle } from 'lucide-react';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import HashtagIcon from '@/components/ui/hashtag-icon';
import { PageHeader, MetaChip } from '@/components/ui/page-header';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import CpuIcon from '@/components/ui/cpu-icon';
import PlugConnectedIcon from '@/components/ui/plug-connected-icon';
import GitHubIcon from '@/components/ui/github-icon';
import UsersIcon from '@/components/ui/users-icon';
import { useNavigate } from 'react-router-dom';

const tierColors: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  MEDIUM: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  STANDARD: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  LOW: 'border-neutral-600 bg-neutral-800 text-gray-400',
};

const healthColors: Record<string, string> = {
  HEALTHY: 'text-green-500',
  DEGRADED: 'text-yellow-500',
  CRITICAL: 'text-red-500',
  DOWN: 'text-gray-500',
};

// Minimal inline sparkline (SVG) — no chart lib dependency for a card strip.
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) {
    return <div className="h-6 text-[10px] text-gray-600 flex items-center">no data in window</div>;
  }
  const w = 120;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Live error-rate sparkline for a service (collector /v1/query, keyed by the
// catalog slug — audit: passing the DB UUID here returned empty every time).
function ServiceSparkline({ service }: { service: any }) {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const metricKey = service.serviceKey ?? service.name ?? service.id;
  const { data } = useMetrics(metricKey, 'error_rate', from, to);
  const series = Array.isArray(data?.series) ? data.series : [];
  const points = series.map((p: any) => (typeof p.value === 'number' ? p.value : 0));
  const last = points.length > 0 ? points[points.length - 1] : null;
  const color = last == null ? '#6b7280' : last >= 10 ? '#ef4444' : last >= 2 ? '#eab308' : '#22c55e';
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Error rate · 1h</span>
        {last != null && (
          <span className="font-mono text-xs" style={{ color }}>
            {last.toFixed(2)}%
          </span>
        )}
      </div>
      <Sparkline points={points} color={color} />
    </div>
  );
}

export default function CatalogPage() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data: services = [], isLoading } = useServices();

  const filtered = services.filter((svc: any) =>
    !search ||
    svc.name?.toLowerCase().includes(search.toLowerCase()) ||
    svc.tier?.toLowerCase().includes(search.toLowerCase()) ||
    (svc.owner ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (svc.language ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Catalog"
        subtitle="Registered services, owners and live health — click any card to see it in the topology."
        meta={<MetaChip>{services.length} services</MetaChip>}
        actions={
          <button
            onClick={() => navigate('/topology')}
            className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
          >
            <PlugConnectedIcon className="w-4 h-4" />
            View Topology
          </button>
        }
      />

      {/* Search */}
      <div className="max-w-sm relative">
        <MagnifierIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search services, owners, languages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
        />
      </div>

      {/* Service Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
        </div>
      ) : filtered.length === 0 ? (
        search ? (
          <div className="text-center py-16 text-gray-500">
            <Box className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No services match “{search}”</p>
          </div>
        ) : (
          <EmptyState
            icon={<CpuIcon className="w-7 h-7" />}
            title="No services registered yet"
            description="Services appear here automatically once an agent starts reporting telemetry to the collector. Point an agent at the collector or send OTLP data to get started."
            steps={[
              { title: 'Connect an agent', description: 'Deploy the collector agent or an OTel exporter to start reporting metrics, logs and traces.', href: '/synthetics', cta: 'Open Synthetics' },
              { title: 'Explore the topology', description: 'Once services report, your dependency graph renders here.', href: '/topology', cta: 'Open Topology' },
            ]}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((svc: any) => (
            <div
              key={svc.id}
              className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4 hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white text-base">{svc.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{svc.cluster ?? '—'} / {svc.namespace ?? 'default'}</p>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${healthColors[svc.status] || 'text-gray-400'}`}>
                  <Circle className="w-2 h-2 fill-current" />
                  {svc.status || 'UNKNOWN'}
                </div>
              </div>

              {/* Live telemetry strip (real collector data) */}
              <ServiceSparkline service={svc} />

              <div className="border-t border-neutral-700 pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Tier</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tierColors[svc.tier] || tierColors.LOW}`}>
                    {svc.tier || 'STANDARD'}
                  </span>
                </div>
                {svc.healthScore !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Health Score</span>
                    <span className={`font-mono text-sm ${svc.healthScore >= 90 ? 'text-green-500' : svc.healthScore >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                      {svc.healthScore}%
                    </span>
                  </div>
                )}
                {svc.language && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Language</span>
                    <span className="text-gray-300 text-xs font-mono">{svc.language}</span>
                  </div>
                )}
                {svc.owner && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <UsersIcon className="w-3.5 h-3.5" /> Owner
                    </span>
                    <span className="text-gray-300 text-xs">{svc.owner}</span>
                  </div>
                )}
                {svc.repository && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <GitHubIcon className="w-3.5 h-3.5" /> Repo
                    </span>
                    <span className="text-gray-300 text-xs font-mono">{svc.repository}</span>
                  </div>
                )}
                {svc.errorRate != null && svc.latencyMs != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Latency (30m)</span>
                    <span className="text-gray-300 text-xs font-mono">{svc.latencyMs}ms</span>
                  </div>
                )}
              </div>

              {svc.tags && svc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {svc.tags.slice(0, 3).map((tag: string) => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-gray-400">
                      <HashtagIcon className="w-2.5 h-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
