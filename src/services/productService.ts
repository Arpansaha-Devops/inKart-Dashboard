import apiClient from '../lib/apiClient';
import { extensionPersistenceError, findProductRecord } from '../lib/productConfiguration';
import { getProductGalleryUrls } from '../lib/productImages';

export const verifyProductExtensions = async (payload: unknown, data: FormData, productId?: string, galleryChange?: { previousUrls: string[]; newImageCount: number }): Promise<string | null> => {
  const gallerySize = data.getAll('productImages').filter((value) => typeof value !== 'string').length;
  if (!data.has('configuration') && !data.has('packageDetails') && gallerySize === 0) return null;
  const saved = findProductRecord(payload, productId);
  const id = productId || String(saved?._id ?? saved?.id ?? '');
  const pending = `Product save completed, but ${gallerySize ? 'configuration/package/image gallery' : 'configuration/package'} persistence could not be verified. Refresh and review the saved product before retrying.`;
  if (!id) return pending;
  try {
    // Reuse the existing listing route: there is no documented admin detail GET.
    for (let page = 1; page <= 50; page += 1) {
      const response = await apiClient.get('/admin/products', { params: { page, limit: 100, _ts: Date.now() } });
      if (response.data?.success === false || response.data?.data?.success === false) return pending;
      const product = findProductRecord(response.data, id);
      if (product) {
        const field = extensionPersistenceError(product, data);
        if (field) return `Product save completed, but the backend did not return the submitted ${field}. Its persistence is unconfirmed; review the product before retrying.`;
        // An explicit empty gallery cannot be verified by an unrelated legacy cover.
        const reportedImages = [product.images, product.imageUrls, product.productImages].find(Array.isArray);
        const galleryUrls = getProductGalleryUrls(reportedImages ? { images: reportedImages } : product);
        if (gallerySize && galleryUrls.length !== gallerySize) {
          return `Product save completed, but the backend did not return the expected ${gallerySize}-image gallery. The images may have been appended or ignored; refresh and review the product before retrying.`;
        }
        if (gallerySize && galleryChange) {
          const oldTail = galleryChange.previousUrls.slice(Math.max(0, galleryChange.previousUrls.length - galleryChange.newImageCount));
          const newTail = galleryUrls.slice(Math.max(0, galleryUrls.length - galleryChange.newImageCount));
          if (newTail.some((url) => oldTail.includes(url))) return 'Product save completed, but the image gallery still contains images from the replaced slots. The replacement is unconfirmed; refresh and review the product before retrying.';
        }
        return null;
      }
      // A short/empty listing cannot contain further pages. Bound reads for older APIs.
      const root = response.data;
      const items = [root, root?.products, root?.data?.products, root?.data?.items, root?.data?.docs, root?.docs, root?.data].find(Array.isArray);
      if (!Array.isArray(items) || items.length < 100) break;
    }
  } catch {
    return pending;
  }
  return pending;
};

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

export const updateProduct = async (productId: string, formData: ProductFormDataPayload) => {
  return apiClient.patch(`/admin/products/${productId}`, formData);
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
