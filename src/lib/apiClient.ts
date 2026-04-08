/*
 * Uses the user's authentication token from login.
 */
import axios, { AxiosError } from 'axios';

const TOKEN_STORAGE_KEY = 'token';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://inkart-virid.vercel.app/api/v1",
});

// Attach token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem('user');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;