export const sanitizeProductSlugBase = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

export const createUniqueProductSlug = (productName: string, timestamp = Date.now()) => {
  const baseSlug = sanitizeProductSlugBase(productName) || 'product';
  return `${baseSlug}-${timestamp}`;
};

export const setUniqueProductSlug = (formData: FormData, productName: string) => {
  const slug = createUniqueProductSlug(productName);
  formData.set('slug', slug);
  formData.set('productSlug', slug);
};
