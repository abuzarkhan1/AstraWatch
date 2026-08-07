import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';


export function useIncidents(filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['incidents', filters],
    queryFn: async () => {
      try {
        const { data } = await endpoints.incidents.list(filters);
        // Every backend endpoint wraps in an ApiResponse envelope
        // {success, data, meta} — unwrap before reading .items (audit: the wired
        // pages silently rendered empty because they read the envelope top level).
        const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
        if (Array.isArray(items) && items.length > 0) return { items, total: items.length };
      } catch (err) {
        // Honest empty state — no fabricated mock data (audit: this log claimed
        // a mock fallback that no longer exists).
        console.warn('Failed to load incidents; showing empty state');
      }
      return { items: [], total: 0 };
    },
    refetchInterval: 30000,
  });
}

export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const { data } = await endpoints.incidents.get(id);
        return data?.data ?? data ?? null;
      } catch (err) {
        console.warn('Failed to load incident; showing empty state');
      }
      return null;
    },
    enabled: !!id,
  });
}

export function useIncidentTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ['incident-timeline', id],
    queryFn: async () => {
      if (!id) return [];
      try {
        const { data } = await endpoints.incidents.timeline(id);
        const items = Array.isArray(data) ? data : (data?.data ?? []);
        if (Array.isArray(items) && items.length > 0) return items;
      } catch (err) {
        console.warn('Failed to load timeline; showing empty state');
      }
      return [];
    },
    enabled: !!id,
  });
}

export function useHealingActions() {
  return useQuery({
    queryKey: ['healing-actions'],
    queryFn: async () => {
      try {
        const { data } = await endpoints.healing.history();
        const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
        if (Array.isArray(items) && items.length > 0) return items;
      } catch (err) {
        console.warn('Failed to load healing actions; showing empty state');
      }
      return [];
    },
    refetchInterval: 30000,
  });
}

export function useSLO(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['slo', serviceId],
    queryFn: async () => {
      if (!serviceId) return null;
      try {
        const { data } = await endpoints.slo.get(serviceId);
        return data?.data ?? data ?? null;
      } catch (err) {
        console.warn('Failed to load SLO; showing empty state');
      }
      return null;
    },
    enabled: !!serviceId,
    refetchInterval: 60000,
  });
}

export function useAnomalyDetection() {
  return useQuery({
    queryKey: ['anomalies'],
    queryFn: async () => {
      try {
        const { data } = await endpoints.anomaly.detect({
          serviceId: 'all',
          metrics: [],
        });
        if (data) return data;
      } catch (err) {
        console.warn('Failed to load anomaly data; showing empty state');
      }
      return null;
    },
    enabled: false,
  });
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      try {
        const { data } = await endpoints.services.list();
        const actualData = data?.data ?? data;
        if (Array.isArray(actualData)) return actualData;
        if (actualData?.services && Array.isArray(actualData.services)) return actualData.services;
      } catch (err) {
        console.warn('Failed to load services; showing empty state');
      }
      return [];
    },
    refetchInterval: 60000,
  });
}

export function useMetrics(serviceId: string, metric: string, from: string, to: string, refreshKey?: number) {
  return useQuery({
    queryKey: ['metrics', serviceId, metric, from, to, refreshKey],
    queryFn: async () => {
      try {
        const { data } = await endpoints.metrics.query({
          service: serviceId,
          metric,
          from,
          to,
          // Go time.ParseDuration format — the collector rejects bare numbers
          // (audit: this was '60' → 'invalid step duration' 400 on EVERY metric
          // fetch, so every dashboard chart / catalog sparkline silently fell
          // into the empty state via the catch below).
          step: '60s',
        });
        return data?.data ?? data ?? null;
      } catch (err) {
        console.warn('Failed to load metrics; showing empty state');
      }
      return {
        metric,
        service: serviceId,
        datapoints: [],
      };
    },
    enabled: !!serviceId && !!metric,
  });
}
