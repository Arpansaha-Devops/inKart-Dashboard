import React, { useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import apiClient from '../lib/apiClient';
import { AuthResponse } from '../types';
import { Mail, Lock, Loader2, ShieldCheck } from 'lucide-react';

const getAuthPayload = (payload: AuthResponse) => {
  const user = payload.data?.user || payload.user;
  const token = payload.token || payload.data?.token;
  const refreshToken = payload.refreshToken || payload.data?.refreshToken;

  return { user, token, refreshToken };
};

const loginInputStyle = {
  height: 52,
  paddingLeft: 44,
  lineHeight: 1.25,
};

const iconSlotClassName =
  'pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center';

const fieldIconClassName = 'h-5 w-5 flex-shrink-0';

type LoginFormState = {
  email: string;
  password: string;
  otp: string;
  isOtpStep: boolean;
  isLoading: boolean;
};

type LoginFormAction =
  | { type: 'SET_EMAIL'; payload: string }
  | { type: 'SET_PASSWORD'; payload: string }
  | { type: 'SET_OTP'; payload: string }
  | { type: 'SET_OTP_STEP'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'RESET_OTP_STEP' };

const loginFormInitialState: LoginFormState = {
  email: '',
  password: '',
  otp: '',
  isOtpStep: false,
  isLoading: false,
};

function loginFormReducer(state: LoginFormState, action: LoginFormAction): LoginFormState {
  switch (action.type) {
    case 'SET_EMAIL':
      return { ...state, email: action.payload };
    case 'SET_PASSWORD':
      return { ...state, password: action.payload };
    case 'SET_OTP':
      return { ...state, otp: action.payload };
    case 'SET_OTP_STEP':
      return { ...state, isOtpStep: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'RESET_OTP_STEP':
      return { ...state, otp: '', isOtpStep: false };
    default:
      return state;
  }
}

const Login: React.FC = () => {
  const [state, dispatch] = useReducer(loginFormReducer, loginFormInitialState);
  const { email, password, otp, isOtpStep, isLoading } = state;
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const response = await apiClient.post<AuthResponse>(
        isOtpStep ? '/auth/verify-login-otp' : '/auth/login',
        isOtpStep ? { email, otp } : { email, password }
      );

      const { user: finalUser, token, refreshToken } = getAuthPayload(response.data);

      if (!isOtpStep && response.data.success && !finalUser && !token) {
        dispatch({ type: 'SET_OTP_STEP', payload: true });
        toast.success(response.data.message || 'OTP sent to email');
        return;
      }

      if (!finalUser) {
        throw new Error('User data not found in response');
      }

      if (!token || !refreshToken) {
        throw new Error('Auth token not found in response');
      }

      if (finalUser.role !== 'admin') {
        toast.error('Access denied. Admins only.');
        return;
      }

      login(finalUser, token, refreshToken);
      toast.success('Login successful');
      navigate('/dashboard');
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.message ||
        'Login failed. Please check your credentials.';
      toast.error(message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
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
          {!isOtpStep ? (
            <>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Email Address
                </label>
                <div className="relative">
                  <span className={iconSlotClassName}>
                    <Mail
                      className={fieldIconClassName}
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    required
                    className="input-field text-base sm:text-sm"
                    style={loginInputStyle}
                    placeholder="admin@inkart.com"
                    value={email}
                    onChange={(e) => dispatch({ type: 'SET_EMAIL', payload: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Password
                </label>
                <div className="relative">
                  <span className={iconSlotClassName}>
                    <Lock
                      className={fieldIconClassName}
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </span>
                  <input
                    id="login-password"
                    type="password"
                    required
                    className="input-field text-base sm:text-sm"
                    style={loginInputStyle}
                    placeholder="********"
                    value={password}
                    onChange={(e) => dispatch({ type: 'SET_PASSWORD', payload: e.target.value })}
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label
                htmlFor="login-otp"
                className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                OTP Code
              </label>
              <div className="relative">
                <span className={iconSlotClassName}>
                  <ShieldCheck
                    className={fieldIconClassName}
                    style={{ color: 'var(--text-muted)' }}
                  />
                </span>
                <input
                  id="login-otp"
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="input-field text-base sm:text-sm"
                  style={loginInputStyle}
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={(e) => dispatch({ type: 'SET_OTP', payload: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="mt-3 text-xs sm:text-sm"
                style={{ color: 'var(--accent)' }}
                onClick={() => dispatch({ type: 'RESET_OTP_STEP' })}
              >
                Change email or password
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary flex items-center justify-center gap-2 min-h-[44px] sm:min-h-[44px] sm:py-2 text-sm sm:text-base font-medium"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : isOtpStep ? (
              'Verify OTP'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div
          className="mt-8 pt-6 text-center"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            &copy; 2026 InkArt. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
