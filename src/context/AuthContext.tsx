import React, { createContext, useContext, useState, useEffect } from 'react';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = Cookies.get('user');
    const storedToken = Cookies.get('token');
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch (e) {
        console.error('Failed to parse user from cookies', e);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User, authToken: string, refreshToken: string) => {
    setUser(userData);
    setToken(authToken);
    
    // Set cookies to expire in 7 days
    Cookies.set('user', JSON.stringify(userData), { expires: 7 });
    Cookies.set('token', authToken, { expires: 7 });
    Cookies.set('refreshToken', refreshToken, { expires: 7 });
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    Cookies.remove('user');
    Cookies.remove('token');
    Cookies.remove('refreshToken');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
