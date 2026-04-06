/**
 * Reusable API client for admin product operations.
 *
 * - Auto-authenticates with the admin credentials on first request.
 * - Attaches Bearer token to every outgoing request.
 * - On 401, silently re-authenticates and retries the original request.
 * - Queues concurrent 401 retries so only one login happens at a time.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

//  Admin credentials (server-managed, not user-facing)
const TOKEN_STORAGE_KEY = 'inkart_admin_token';

//  In-memory token cache
let memoryToken: string | null = null;
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
};

// Axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Token helpers
const getToken = (): string | null => {
  if (memoryToken) return memoryToken;
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (stored) {
    memoryToken = stored;
    return stored;
  }
  return null;
};

const setToken = (token: string) => {
  memoryToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
};

const clearToken = () => {
  memoryToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

/**
 * Authenticate using the Backend-For-Frontend (BFF) route.
 * The Vite server intercepts this and handles the actual credentials.
 */
const authenticate = async (): Promise<string> => {
  try {
    console.log('[apiClient] Requesting token from BFF…');
    const response = await axios.post('/api/bff/login');

    const token: string = response.data?.token;
    if (!token) {
      throw new Error('No token returned from BFF /api/bff/login');
    }

    setToken(token);
    console.log('[apiClient] Fetch from BFF successful.');
    return token;
  } catch (error: any) {
    clearToken();
    console.error('[apiClient] BFF authentication failed:', error?.response?.data || error.message);
    throw error;
  }
};

//  Request interceptor — attach token (auto-login if missing)
apiClient.interceptors.request.use(async (config) => {
  let token = getToken();
  if (!token) {
    token = await authenticate();
  }
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

//  Response interceptor — 401 silent retry
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only retry once, only on 401
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If another request is already refreshing, queue this one
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;
    clearToken(); // Old token is invalid

    try {
      const newToken = await authenticate();
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;