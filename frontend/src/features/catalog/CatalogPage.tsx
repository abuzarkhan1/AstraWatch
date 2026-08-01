import React, { useState } from 'react';
import { useServices } from '@/hooks/useApi';
import { Box, Search, Tag, ExternalLink, Circle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

const tierColors: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  STANDARD: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  LOW: 'border-neutral-600 bg-neutral-800 text-gray-400',
};

const healthColors: Record<string, string> = {
  HEALTHY: 'text-green-500',
  DEGRADED: 'text-yellow-500',
  CRITICAL: 'text-red-500',
  DOWN: 'text-gray-500',
};

export default function CatalogPage() {
  const [search, setSearch] = useState('');

  const { data: services = [], isLoading } = useServices();

  const filtered = services.filter((svc: any) =>
    !search ||
    svc.name?.toLowerCase().includes(search.toLowerCase()) ||
    svc.tier?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Service Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">Registered services and their metadata</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">
            {services.length} services
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
        />
      </div>

      {/* Service Grid */}
      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading services...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Box className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No services found</p>
        </div>
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
                  <p className="text-xs text-gray-500 mt-0.5">{svc.id?.substring(0, 16)}...</p>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${healthColors[svc.status] || 'text-gray-400'}`}>
                  <Circle className="w-2 h-2 fill-current" />
                  {svc.status || 'UNKNOWN'}
                </div>
              </div>

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
              </div>

              {svc.tags && svc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {svc.tags.slice(0, 3).map((tag: string) => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-gray-400">
                      <Tag className="w-2.5 h-2.5" />
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
