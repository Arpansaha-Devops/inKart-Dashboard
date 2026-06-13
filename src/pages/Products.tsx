import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { Product } from '../types';
import {
  Plus,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Upload,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import CreateProductModal from '../components/CreateProductModal';
import { deleteProduct } from '../services/productService';
import { getVisibleProductName } from '../lib/productNames';

const isProductLike = (item: any): item is Product => {
  return Boolean(
    item &&
      typeof item === 'object' &&
      typeof item._id === 'string' &&
      (typeof item.name === 'string' || typeof item.description === 'string')
  );
};

const collectArrays = (node: unknown, arrays: any[][] = []): any[][] => {
  if (Array.isArray(node)) {
    arrays.push(node);
    return arrays;
  }

  if (!node || typeof node !== 'object') {
    return arrays;
  }

  Object.values(node as Record<string, unknown>).forEach((value) => collectArrays(value, arrays));
  return arrays;
};

const extractProducts = (payload: any): Product[] => {
  const directCandidates = [
    payload?.products,
    payload?.data?.products,
    payload?.data?.items,
    payload?.data?.docs,
    payload?.docs,
    payload?.data,
  ];

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate) && candidate.some(isProductLike)) {
      return candidate.filter(isProductLike);
    }
  }

  const deepCandidates = collectArrays(payload);
  let best: Product[] = [];
  deepCandidates.forEach((arr) => {
    const filtered = arr.filter(isProductLike);
    if (filtered.length > best.length) {
      best = filtered;
    }
  });

  return best;
};

const extractTotalProducts = (payload: any, fallback = 0): number => {
  const countKeys = [
    'total',
    'totalCount',
    'count',
    'totalProducts',
    'totalResults',
    'totalItems',
  ];

  const visit = (node: any): number | null => {
    if (!node || typeof node !== 'object') return null;

    for (const key of countKeys) {
      if (typeof node[key] === 'number') {
        return node[key];
      }
    }

    for (const value of Object.values(node)) {
      const found = visit(value);
      if (found !== null) return found;
    }

    return null;
  };

  return visit(payload) ?? fallback;
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const PRODUCT_PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='18' fill='%231a1a1a'/%3E%3Crect x='20' y='20' width='120' height='120' rx='14' fill='%232a2a2a' stroke='%23404040'/%3E%3Cpath d='M52 102l20-24 14 16 18-24 18 32H52z' fill='%23f97316' opacity='.8'/%3E%3Ccircle cx='62' cy='58' r='10' fill='%23f97316' opacity='.9'/%3E%3C/svg%3E";

const extractCategoriesFromPayload = (payload: any): Record<string, string> => {
  const byId: Record<string, string> = {};
  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;

    if (typeof node._id === 'string' && typeof node.name === 'string') {
      byId[node._id] = node.name;
    }
    if (node.category && typeof node.category === 'object') {
      if (typeof node.category._id === 'string' && typeof node.category.name === 'string') {
        byId[node.category._id] = node.category.name;
      }
    }

    Object.values(node).forEach(visit);
  };
  visit(payload);
  return byId;
};

const getProductImageUrl = (product: any): string => {
  const directCandidates = [product?.image, product?.imageUrl, product?.thumbnail, product?.thumbnailUrl];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  const arrayCandidates = [product?.images, product?.imageUrls, product?.productImages];
  for (const candidate of arrayCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      const first = candidate[0];
      if (typeof first === 'string' && first.trim()) {
        return first;
      }
      if (first && typeof first === 'object') {
        const nested = first.url || first.secure_url || first.path || first.image || first.src;
        if (typeof nested === 'string' && nested.trim()) {
          return nested;
        }
      }
    }
  }

  return PRODUCT_PLACEHOLDER_IMAGE;
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const selector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter(
    (el: any) => !el.hasAttribute('disabled')
  ) as HTMLElement[];
};

type ProductFormData = {
  name: string;
  description: string;
  category: string;
  productType: string;
  stock: number;
  isCustomizable: boolean;
  basePrice: number;
  image: File | null;
};

type StockFormData = {
  quantity: number;
  operation: 'add' | 'subtract';
};

type ProductsState = {
  products: Product[];
  totalCount: number;
  page: number;
  isLoading: boolean;
  categoryNameById: Record<string, string>;
  isModalOpen: boolean;
  isStockModalOpen: boolean;
  isCreateModalOpen: boolean;
  isDeleteModalOpen: boolean;
  isDeletingProduct: boolean;
  editingProduct: Product | null;
  stockProduct: Product | null;
  deletingProduct: Product | null;
  formData: ProductFormData;
  stockData: StockFormData;
};

type ProductsAction =
  | { type: 'SET_LIST'; payload: { products: Product[]; totalCount: number } }
  | { type: 'SET_PRODUCTS'; payload: Product[] | ((previous: Product[]) => Product[]) }
  | { type: 'SET_TOTAL_COUNT'; payload: number | ((previous: number) => number) }
  | { type: 'SET_PAGE'; payload: number | ((previous: number) => number) }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'MERGE_CATEGORY_NAMES'; payload: Record<string, string> }
  | { type: 'OPEN_PRODUCT_MODAL'; payload: { product: Product | null; formData: ProductFormData } }
  | { type: 'CLOSE_PRODUCT_MODAL' }
  | { type: 'OPEN_STOCK_MODAL'; payload: Product }
  | { type: 'CLOSE_STOCK_MODAL' }
  | { type: 'OPEN_CREATE_MODAL' }
  | { type: 'CLOSE_CREATE_MODAL' }
  | { type: 'OPEN_DELETE_MODAL'; payload: Product }
  | { type: 'CLOSE_DELETE_MODAL' }
  | { type: 'SET_DELETING_PRODUCT'; payload: boolean }
  | { type: 'SET_FORM_DATA'; payload: ProductFormData | ((previous: ProductFormData) => ProductFormData) }
  | { type: 'SET_STOCK_DATA'; payload: StockFormData | ((previous: StockFormData) => StockFormData) };

const defaultProductFormData = (): ProductFormData => ({
  name: '',
  description: '',
  category: '',
  productType: 'on_demand',
  stock: 0,
  isCustomizable: true,
  basePrice: 0,
  image: null,
});

const productsInitialState: ProductsState = {
  products: [],
  totalCount: 0,
  page: 1,
  isLoading: true,
  categoryNameById: {},
  isModalOpen: false,
  isStockModalOpen: false,
  isCreateModalOpen: false,
  isDeleteModalOpen: false,
  isDeletingProduct: false,
  editingProduct: null,
  stockProduct: null,
  deletingProduct: null,
  formData: defaultProductFormData(),
  stockData: { quantity: 0, operation: 'add' },
};

function productsReducer(state: ProductsState, action: ProductsAction): ProductsState {
  switch (action.type) {
    case 'SET_LIST':
      return { ...state, products: action.payload.products, totalCount: action.payload.totalCount };
    case 'SET_PRODUCTS':
      return {
        ...state,
        products:
          typeof action.payload === 'function'
            ? action.payload(state.products)
            : action.payload,
      };
    case 'SET_TOTAL_COUNT':
      return {
        ...state,
        totalCount:
          typeof action.payload === 'function'
            ? action.payload(state.totalCount)
            : action.payload,
      };
    case 'SET_PAGE':
      return {
        ...state,
        page:
          typeof action.payload === 'function'
            ? action.payload(state.page)
            : action.payload,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'MERGE_CATEGORY_NAMES':
      return { ...state, categoryNameById: { ...state.categoryNameById, ...action.payload } };
    case 'OPEN_PRODUCT_MODAL':
      return {
        ...state,
        editingProduct: action.payload.product,
        formData: action.payload.formData,
        isModalOpen: true,
      };
    case 'CLOSE_PRODUCT_MODAL':
      return { ...state, isModalOpen: false };
    case 'OPEN_STOCK_MODAL':
      return {
        ...state,
        stockProduct: action.payload,
        stockData: { quantity: 0, operation: 'add' },
        isStockModalOpen: true,
      };
    case 'CLOSE_STOCK_MODAL':
      return { ...state, isStockModalOpen: false };
    case 'OPEN_CREATE_MODAL':
      return { ...state, isCreateModalOpen: true };
    case 'CLOSE_CREATE_MODAL':
      return { ...state, isCreateModalOpen: false };
    case 'OPEN_DELETE_MODAL':
      return { ...state, deletingProduct: action.payload, isDeleteModalOpen: true };
    case 'CLOSE_DELETE_MODAL':
      return { ...state, deletingProduct: null, isDeleteModalOpen: false };
    case 'SET_DELETING_PRODUCT':
      return { ...state, isDeletingProduct: action.payload };
    case 'SET_FORM_DATA':
      return {
        ...state,
        formData:
          typeof action.payload === 'function'
            ? action.payload(state.formData)
            : action.payload,
      };
    case 'SET_STOCK_DATA':
      return {
        ...state,
        stockData:
          typeof action.payload === 'function'
            ? action.payload(state.stockData)
            : action.payload,
      };
    default:
      return state;
  }
}

const Products: React.FC = () => {
  const [state, dispatch] = useReducer(productsReducer, productsInitialState);
  const {
    products,
    totalCount,
    page,
    isLoading,
    categoryNameById,
    isModalOpen,
    isStockModalOpen,
    isCreateModalOpen,
    isDeleteModalOpen,
    isDeletingProduct,
    editingProduct,
    stockProduct,
    deletingProduct,
    formData,
    stockData,
  } = state;
  const limit = 10;

  const deleteModalOverlayRef = useRef<HTMLDivElement>(null);
  const deleteModalContentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const getCategoryLabel = (product: any): string => {
    if (product?.category && typeof product.category === 'object') {
      return product.category.name || product.category._id || 'Unknown Category';
    }
    if (typeof product?.category === 'string') {
      return categoryNameById[product.category] || product.category;
    }
    return 'Unknown Category';
  };

  const fetchCategoryLookup = useCallback(async () => {
    try {
      const response = await apiClient.get('/admin/categories');
      const categories = extractCategoriesFromPayload(response.data);
      if (Object.keys(categories).length > 0) {
        dispatch({ type: 'MERGE_CATEGORY_NAMES', payload: categories });
      }
    } catch (error) {
      // Silently fail - categories will be extracted from product data
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const response = await apiClient.get<any>('/admin/products', {
        params: { page: 1, limit: 500, _ts: Date.now() },
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      const productsList = extractProducts(response.data);

      const mappedCategories: Record<string, string> = {};
      productsList.forEach((product: any) => {
        if (product?.category && typeof product.category === 'object') {
          if (typeof product.category._id === 'string' && typeof product.category.name === 'string') {
            mappedCategories[product.category._id] = product.category.name;
          }
        }
      });

      dispatch({
        type: 'SET_LIST',
        payload: { products: productsList, totalCount: productsList.length },
      });
      if (Object.keys(mappedCategories).length > 0) {
        dispatch({ type: 'MERGE_CATEGORY_NAMES', payload: mappedCategories });
      }
    } catch (error) {
      console.error('Error fetching products', error);
      toast.error('Failed to load products');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchCategoryLookup();
  }, [fetchCategoryLookup]);

  useEffect(() => {
    if (!isDeleteModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch({ type: 'CLOSE_DELETE_MODAL' });
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        deleteModalOverlayRef.current &&
        event.target === deleteModalOverlayRef.current
      ) {
        dispatch({ type: 'CLOSE_DELETE_MODAL' });
      }
    };

    const focusableElements = deleteModalContentRef.current
      ? getFocusableElements(deleteModalContentRef.current)
      : [];

    if (focusableElements.length > 0) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      focusableElements[0].focus();
    }

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !deleteModalContentRef.current) {
        return;
      }

      const focusableEls = getFocusableElements(deleteModalContentRef.current);
      if (focusableEls.length === 0) return;

      const firstEl = focusableEls[0];
      const lastEl = focusableEls[focusableEls.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        }
      } else if (document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('keydown', handleTabKey);

    const overlay = deleteModalOverlayRef.current;
    overlay?.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('keydown', handleTabKey);

      if (overlay) {
        overlay.removeEventListener('mousedown', handleClickOutside);
      }

      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isDeleteModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch({ type: 'CLOSE_PRODUCT_MODAL' });
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isModalOpen]);

  useEffect(() => {
    if (!isStockModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch({ type: 'CLOSE_STOCK_MODAL' });
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isStockModalOpen]);

  const handleOpenModal = (product: Product) => {
    dispatch({
      type: 'OPEN_PRODUCT_MODAL',
      payload: {
        product,
        formData: {
          name: getVisibleProductName(product.name),
          description: product.description || '',
          category: typeof product.category === 'object' && product.category !== null ? ((product.category as any)?._id || '') : (product.category || ''),
          productType: product.productType || 'on_demand',
          stock: product.stock || 0,
          isCustomizable: product.isCustomizable ?? true,
          basePrice: product.basePrice || 0,
          image: null,
        },
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (value instanceof File) {
          data.append(key === 'image' ? 'images' : key, value);
        } else {
          data.append(key, String(value));
        }
      }
    });
    data.set('name', formData.name.trim());

    try {
      // This legacy modal is edit-only; product creation is handled by CreateProductModal.
      if (!editingProduct) {
        toast.error('Use the Create Product modal to add new products.');
        return;
      }
      await apiClient.patch(`/admin/products/${editingProduct._id}`, data);
      toast.success('Product updated successfully');
      dispatch({ type: 'CLOSE_PRODUCT_MODAL' });
      fetchProducts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockProduct) return;

    try {
      await apiClient.patch(`/admin/products/${stockProduct._id}/stock`, stockData);
      toast.success('Stock updated successfully');
      dispatch({ type: 'CLOSE_STOCK_MODAL' });
      fetchProducts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Stock update failed');
    }
  };

  const handleOpenDeleteModal = (product: Product) => {
    dispatch({ type: 'OPEN_DELETE_MODAL', payload: product });
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct?._id) return;

    const productId = deletingProduct._id;
    dispatch({ type: 'SET_DELETING_PRODUCT', payload: true });
    try {
      const result = await deleteProduct(productId);
      dispatch({
        type: 'SET_PRODUCTS',
        payload: (currentProducts) =>
          currentProducts.filter((product) => product._id !== productId),
      });
      dispatch({
        type: 'SET_TOTAL_COUNT',
        payload: (currentTotal) => Math.max(0, currentTotal - 1),
      });
      dispatch({ type: 'CLOSE_DELETE_MODAL' });
      if (products.length === 1 && page > 1) {
        dispatch({ type: 'SET_PAGE', payload: (currentPage) => Math.max(1, currentPage - 1) });
      } else if (result.verified) {
        await fetchProducts();
      }
      if (result.verified) {
        toast.success('Product deleted');
      } else {
        toast.warning(result.message || 'Product removed from this view, but backend verification failed.');
      }
    } catch (error: any) {
      toast.error(error?.message || error?.response?.data?.message || 'Failed to delete product');
      await fetchProducts();
    } finally {
      dispatch({ type: 'SET_DELETING_PRODUCT', payload: false });
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * limit;
    return products.slice(start, start + limit);
  }, [page, products]);

  return (
    <div className="page-wrapper products-page">
      <div style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 className="page-title">Products</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Review inventory, pricing, and stock changes across the catalog.
          </p>
        </div>

        <div className="toolbar-row products-toolbar" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Product Inventory
            </h2>
          </div>

          <button type="button" onClick={() => dispatch({ type: 'OPEN_CREATE_MODAL' })} className="btn-primary">
            <Plus size={18} />
            <span>Create Product</span>
          </button>
        </div>

        <div className="card products-table-card" style={{ padding: 0 }}>
          <div className="table-container products-table-container" style={{ border: 'none', borderRadius: 'inherit' }}>
            <table className="data-table products-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={6}>
                        <div className="skeleton" style={{ height: 52 }} />
                      </td>
                    </tr>
                  ))
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '56px 20px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        No products found. Start by adding one.
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((product) => (
                    <tr key={product._id} className="group">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img
                            src={getProductImageUrl(product) || PRODUCT_PLACEHOLDER_IMAGE}
                            alt={getVisibleProductName(product.name)}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 8,
                              objectFit: 'cover',
                              border: '1px solid var(--border)',
                              flexShrink: 0,
                              background: 'var(--bg-surface)',
                            }}
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              (event.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER_IMAGE;
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontWeight: 500, margin: 0, fontSize: 14 }}>
                              {getVisibleProductName(product.name)}
                            </p>
                            <p
                              style={{
                                color: 'var(--text-muted)',
                                margin: 0,
                                fontSize: 12,
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {product.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{getCategoryLabel(product)}</td>
                      <td>
                        <span className={product.productType === 'stocked' ? 'badge-stocked' : 'badge-on-demand'}>
                          {product.productType === 'stocked' ? 'Stocked' : 'On Demand'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            dispatch({ type: 'OPEN_STOCK_MODAL', payload: product });
                          }}
                          style={{
                            color: (product.stock ?? 0) === 0 ? 'var(--danger)' : 'var(--text-primary)',
                            fontWeight: 500,
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          {product.stock ?? 0}
                        </button>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(product.basePrice || 0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '8px',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenModal(product)}
                            className="action-icon-button"
                            aria-label="Edit product"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(product)}
                            className="action-icon-button danger opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                            aria-label="Delete product"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {products.length > 0 && totalPages > 1 ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderTop: '1px solid var(--border)',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                Page {page} of {totalPages}
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={page === 1}
                  onClick={() => dispatch({ type: 'SET_PAGE', payload: (previous) => previous - 1 })}
                >
                  <ChevronLeft size={15} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={page === totalPages}
                  onClick={() => dispatch({ type: 'SET_PAGE', payload: (previous) => previous + 1 })}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen ? (
          <div
            className="modal-backdrop"
            onClick={() => dispatch({ type: 'CLOSE_PRODUCT_MODAL' })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dispatch({ type: 'CLOSE_PRODUCT_MODAL' });
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close product modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="modal-box modal-box-lg"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-edit-title"
            >
              <form onSubmit={handleSubmit}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '24px',
                    gap: '12px',
                  }}
                >
                  <h2
                    id="product-edit-title"
                    style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    Edit Product
                  </h2>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'CLOSE_PRODUCT_MODAL' })}
                    className="action-icon-button"
                    aria-label="Close product modal"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="edit-product-name">Product name</label>
                    <input
                      id="edit-product-name"
                      type="text"
                      required
                      className="input-field"
                      value={formData.name}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FORM_DATA',
                          payload: { ...formData, name: event.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="edit-product-description">Description</label>
                    <textarea
                      id="edit-product-description"
                      required
                      rows={3}
                      className="input-field"
                      value={formData.description}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FORM_DATA',
                          payload: { ...formData, description: event.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-product-category">Category</label>
                    <input
                      id="edit-product-category"
                      type="text"
                      required
                      className="input-field"
                      value={formData.category}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FORM_DATA',
                          payload: { ...formData, category: event.target.value },
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-product-type">Product type</label>
                    <select
                      id="edit-product-type"
                      className="input-field"
                      value={formData.productType}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FORM_DATA',
                          payload: {
                          ...formData,
                          productType: event.target.value as 'stocked' | 'on_demand',
                          },
                        })
                      }
                    >
                      <option value="on_demand">On demand</option>
                      <option value="stocked">Stock</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-product-stock">Initial stock</label>
                    <input
                      id="edit-product-stock"
                      type="number"
                      required
                      min="0"
                      step="1"
                      className="input-field"
                      value={formData.stock}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FORM_DATA',
                          payload: { ...formData, stock: parseInt(event.target.value, 10) || 0 },
                        })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-product-customizable">Customizable</label>
                    <select
                      id="edit-product-customizable"
                      className="input-field"
                      value={String(formData.isCustomizable)}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FORM_DATA',
                          payload: { ...formData, isCustomizable: event.target.value === 'true' },
                        })
                      }
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-product-base-price">Base price</label>
                    <input
                      id="edit-product-base-price"
                      type="number"
                      required
                      step="0.01"
                      className="input-field"
                      value={formData.basePrice}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FORM_DATA',
                          payload: { ...formData, basePrice: parseFloat(event.target.value) || 0 },
                        })
                      }
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="edit-product-image">Product image</label>
                    <div
                      style={{
                        border: '1px dashed var(--border-active)',
                        borderRadius: 'var(--radius-md)',
                        padding: '24px',
                        textAlign: 'center',
                        background: 'var(--bg-surface)',
                        position: 'relative',
                      }}
                    >
                      <input
                        id="edit-product-image"
                        type="file"
                        aria-label="Upload product image"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          opacity: 0,
                          cursor: 'pointer',
                        }}
                        onChange={(event) =>
                          dispatch({
                            type: 'SET_FORM_DATA',
                            payload: { ...formData, image: event.target.files?.[0] || null },
                          })
                        }
                      />
                      <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {formData.image ? formData.image.name : 'Click or drag image to upload'}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    marginTop: '24px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <button type="button" className="btn-ghost" onClick={() => dispatch({ type: 'CLOSE_PRODUCT_MODAL' })}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isStockModalOpen ? (
          <div
            className="modal-backdrop"
            onClick={() => dispatch({ type: 'CLOSE_STOCK_MODAL' })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dispatch({ type: 'CLOSE_STOCK_MODAL' });
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close stock modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="modal-box"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-stock-title"
            >
              <form onSubmit={handleUpdateStock}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '24px',
                    gap: '12px',
                  }}
                >
                  <h2
                    id="product-stock-title"
                    style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    Update Stock
                  </h2>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'CLOSE_STOCK_MODAL' })}
                    className="action-icon-button"
                    aria-label="Close stock modal"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    marginBottom: '16px',
                  }}
                >
                  <div className="icon-box" style={{ background: 'var(--accent-muted)' }}>
                    <Package size={18} color="var(--accent)" />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {getVisibleProductName(stockProduct?.name)}
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                      Current stock: {stockProduct?.stock}
                    </p>
                  </div>
                </div>

                <div className="form-group">
                  <span className="form-label" id="stock-operation-label">Operation</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'SET_STOCK_DATA',
                          payload: { ...stockData, operation: 'add' },
                        })
                      }
                      className={stockData.operation === 'add' ? 'btn-primary' : 'btn-ghost'}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'SET_STOCK_DATA',
                          payload: { ...stockData, operation: 'subtract' },
                        })
                      }
                      className={stockData.operation === 'subtract' ? 'btn-danger' : 'btn-ghost'}
                    >
                      Subtract
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="stock-quantity">Quantity</label>
                  <input
                    id="stock-quantity"
                    type="number"
                    required
                    min="1"
                    className="input-field"
                    value={stockData.quantity}
                    onChange={(event) =>
                      dispatch({
                        type: 'SET_STOCK_DATA',
                        payload: { ...stockData, quantity: parseInt(event.target.value, 10) || 0 },
                      })
                    }
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    marginTop: '24px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <button type="button" className="btn-ghost" onClick={() => dispatch({ type: 'CLOSE_STOCK_MODAL' })}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Update
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen ? (
          <div
            ref={deleteModalOverlayRef}
            className="modal-backdrop"
            role="presentation"
          >
            <motion.div
              ref={deleteModalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="modal-box"
              style={{ maxWidth: '400px' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-product-title"
            >
              <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--danger-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <AlertTriangle size={24} color="var(--danger)" />
                </div>
                <h2
                  id="delete-product-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    margin: '0 0 8px',
                    color: 'var(--text-primary)',
                  }}
                >
                  Delete product?
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  Are you sure you want to delete {getVisibleProductName(deletingProduct?.name)}? This action cannot be undone.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => {
                    dispatch({ type: 'CLOSE_DELETE_MODAL' });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ flex: 1 }}
                  onClick={handleDeleteProduct}
                  disabled={isDeletingProduct}
                >
                  {isDeletingProduct ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <CreateProductModal
        isOpen={isCreateModalOpen}
        onClose={() => dispatch({ type: 'CLOSE_CREATE_MODAL' })}
        onSuccess={() => fetchProducts()}
      />
    </div>
  );
};

export default Products;
