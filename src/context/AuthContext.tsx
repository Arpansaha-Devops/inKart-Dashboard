import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import Cookies from 'js-cookie';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string, refreshToken: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEYS = {
  user: 'user:v1',
  token: 'token:v1',
  refreshToken: 'refreshToken:v1',
} as const;

const clearAuthStorage = () => {
  Cookies.remove('user');
  Cookies.remove('token');
  Cookies.remove('refreshToken');
  Object.values(AUTH_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));

  // Remove values written by versions of the app that used unversioned keys.
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
};

function isTokenExpired(token: string): boolean {
  try {
    const encodedPayload = token.split('.')[1];
    const normalizedPayload = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(normalizedPayload));
    return typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

const readStoredAuth = (): { user: User | null; token: string | null } => {
  try {
    const storedUser = Cookies.get('user') || localStorage.getItem(AUTH_STORAGE_KEYS.user);
    const storedToken = Cookies.get('token') || localStorage.getItem(AUTH_STORAGE_KEYS.token);

    if (!storedUser || !storedToken || isTokenExpired(storedToken)) {
      clearAuthStorage();
      return { user: null, token: null };
    }

    return {
      user: JSON.parse(storedUser),
      token: storedToken,
    };
  } catch (e) {
    console.error('Failed to parse user from cookies', e);
    clearAuthStorage();
    return { user: null, token: null };
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const initialAuth = useMemo(readStoredAuth, []);
  const [user, setUser] = useState<User | null>(() => initialAuth.user);
  const [token, setToken] = useState<string | null>(() => initialAuth.token);
  const isLoading = false;

  const login = useCallback((userData: User, authToken: string, refreshToken: string) => {
    setUser(userData);
    setToken(authToken);

    // Set cookies to expire in 7 days
    Cookies.set('user', JSON.stringify(userData), { expires: 7 });
    Cookies.set('token', authToken, { expires: 7 });
    Cookies.set('refreshToken', refreshToken, { expires: 7 });
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(userData));
    localStorage.setItem(AUTH_STORAGE_KEYS.token, authToken);
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, refreshToken);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearAuthStorage();
  }, []);

  const value = useMemo(
    () => ({ user, token, login, logout, isLoading }),
    [user, token, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = use(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
