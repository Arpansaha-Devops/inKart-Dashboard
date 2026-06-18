import type { StockUpdatePayload } from '../types';
import apiClient from '../lib/apiClient';
import { extractCategories } from './categoryService';

const PRODUCT_DELETE_VERIFY_LIMIT = 200;

export type DeleteProductResult = {
  verified: boolean;
  message?: string;
};

export type ProductFormDataPayload = FormData;

const isProductWithId = (value: unknown, productId: string) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      ((value as { _id?: unknown; id?: unknown })._id === productId ||
        (value as { _id?: unknown; id?: unknown }).id === productId)
  );

const payloadContainsProduct = (payload: unknown, productId: string): boolean => {
  if (Array.isArray(payload)) {
    return payload.some((item) => payloadContainsProduct(item, productId));
  }

  if (!payload || typeof payload !== 'object') {
    return false;
  }

  if (isProductWithId(payload, productId)) {
    return true;
  }

  return Object.values(payload as Record<string, unknown>).some((value) =>
    payloadContainsProduct(value, productId)
  );
};

export const createProduct = async (formData: ProductFormDataPayload) => {
  return apiClient.post('/admin/products', formData);
};

export const getProducts = async (page = 1, limit = 10) => {
  return apiClient.get('/admin/products', {
    params: { page, limit, _ts: Date.now() },
  });
};

export const updateProduct = async (productId: string, formData: ProductFormDataPayload) => {
  return apiClient.patch(`/admin/products/${productId}`, formData);
};

export const updateStock = async (productId: string, data: StockUpdatePayload) => {
  return apiClient.patch(`/admin/products/${productId}/stock`, data);
};

export const fetchCategories = async () => {
  const endpoints = ['/admin/categories', '/categories', '/categories/all'];

  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      const response = await apiClient.get(endpoint);
      if (extractCategories(response.data).length > 0) {
        return response.data;
      }
    } catch (error: any) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }

  if (lastError) {
    return null;
  }
  return null;
};

export const deleteProduct = async (productId: string): Promise<DeleteProductResult> => {
  const deleteResponse = await apiClient.delete(`/admin/products/${productId}`);

  if (deleteResponse.data?.success === false) {
    throw new Error(deleteResponse.data?.message || 'Product delete was rejected by the server');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const verifyResponse = await apiClient.get('/admin/products', {
      params: { page: 1, limit: PRODUCT_DELETE_VERIFY_LIMIT, _ts: Date.now() },
    });

    if (!payloadContainsProduct(verifyResponse.data, productId)) {
      return { verified: true };
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 400);
    });
  }

  try {
    await apiClient.delete(`/products/${productId}`);
    const verifyResponse = await apiClient.get('/admin/products', {
      params: { page: 1, limit: PRODUCT_DELETE_VERIFY_LIMIT, _ts: Date.now() },
    });

    if (!payloadContainsProduct(verifyResponse.data, productId)) {
      return { verified: true };
    }
  } catch {
    // The public product route may not support deletes; the admin route above is canonical.
  }

  return {
    verified: false,
    message: 'Product removed from this view, but the server still returns it.',
  };
};
