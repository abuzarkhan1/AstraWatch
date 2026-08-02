import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';


export function useIncidents(filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['incidents', filters],
    queryFn: async () => {
      try {
        const { data } = await endpoints.incidents.list(filters);
        if (data?.items && data.items.length > 0) return data;
      } catch (err) {
        console.warn('API fallback to mock incidents');
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
        if (data) return data;
      } catch (err) {
        console.warn('API fallback to mock incident');
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
        if (data && Array.isArray(data) && data.length > 0) return data;
      } catch (err) {
        console.warn('API fallback to mock timeline');
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
        if (data?.items && data.items.length > 0) return data.items;
      } catch (err) {
        console.warn('API fallback to mock healing actions');
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
        if (data) return data;
      } catch (err) {
        console.warn('API fallback to mock SLO');
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
        console.warn('API fallback to mock anomaly');
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
        console.warn('API fallback to mock services');
      }
      return [];
    },
    refetchInterval: 60000,
  });
}

export function useMetrics(serviceId: string, metric: string, from: string, to: string) {
  return useQuery({
    queryKey: ['metrics', serviceId, metric, from, to],
    queryFn: async () => {
      try {
        const { data } = await endpoints.metrics.query({
          service: serviceId,
          metric,
          from,
          to,
          step: '60',
        });
        if (data) return data;
      } catch (err) {
        console.warn('API fallback to mock metrics');
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
