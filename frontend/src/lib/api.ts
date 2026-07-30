import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
          refreshToken,
        });
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/auth/login';
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
  auth: {
    login: (data: unknown) => api.post('/api/v1/auth/login', data),
    register: (data: unknown) => api.post('/api/v1/auth/register', data),
    refresh: (data: unknown) => api.post('/api/v1/auth/refresh', data),
    verifyEmail: (data: unknown) => api.post('/api/v1/auth/verify-email', data),
    me: () => api.get('/api/v1/auth/me'),
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
};
