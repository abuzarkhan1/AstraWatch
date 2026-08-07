import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (method && ['post', 'put', 'delete', 'patch'].includes(method)) {
    const tokenToUse = csrfToken || getCsrfTokenFromCookie();
    if (tokenToUse) {
      config.headers['X-CSRF-Token'] = tokenToUse;
    }
  }

  // Extract accessToken from cookies and set Authorization header
  if (typeof document !== 'undefined') {
    const tokenMatch = document.cookie.match(/(?:^|; )accessToken=([^;]*)/);
    if (tokenMatch) {
      config.headers['Authorization'] = `Bearer ${decodeURIComponent(tokenMatch[1])}`;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const headerCsrf = response.headers['x-csrf-token'];
    if (headerCsrf) {
      csrfToken = headerCsrf;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute =
      originalRequest?.url?.includes('/api/v1/auth/login') ||
      originalRequest?.url?.includes('/api/v1/auth/register') ||
      originalRequest?.url?.includes('/api/v1/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;

      try {
        await axios.post(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true }
        );
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

export const endpoints = {
  incidents: {
    list: (params?: Record<string, string>) => api.get('/api/v1/incidents', { params }),
    get: (id: string) => api.get(`/api/v1/incidents/${id}`),
    create: (data: unknown) => api.post('/api/v1/incidents', data),
    assign: (id: string, userId: string) => api.post(`/api/v1/incidents/${id}/assign`, { userId }),
    comment: (id: string, text: string) => api.post(`/api/v1/incidents/${id}/comment`, { text }),
    resolve: (id: string, resolutionNote: string) =>
      api.post(`/api/v1/incidents/${id}/resolve`, { resolutionNote }),
    escalate: (id: string, escalateTo: string, reason: string) =>
      api.post(`/api/v1/incidents/${id}/escalate`, { escalateTo, reason }),
    timeline: (id: string) => api.get(`/api/v1/incidents/${id}/timeline`),
  },
  healing: {
    trigger: (data: unknown) => api.post('/api/v1/healing/trigger', data),
    approve: (actionId: string, approvedBy: string) =>
      api.post(`/api/v1/healing/approve/${actionId}`, { approvedBy }),
    rollback: (actionId: string, reason: string) =>
      api.post(`/api/v1/healing/rollback/${actionId}`, { reason }),
    history: (serviceId?: string) =>
      api.get('/api/v1/healing/history', { params: { serviceId } }),
    validation: (actionId: string) =>
      api.get(`/api/v1/healing/${actionId}/validation`),
  },
  anomaly: {
    detect: (data: unknown) => api.post('/v1/anomaly/detect', data),
    rootCause: (data: unknown) => api.post('/v1/anomaly/root-cause', data),
    feedback: (anomalyId: string, data: unknown) =>
      api.post(`/v1/anomaly/feedback/${anomalyId}`, data),
  },
  metrics: {
    query: (params: Record<string, string>) => api.get('/v1/query', { params }),
  },
  logs: {
    query: (params: Record<string, string>) => api.get('/v1/query/logs', { params }),
  },
  traces: {
    query: (params: Record<string, string>) => api.get('/v1/query/traces', { params }),
  },
  auth: {
    login: (data: unknown) => api.post('/api/v1/auth/login', data),
    register: (data: unknown) => api.post('/api/v1/auth/register', data),
    refresh: () => api.post('/api/v1/auth/refresh'),
    logout: () => api.post('/api/v1/auth/logout'),
    verifyEmail: (data: unknown) => api.post('/api/v1/auth/verify-email', data),
    resendVerification: (data: { email: string }) => api.post('/api/v1/auth/resend-verification', data),
    me: () => api.get('/api/v1/auth/me'),
    forgotPassword: (data: { email: string }) => api.post('/api/v1/auth/forgot-password', data),
    oauth2Google: (data: { code?: string; token?: string; credential?: string; idToken?: string; accessToken?: string; email?: string; name?: string; avatarUrl?: string }) =>
      api.post('/api/v1/auth/oauth2/google', data),
    oauth2Github: (data: { code?: string; token?: string; email?: string; name?: string; avatarUrl?: string }) =>
      api.post('/api/v1/auth/oauth2/github', data),
  },
  github: {
    // Audit fix: these previously called /api/v1/admin/github-integration* which
    // the backend never served (it serves /api/v1/integrations/github/*), so
    // every call 404'd and the modal faked success on error. Routes now match
    // the real controller: GET /repos, POST /connect, POST /test.
    getIntegration: () => api.get('/api/v1/integrations/github/repos'),
    updateIntegration: (data: { repoOwner: string; repoName: string; accessToken?: string }) =>
      api.post('/api/v1/integrations/github/connect', data),
    testConnection: (data: { repoOwner: string; repoName: string; accessToken?: string }) =>
      api.post('/api/v1/integrations/github/test', data),
  },
  services: {
    list: () => api.get('/api/v1/catalog/services'),
    getDependencies: (id: string) =>
      api.get(`/api/v1/catalog/services/${id}/dependencies`),
  },
  slo: {
    get: (serviceId: string) => api.get(`/api/v1/slo/${serviceId}`),
    create: (data: unknown) => api.post('/api/v1/slo', data),
  },
  health: {
    collector: () => api.get('/v1/health'),
    orchestrator: () => api.get('/api/v1/health'),
  },
  billing: {
    // Audit fix: the checkout payload was { planName, price } but the backend
    // required { price_id, customer_id }. Now the payment-service resolves the
    // Stripe Price from planName/isYearly and derives the customer from the JWT
    // subject, so this payload matches the real contract.
    createCheckoutSession: (data: { planName: string; isYearly: boolean; price?: number }) => api.post('/api/v1/billing/checkout-session', data),
    createPortalSession: () => api.post('/api/v1/billing/portal-session'),
    subscriptions: () => api.get('/api/v1/billing/subscriptions'),
    // Usage metering (audit P4.15): today's ingested metrics/logs/traces for
    // the authenticated tenant, served by the collector.
    usage: () => api.get('/v1/usage/current'),
    // Usage over time (P4.15 follow-up): last N days per tenant for the
    // usage-over-time chart.
    usageHistory: (days = 30) => api.get('/v1/usage/history', { params: { days } }),
    // Invoice history from Stripe (hosted by payment-service).
    invoices: () => api.get('/api/v1/billing/invoices'),
  },
  runbooks: {
    list: (params?: Record<string, string>) => api.get('/api/v1/runbooks', { params }),
    get: (id: string) => api.get(`/api/v1/runbooks/${id}`),
    create: (data: unknown) => api.post('/api/v1/runbooks', data),
    update: (id: string, data: unknown) => api.put(`/api/v1/runbooks/${id}`, data),
    versions: (id: string) => api.get(`/api/v1/runbooks/${id}/versions`),
    execute: (id: string, data?: unknown) => api.post(`/api/v1/runbooks/${id}/execute`, data ?? {}),
    executions: (id: string) => api.get(`/api/v1/runbooks/${id}/executions`),
  },
  postmortems: {
    list: () => api.get('/api/v1/postmortems'),
    get: (incidentId: string) => api.get(`/api/v1/incidents/${incidentId}/postmortem`),
    create: (incidentId: string, data: unknown) => api.post(`/api/v1/incidents/${incidentId}/postmortem`, data),
    update: (incidentId: string, data: unknown) => api.put(`/api/v1/incidents/${incidentId}/postmortem`, data),
    export: (incidentId: string, data?: unknown) => api.post(`/api/v1/incidents/${incidentId}/postmortem/export`, data ?? {}),
    actionItems: (incidentId: string) => api.get(`/api/v1/incidents/${incidentId}/postmortem/action-items`),
    createActionItem: (incidentId: string, data: unknown) => api.post(`/api/v1/incidents/${incidentId}/postmortem/action-items`, data),
  },
  alerting: {
    listRules: () => api.get('/api/v1/notifications/rules'),
    createRule: (data: unknown) => api.post('/api/v1/notifications/rules', data),
    toggleRule: (id: string, enabled: boolean) => api.put(`/api/v1/notifications/rules/${id}/toggle`, { enabled }),
    testRule: (id: string, data?: unknown) => api.post(`/api/v1/notifications/rules/${id}/test`, data ?? {}),
    listChannels: () => api.get('/api/v1/notifications/channels'),
    createChannel: (data: unknown) => api.post('/api/v1/notifications/channels', data),
    updateChannel: (id: string, config: string) => api.put(`/api/v1/notifications/channels/${id}`, { config }),
    deleteChannel: (id: string) => api.delete(`/api/v1/notifications/channels/${id}`),
    testChannel: (id: string) => api.post(`/api/v1/notifications/channels/${id}/test`),
    listMaintenanceWindows: () => api.get('/api/v1/notifications/maintenance-windows'),
    createMaintenanceWindow: (data: unknown) => api.post('/api/v1/notifications/maintenance-windows', data),
    deleteMaintenanceWindow: (id: string) => api.delete(`/api/v1/notifications/maintenance-windows/${id}`),
    history: () => api.get('/api/v1/notifications/history'),
  },
  oncall: {
    listSchedules: () => api.get('/api/v1/oncall/schedules'),
    createSchedule: (data: unknown) => api.post('/api/v1/oncall/schedules', data),
    updateSchedule: (id: string, data: unknown) => api.put(`/api/v1/oncall/schedules/${id}`, data),
    deleteSchedule: (id: string) => api.delete(`/api/v1/oncall/schedules/${id}`),
    whoIsOnCall: () => api.get('/api/v1/oncall/who-is-on-call'),
    scheduleEntries: (id: string) => api.get(`/api/v1/oncall/schedules/${id}/entries`),
  },
  escalation: {
    listPolicies: () => api.get('/api/v1/escalation/policies'),
    createPolicy: (data: unknown) => api.post('/api/v1/escalation/policies', data),
    updatePolicy: (id: string, data: unknown) => api.put(`/api/v1/escalation/policies/${id}`, data),
    deletePolicy: (id: string) => api.delete(`/api/v1/escalation/policies/${id}`),
    resolveStep: (id: string, level: number) => api.get(`/api/v1/escalation/policies/${id}/resolve`, { params: { level } }),
  },
  statusPage: {
    get: () => api.get('/api/v1/status-page'),
    createComponent: (data: unknown) => api.post('/api/v1/status-page/components', data),
    updateComponentStatus: (id: string, status: string) => api.put(`/api/v1/status-page/components/${id}/status`, { status }),
    subscribers: () => api.get('/api/v1/status-page/subscribers'),
    createSubscriber: (data: unknown) => api.post('/api/v1/status-page/subscribers', data),
    deleteSubscriber: (id: string) => api.delete(`/api/v1/status-page/subscribers/${id}`),
  },
  entitlements: {
    get: () => api.get('/api/v1/entitlements'),
  },
  users: {
    list: () => api.get('/api/v1/users'),
    updateRole: (userId: string, role: string) => api.put(`/api/v1/users/${userId}/role`, { role }),
    toggleStatus: (userId: string) => api.post(`/api/v1/users/${userId}/toggle-status`),
  },
  synthetics: {
    list: () => api.get('/api/v1/synthetics/checks'),
    create: (data: { name: string; url: string; type: string; intervalSeconds?: number }) =>
      api.post('/api/v1/synthetics/checks', data),
    toggle: (id: string) => api.post(`/api/v1/synthetics/checks/${id}/toggle`),
    remove: (id: string) => api.delete(`/api/v1/synthetics/checks/${id}`),
    // Probe run history (honest: empty until a probe runner records results).
    results: (id: string) => api.get(`/api/v1/synthetics/checks/${id}/results`),
  },
  mfa: {
    setup: () => api.post('/api/v1/auth/mfa/setup'),
    verify: (code: string) => api.post('/api/v1/auth/mfa/verify', { code }),
    disable: () => api.post('/api/v1/auth/mfa/disable'),
  },
  invite: {
    create: (data: { email: string; teamId?: string; role?: string }) =>
      api.post('/api/v1/auth/invite', data),
  },
  team: {
    switch: (teamId: string) => api.post('/api/v1/auth/switch-team', { teamId }),
  },
  authExtra: {
    acceptInvite: (token: string) => api.post('/api/v1/auth/accept-invite', { token }),
    createApiKey: (name: string) => api.post('/api/v1/auth/api-keys', { name }),
    listApiKeys: () => api.get('/api/v1/auth/api-keys'),
    revokeApiKey: (id: string) => api.delete(`/api/v1/auth/api-keys/${id}`),
    sessions: () => api.get('/api/v1/auth/sessions'),
    terminateSession: (id: string) => api.delete(`/api/v1/auth/sessions/${id}`),
    resetPassword: (token: string, newPassword: string) =>
      api.post('/api/v1/auth/reset-password', { token, newPassword }),
    changePassword: (currentPassword: string, newPassword: string) =>
      api.post('/api/v1/auth/change-password', { currentPassword, newPassword }),
  },
};
