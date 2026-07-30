export interface MetricPoint {
  ts: string;
  value: number;
  labels?: Record<string, string>;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  contributingMetrics: Array<{ metric: string; score: number; contribution: number }>;
  rootCauses: Array<{ metric: string; confidence: number; laggedBy: number }>;
  prediction30min?: Array<{ ts: string; value: number; confidenceInterval?: number[] }>;
}

export interface Incident {
  id: string;
  serviceId: string;
  anomalyId?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  state: 'DETECTED' | 'TRIAGED' | 'INVESTIGATING' | 'HEALING' | 'VALIDATING' | 'RESOLVED' | 'ROLLED_BACK' | 'ESCALATED';
  title?: string;
  description?: string;
  assignedTo?: string;
  rootCause?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface HealingAction {
  id: string;
  incidentId: string;
  actionType: string;
  parameters: Record<string, unknown>;
  riskScore: number;
  status: 'PENDING' | 'APPROVED' | 'EXECUTING' | 'VALIDATING' | 'COMPLETED' | 'ROLLED_BACK' | 'FAILED' | 'DRY_RUN';
  createdAt: string;
  completedAt?: string;
}

export interface ServiceHealth {
  id: string;
  name: string;
  team: string;
  tier: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  healthScore: number;
  sloAttainment?: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'DOWN';
}

export interface ThresholdBreach {
  metric: string;
  serviceId: string;
  value: number;
  threshold: number;
  timestamp: string;
  severity: 'warning' | 'critical';
}

export interface ServiceNode {
  id: string;
  type: 'service';
  position: { x: number; y: number };
  data: { label: string; health: string; tier: string };
}

export interface ServiceEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  style?: { stroke?: string };
}
