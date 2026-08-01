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
      api.post(`/v1/anomaly/${anomalyId}/feedback`, data),
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
    me: () => api.get('/api/v1/auth/me'),
    forgotPassword: (data: { email: string }) => api.post('/api/v1/auth/forgot-password', data),
    oauth2Google: (data: { code?: string; token?: string; credential?: string; idToken?: string; accessToken?: string; email?: string; name?: string; avatarUrl?: string }) =>
      api.post('/api/v1/auth/oauth2/google', data),
    oauth2Github: (data: { code?: string; token?: string; email?: string; name?: string; avatarUrl?: string }) =>
      api.post('/api/v1/auth/oauth2/github', data),
  },
  github: {
    getIntegration: () => api.get('/api/v1/admin/github-integration'),
    updateIntegration: (data: { repo: string; autoPR: boolean; token?: string }) =>
      api.post('/api/v1/admin/github-integration', data),
    testConnection: (data: { repo: string }) =>
      api.post('/api/v1/admin/github-integration/test', data),
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
    createCheckoutSession: (data: { planName: string; isYearly: boolean; price?: number }) => api.post('/api/v1/billing/checkout-session', data),
    createPortalSession: () => api.post('/api/v1/billing/portal-session'),
  },
  users: {
    list: () => api.get('/api/v1/users'),
    updateRole: (userId: string, role: string) => api.put(`/api/v1/users/${userId}/role`, { role }),
    toggleStatus: (userId: string) => api.post(`/api/v1/users/${userId}/toggle-status`),
  },
};
