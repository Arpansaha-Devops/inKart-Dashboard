import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const TOKEN_STORAGE_KEY = 'token';
const USER_STORAGE_KEY = 'user';
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';
const DEFAULT_API_BASE_URL = 'https://inkart-virid.vercel.app/api/v1';

const baseURL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

const AUTH_BYPASS_ROUTES = [
  '/auth/login',
  '/auth/register',
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

const shouldBypassAuth = (url?: string) => {
  if (!url) return false;
  return AUTH_BYPASS_ROUTES.some((route) => url.includes(route));
};

const redirectToLogin = () => {
  const targetPath = '/inkarts-admin/login';
  if (window.location.pathname !== targetPath) {
    window.location.href = targetPath;
  }
};

const apiClient = axios.create({
  baseURL,
});

apiClient.interceptors.request.use((config) => {
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

      clearAuthStorage();
      redirectToLogin();
    }

    if (status === 401 && (!originalRequest || shouldBypassAuth(originalRequest.url))) {
      clearAuthStorage();
      redirectToLogin();
    }

    return Promise.reject(error);
  }
);

export default apiClient;
