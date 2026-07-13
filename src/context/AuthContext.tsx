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

const clearAuthStorage = () => {
  Cookies.remove('user');
  Cookies.remove('token');
  Cookies.remove('refreshToken');

  // Remove credentials written by older frontend versions.
  localStorage.removeItem('user:v1');
  localStorage.removeItem('token:v1');
  localStorage.removeItem('refreshToken:v1');
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
    const storedUser = Cookies.get('user');
    const storedToken = Cookies.get('token');

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
  const [{ user, token }, setAuth] = useState(readStoredAuth);
  const isLoading = false;

  const login = useCallback((userData: User, authToken: string, refreshToken: string) => {
    setAuth({ user: userData, token: authToken });

    const cookieOptions = {
      expires: 7,
      sameSite: 'strict' as const,
      secure: window.location.protocol === 'https:',
    };
    Cookies.set('user', JSON.stringify(userData), cookieOptions);
    Cookies.set('token', authToken, cookieOptions);
    Cookies.set('refreshToken', refreshToken, cookieOptions);
  }, []);

  const logout = useCallback(() => {
    setAuth({ user: null, token: null });
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
