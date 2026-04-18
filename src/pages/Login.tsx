import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import apiClient from '../lib/apiClient';
import { AuthResponse } from '../types';
import { Mail, Lock, Loader2 } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log('Attempting login for:', email);
      const response = await apiClient.post<AuthResponse>('/auth/login', { email, password });
      console.log('Login response:', response.data);

      const { data, token, refreshToken } = response.data;
      const finalUser = data?.user;

      if (!finalUser) {
        throw new Error('User data not found in response');
      }

      if (finalUser.role !== 'admin') {
        toast.error('Access denied. Admins only.');
        return;
      }

      login(finalUser, token, refreshToken);
      toast.success('Login successful');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login error details:', error);
      const message =
        error.response?.data?.message ||
        error.message ||
        'Login failed. Please check your credentials.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, var(--bg-base) 0%, var(--bg-surface) 100%)',
      }}
    >
      <div
        className="w-full max-w-md rounded-lg sm:rounded-2xl p-6 sm:p-8"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div className="text-center mb-8">
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-tighter mb-2"
            style={{ color: 'var(--accent)' }}
          >
            InkArt
          </h1>
          <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
            Admin Management Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div>
            <label
              className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Email Address
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="email"
                required
                className="input-field pl-10 text-base sm:text-sm min-h-[44px] sm:min-h-auto"
                placeholder="admin@inkart.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Password
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="password"
                required
                className="input-field pl-10 text-base sm:text-sm min-h-[44px] sm:min-h-auto"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary flex items-center justify-center gap-2 min-h-[44px] sm:min-h-[44px] sm:py-2 text-sm sm:text-base font-medium"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
          </button>
        </form>

        <div
          className="mt-8 pt-6 text-center"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            © 2026 InkArt. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
