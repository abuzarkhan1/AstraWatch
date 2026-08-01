import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';

const mockServices = [
  { id: 'a1b2c3d4-0001-4000-8000-000000000001', name: 'Payment API', status: 'HEALTHY', healthScore: 98, tier: 'CRITICAL', cluster: 'us-east-prod-01', namespace: 'payments' },
  { id: 'a1b2c3d4-0002-4000-8000-000000000002', name: 'User Service', status: 'DEGRADED', healthScore: 74, tier: 'HIGH', cluster: 'us-east-prod-01', namespace: 'identity' },
  { id: 'a1b2c3d4-0003-4000-8000-000000000003', name: 'Notification Service', status: 'HEALTHY', healthScore: 99, tier: 'STANDARD', cluster: 'eu-west-prod-02', namespace: 'notifications' },
  { id: 'a1b2c3d4-0004-4000-8000-000000000004', name: 'Auth Gateway', status: 'HEALTHY', healthScore: 95, tier: 'CRITICAL', cluster: 'us-east-prod-01', namespace: 'identity' },
  { id: 'a1b2c3d4-0005-4000-8000-000000000005', name: 'Inventory Engine', status: 'HEALTHY', healthScore: 91, tier: 'HIGH', cluster: 'us-east-prod-01', namespace: 'logistics' },
  { id: 'a1b2c3d4-0006-4000-8000-000000000006', name: 'Analytics Pipeline', status: 'DOWN', healthScore: 42, tier: 'STANDARD', cluster: 'us-east-prod-01', namespace: 'data' },
];

const mockIncidents = [
  {
    id: '22222222-2222-2222-2222-222222222201',
    serviceId: 'Payment API',
    severity: 'CRITICAL',
    state: 'HEALING',
    title: 'High Latency & eBPF Socket Buffer Overflow in Payment API',
    description: 'eBPF probe detected 99th percentile response time spiked to 3,450ms. TCP retransmissions increased by 420%.',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    githubPR: {
      number: 42,
      title: 'astrawatch/fix-incident-123',
      repo: 'astrawatch/payment-service',
      url: 'https://github.com/astrawatch/payment-service/pull/42',
      status: 'OPEN',
      branch: 'astrawatch/fix-incident-123',
      aiDiagnosis: {
        what: 'eBPF socket buffer overflow caused TCP retransmission spikes during high-throughput ingress spikes.',
        why: 'Socket read buffer pool size (64KB) was undersized for peak 10Gbps ingress burst traffic, forcing TCP window scaling drops and kernel queue exhaustion.',
        confidence: 0.94,
        impactedFiles: [
          'services/payment-service/internal/socket/buffer.go',
          'services/payment-service/config/sysctl.conf',
        ],
      },
      codeDiff: `--- a/services/payment-service/internal/socket/buffer.go
+++ b/services/payment-service/internal/socket/buffer.go
@@ -14,7 +14,7 @@ const (
-   DefaultMaxSocketBuffer = 65536 // 64KB
+   DefaultMaxSocketBuffer = 4194304 // 4MB dynamic pool buffer
    TcpWindowScaleFactor  = 7
 )

 func ConfigureRingBuffer(conn *net.TCPConn) error {
-   return conn.SetReadBuffer(DefaultMaxSocketBuffer)
+   if err := conn.SetReadBuffer(DefaultMaxSocketBuffer); err != nil {
+       log.Warnf("Failed to expand socket buffer: %v", err)
+       return err
+   }
+   return nil
 }`,
    },
  },
  {
    id: '22222222-2222-2222-2222-222222222202',
    serviceId: 'User Service',
    severity: 'HIGH',
    state: 'INVESTIGATING',
    title: 'DB Connection Pool Exhaustion in User Service',
    description: 'Active connections saturated PostgreSQL pool (100/100). HTTP 500 error rate exceeded 4.2%.',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    githubPR: {
      number: 88,
      title: 'astrawatch/fix-db-pool-exhaustion',
      repo: 'astrawatch/user-service',
      url: 'https://github.com/astrawatch/user-service/pull/88',
      status: 'OPEN',
      branch: 'astrawatch/fix-db-pool-exhaustion',
      aiDiagnosis: {
        what: 'PostgreSQL connection leaks in unclosed gRPC transaction contexts.',
        why: 'Defer statement was missing after acquireConnection() call in user authentication handler.',
        confidence: 0.91,
        impactedFiles: [
          'services/user-service/internal/db/pool.go',
        ],
      },
      codeDiff: `--- a/services/user-service/internal/db/pool.go
+++ b/services/user-service/internal/db/pool.go
@@ -32,6 +32,7 @@ func GetUserByID(ctx context.Context, id string) (*User, error) {
    conn, err := pool.Acquire(ctx)
    if err != nil { return nil, err }
+   defer conn.Release()

    return conn.QueryUser(id)
 }`,
    },
  },
  {
    id: '22222222-2222-2222-2222-222222222203',
    serviceId: 'Notification Service',
    severity: 'MEDIUM',
    state: 'RESOLVED',
    title: 'RabbitMQ Queue Backlog in Notification Worker',
    description: 'Queue depth reached 45,000 items. Automated scale-out CRD restored latency to 12ms.',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222204',
    serviceId: 'Auth Gateway',
    severity: 'LOW',
    state: 'DETECTED',
    title: 'Minor Memory Leak in Auth Gateway Pods',
    description: 'Isolation Forest model detected 1.2% memory drift per hour across 4 replicas.',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
];

const mockHealingActions = [
  {
    id: '33333333-3333-3333-3333-333333333301',
    incidentId: '22222222-2222-2222-2222-222222222201',
    actionType: 'POD_RESTART',
    serviceId: 'Payment API',
    riskScore: 25,
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333302',
    incidentId: '22222222-2222-2222-2222-222222222202',
    actionType: 'SCALE_DEPLOYMENT',
    serviceId: 'User Service',
    riskScore: 35,
    status: 'PENDING',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333303',
    incidentId: '22222222-2222-2222-2222-222222222203',
    actionType: 'FLUSH_MEMCACHED',
    serviceId: 'Notification Service',
    riskScore: 10,
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 115 * 60 * 1000).toISOString(),
  },
];

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
      return { items: mockIncidents, total: mockIncidents.length };
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
      return mockIncidents.find(i => i.id === id) || mockIncidents[0];
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
      return [
        { id: '1', timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), type: 'ANOMALY_DETECTED', description: 'Isolation Forest score exceeded 0.89 threshold' },
        { id: '2', timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(), type: 'INCIDENT_CREATED', description: 'Auto-created incident ticket and routed to SRE on-call' },
        { id: '3', timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(), type: 'HEALING_EXECUTION', description: 'Autonomous K8s pod restart executed via Operator CRD' },
      ];
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
      return mockHealingActions;
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
      return {
        serviceId,
        target: 99.9,
        current: 99.72,
        remaining: 0.18,
        burnRate: 1.4,
      };
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
      return { isAnomaly: true, score: 0.88, message: 'Isolation Forest detected metric drift' };
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
      return mockServices;
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
        datapoints: Array.from({ length: 20 }, (_, i) => [
          Date.now() - (20 - i) * 60 * 1000,
          Math.floor(Math.random() * 40) + 10,
        ]),
      };
    },
    enabled: !!serviceId && !!metric,
  });
}
