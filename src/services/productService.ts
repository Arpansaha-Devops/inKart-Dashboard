/**
 * Product service — all product-related API calls.
 * Uses the admin apiClient which auto-handles auth + 401 retry.
 */
import apiClient from '../lib/apiClient';

/**
 * Create a new product.
 * @param formData – multipart/form-data (name, description, category, productType, stock, basePrice, images)
 */
export const createProduct = async (formData: FormData) => {
  return apiClient.post('/admin/products', formData);
};

/**
 * Fetch paginated product list.
 */
export const getProducts = async (page = 1, limit = 10) => {
  return apiClient.get('/admin/products', {
    params: { page, limit },
  });
};

/**
 * Update an existing product.
 */
export const updateProduct = async (productId: string, formData: FormData) => {
  return apiClient.patch(`/admin/products/${productId}`, formData);
};

/**
 * Update product stock (add/subtract).
 */
export const updateStock = async (
  productId: string,
  data: { quantity: number; operation: 'add' | 'subtract' },
) => {
  return apiClient.patch(`/admin/products/${productId}/stock`, data);
};

/**
 * Fetch categories from all known endpoint variants.
 */
export const fetchCategories = async () => {
  const endpoints = ['/admin/categories', '/categories', '/categories/all'];
  for (const endpoint of endpoints) {
    try {
      const response = await apiClient.get(endpoint);
      return response.data;
    } catch (error: any) {
      // Only try next endpoint on 404; rethrow other errors
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }
  return null;
};
