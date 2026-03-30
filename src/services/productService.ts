import api from '../lib/api';

export const createProduct = async (formData: FormData) => {
  const response = await api.post('/admin/products', formData);
  return response;
};
