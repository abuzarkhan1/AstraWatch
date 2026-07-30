import { useState, useEffect } from 'react';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem('accessToken')
  );
  const [user, setUser] = useState<{
    userId: string;
    email: string;
    roles: string[];
  } | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser();
    }
  }, [isAuthenticated]);

  async function fetchUser() {
    try {
      const { default: api } = await import('@/lib/api');
      const { data } = await api.get('/api/v1/auth/me');
      setUser(data);
    } catch {
      logout();
    }
  }

  function login(accessToken: string, refreshToken: string) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setIsAuthenticated(true);
  }

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
    setUser(null);
  }

  return { isAuthenticated, user, login, logout };
}
