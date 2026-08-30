import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch current user info dari /auth/me (untuk update UI setelah edit profil/WA). */
  refreshUser: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasAnyRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session dari token di localStorage
  useEffect(() => {
    const token = localStorage.getItem('spmb_token');
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch {
        localStorage.removeItem('spmb_token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('spmb_token', res.data.access_token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('spmb_token');
    setUser(null);
    location.href = '/login';
  }, []);

  /**
   * Re-fetch current user info dari /auth/me. Pakai ini setelah edit
   * profil/nomor WA sendiri supaya badge & permission di UI ikut update
   * tanpa harus logout/login ulang.
   */
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch {
      // Token invalid / expired — biarkan saja; interceptor API akan handle.
    }
  }, []);

  const hasPermission = useCallback(
    (code: string) => !!user?.permissions?.includes(code),
    [user],
  );

  const hasAnyRole = useCallback(
    (...roles: string[]) => !!user?.roles?.some((r) => roles.includes(r)),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, hasPermission, hasAnyRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
