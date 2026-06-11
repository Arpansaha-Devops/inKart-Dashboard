import type { StockUpdatePayload } from '../types';
import apiClient from '../lib/apiClient';

export const createProduct = async (formData: FormData) => {
  return apiClient.post('/admin/products', formData);
};

export const getProducts = async (page = 1, limit = 10) => {
  return apiClient.get('/admin/products', {
    params: { page, limit },
  });
};

export const updateProduct = async (productId: string, formData: FormData) => {
  return apiClient.patch(`/admin/products/${productId}`, formData);
};

export const updateStock = async (productId: string, data: StockUpdatePayload) => {
  return apiClient.patch(`/admin/products/${productId}/stock`, data);
};

export const fetchCategories = async () => {
  const endpoints = ['/admin/categories', '/categories', '/categories/all'];

  const responses = await Promise.allSettled(
    endpoints.map((endpoint) => apiClient.get(endpoint))
  );

  for (const response of responses) {
    if (response.status === 'fulfilled') {
      return response.value.data;
    }

    if (response.reason?.response?.status !== 404) {
      throw response.reason;
    }
  }

  return null;
};

export const deleteProduct = async (productId: string): Promise<void> => {
  await apiClient.delete(`/admin/products/${productId}`);
};
