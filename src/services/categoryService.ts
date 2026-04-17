import apiClient from '../lib/apiClient';
import type { Category, CreateCategoryPayload } from '../types';

export const getCategories = async (): Promise<Category[]> => {
  try {
    const res = await apiClient.get('/admin/categories');
    return extractCategories(res.data);
  } catch {
    const res = await apiClient.get('/categories');
    return extractCategories(res.data);
  }
};

export const createCategory = async (payload: CreateCategoryPayload): Promise<Category> => {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  const res = await apiClient.post('/admin/categories', formData);
  return res.data;
};

export const updateCategory = async (
  id: string,
  payload: Partial<CreateCategoryPayload>
): Promise<Category> => {
  const res = await apiClient.patch(`/admin/categories/${id}`, payload);
  return res.data;
};

export const deleteCategory = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/categories/${id}`);
};

export function extractCategories(data: unknown): Category[] {
  const isCategoryLike = (item: any): item is Category => {
    return Boolean(
      item &&
        typeof item === 'object' &&
        typeof item._id === 'string' &&
        typeof item.name === 'string'
    );
  };

  if (Array.isArray(data)) {
    return (data as any[]).filter(isCategoryLike);
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const directCandidates = [
      obj.categories,
      (obj.data as any)?.categories,
      (obj.data as any)?.items,
      obj.data,
    ];

    for (const candidate of directCandidates) {
      if (Array.isArray(candidate)) {
        const filtered = (candidate as any[]).filter(isCategoryLike);
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }

    for (const value of Object.values(obj)) {
      const result = extractCategories(value);
      if (result.length > 0) {
        return result;
      }
    }
  }

  return [];
}
