import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Validate token on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/auth/me')
        .then(({ data }) => setUser(data.data))
        .catch(() => {
          localStorage.clear();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (phone, password, tenantSlug) => {
    const { data } = await api.post('/auth/login', { phone, password, tenantSlug });
    const { accessToken, refreshToken, user: u } = data.data;
    localStorage.setItem('accessToken',  accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user',         JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const loginWithOTP = useCallback(async (phone, otp) => {
    const { data } = await api.post('/auth/otp/verify', { phone, otp });
    const { accessToken, refreshToken, user: u } = data.data;
    localStorage.setItem('accessToken',  accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user',         JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const signup = useCallback(async (form) => {
    const { data } = await api.post('/auth/signup', form);
    const { accessToken, refreshToken, user: u } = data.data;
    localStorage.setItem('accessToken',  accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user',         JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await api.post('/auth/logout', { refreshToken }); } catch {}
    localStorage.clear();
    setUser(null);
  }, []);

  const can = useCallback((action) => {
    if (!user) return false;
    const PERMISSIONS = {
      owner:   ['all'],
      manager: ['orders.write','inventory.write','sales.write','customers.write','reports.read','billing.write'],
      staff:   ['orders.write','sales.write','customers.read'],
    };
    const perms = PERMISSIONS[user.role] || [];
    return perms.includes('all') || perms.includes(action);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithOTP, signup, logout, can, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
