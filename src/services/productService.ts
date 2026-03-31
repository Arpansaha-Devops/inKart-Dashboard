import api from '../lib/api';

export const createProduct = async (formData: FormData, token: string) => {
  return api.post('/admin/products', formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  });
};
