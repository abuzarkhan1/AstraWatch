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

export interface GitHubPRInfo {
  number: number;
  title: string;
  repo: string;
  url: string;
  status: 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT';
  branch: string;
  aiDiagnosis?: {
    what: string;
    why: string;
    confidence: number;
    impactedFiles: string[];
  };
  codeDiff?: string;
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
  githubPR?: GitHubPRInfo;
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

export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'BILLING_OWNER';
export type UserStatus = 'Active' | 'Deactivated';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  status: UserStatus;
  isActive?: boolean;
  avatarUrl?: string;
  lastActive?: string;
  department?: string;
  createdAt?: string;
}

