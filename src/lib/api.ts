import axios from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: '/api/proxy',
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['User-Agent'] = 'InkArt-Admin-Panel/1.0';
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('user');
      Cookies.remove('token');
      Cookies.remove('refreshToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
