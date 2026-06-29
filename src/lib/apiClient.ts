import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
import { toast } from 'sonner';

const TOKEN_STORAGE_KEY = 'token';
const USER_STORAGE_KEY = 'user';
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';
const DEFAULT_API_BASE_URL = 'https://inkart-virid.vercel.app/api/v1';
const CACHE_BUST_PARAM = '_ts';

const configuredBaseURL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

const baseURL = configuredBaseURL;

const AUTH_BYPASS_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-login-otp',
  '/auth/verify-otp',
  '/auth/refresh-token',
];

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const readToken = () =>
  Cookies.get(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);

const readRefreshToken = () =>
  Cookies.get(REFRESH_TOKEN_STORAGE_KEY) ||
  localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

const saveToken = (token: string) => {
  Cookies.set(TOKEN_STORAGE_KEY, token, { expires: 7 });
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

const clearAuthStorage = () => {
  Cookies.remove(USER_STORAGE_KEY);
  Cookies.remove(TOKEN_STORAGE_KEY);
  Cookies.remove(REFRESH_TOKEN_STORAGE_KEY);

  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};

let sessionExpiryRedirectScheduled = false;

const shouldBypassAuth = (url?: string) => {
  if (!url) return false;
  try {
    const pathname = new URL(url, baseURL).pathname;
    return AUTH_BYPASS_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    );
  } catch {
    return AUTH_BYPASS_ROUTES.some(
      (route) => url === route || url.startsWith(`${route}/`)
    );
  }
};

const redirectToLogin = () => {
  const targetPath = '/admin/login';
  if (typeof window === 'undefined' || window.location.pathname === targetPath) {
    return;
  }

  window.location.replace(targetPath);
};

const handleExpiredSession = () => {
  clearAuthStorage();

  if (!sessionExpiryRedirectScheduled) {
    sessionExpiryRedirectScheduled = true;
    toast.error('Session expired. Please log in again.');

    window.setTimeout(() => {
      redirectToLogin();
    }, 1500);
  }
};

const apiClient = axios.create({
  baseURL,
});

apiClient.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (method === 'get') {
    if (config.params instanceof URLSearchParams) {
      if (!config.params.has(CACHE_BUST_PARAM)) {
        config.params.set(CACHE_BUST_PARAM, String(Date.now()));
      }
    } else {
      config.params = {
        ...(config.params || {}),
        [CACHE_BUST_PARAM]: (config.params as Record<string, unknown> | undefined)?.[
          CACHE_BUST_PARAM
        ] ?? Date.now(),
      };
    }
  }

  if (!shouldBypassAuth(config.url)) {
    const token = readToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } else if (config.headers?.Authorization) {
    delete config.headers.Authorization;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !shouldBypassAuth(originalRequest.url)
    ) {
      originalRequest._retry = true;

      const refreshToken = readRefreshToken();

      if (refreshToken) {
        try {
          const refreshResponse = await axios.post(
            `${baseURL}/auth/refresh-token`,
            { refreshToken },
            { headers: { 'Content-Type': 'application/json' } }
          );

          const newToken = refreshResponse.data?.token;
          if (typeof newToken === 'string' && newToken.trim()) {
            saveToken(newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }
        } catch {
          // Refresh failed; clear auth and redirect below.
        }
      }

      handleExpiredSession();
      return Promise.reject(error);
    }

    if (status === 401 && !originalRequest) {
      handleExpiredSession();
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
