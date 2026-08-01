import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<{
    userId: string;
    email: string;
    roles: string[];
  } | null>(null);

  // /api/v1/auth/me returns the standard envelope {success, data: UserDTO, meta}.
  // Normalize whatever shape comes back into the UI-facing user object.
  const normalizeUser = useCallback((raw: unknown) => {
    const payload = (raw as { data?: unknown })?.data ?? raw;
    const u = payload as {
      userId?: string;
      id?: string;
      email?: string;
      roles?: string[];
      role?: string;
    };
    if (!u?.email) return null;
    return {
      userId: u.userId ?? u.id ?? '',
      email: u.email,
      roles: Array.isArray(u.roles) ? u.roles : u.role ? [u.role] : [],
    };
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/v1/auth/me');
      setUser(normalizeUser(data));
      setIsAuthenticated(true);
    } catch {
      try {
        await api.post('/api/v1/auth/refresh');
        const { data } = await api.get('/api/v1/auth/me');
        setUser(normalizeUser(data));
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [normalizeUser]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function login(email?: string, password?: string) {
    if (email && password) {
      await api.post('/api/v1/auth/login', { email, password });
    }
    await checkAuth();
  }

  async function logout() {
    try {
      await api.post('/api/v1/auth/logout').catch(() => {});
    } finally {
      setIsAuthenticated(false);
      setUser(null);
    }
  }

  return { isAuthenticated, loading, user, login, logout, checkAuth };
}
