import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

export function useIncidents(filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['incidents', filters],
    queryFn: async () => {
      const { data } = await endpoints.incidents.list(filters);
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await endpoints.incidents.get(id);
      return data;
    },
    enabled: !!id,
  });
}

export function useIncidentTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ['incident-timeline', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await endpoints.incidents.timeline(id);
      return data;
    },
    enabled: !!id,
  });
}

export function useHealingActions() {
  return useQuery({
    queryKey: ['healing-actions'],
    queryFn: async () => {
      const { data } = await endpoints.healing.history();
      return data?.items ?? [];
    },
    refetchInterval: 30000,
  });
}

export function useSLO(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['slo', serviceId],
    queryFn: async () => {
      if (!serviceId) return null;
      const { data } = await endpoints.slo.get(serviceId);
      return data;
    },
    enabled: !!serviceId,
    refetchInterval: 60000,
  });
}

export function useAnomalyDetection() {
  return useQuery({
    queryKey: ['anomalies'],
    queryFn: async () => {
      const { data } = await endpoints.anomaly.detect({
        serviceId: 'all',
        metrics: [],
      });
      return data;
    },
    enabled: false,
  });
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data } = await endpoints.services.list();
      return data;
    },
    refetchInterval: 60000,
  });
}

export function useMetrics(serviceId: string, metric: string, from: string, to: string) {
  return useQuery({
    queryKey: ['metrics', serviceId, metric, from, to],
    queryFn: async () => {
      const { data } = await endpoints.metrics.query({
        service: serviceId,
        metric,
        from,
        to,
        step: '60',
      });
      return data;
    },
    enabled: !!serviceId && !!metric,
  });
}
