import React, { useEffect, useRef, useState } from 'react';
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
  const best = deepCandidates
    .map((arr) => arr.filter(isProductLike))
    .sort((a, b) => b.length - a.length)[0];

  return best || [];
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value || 0);

const PRODUCT_PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='18' fill='%231a1a1a'/%3E%3Crect x='20' y='20' width='120' height='120' rx='14' fill='%232a2a2a' stroke='%23404040'/%3E%3Cpath d='M52 102l20-24 14 16 18-24 18 32H52z' fill='%23f97316' opacity='.8'/%3E%3Ccircle cx='62' cy='58' r='10' fill='%23f97316' opacity='.9'/%3E%3C/svg%3E";

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryNameById, setCategoryNameById] = useState<Record<string, string>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const limit = 10;

  const deleteModalOverlayRef = useRef<HTMLDivElement>(null);
  const deleteModalContentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

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

  const getCategoryLabel = (product: any): string => {
    if (product?.category && typeof product.category === 'object') {
      return product.category.name || product.category._id || 'Unknown Category';
    }
    if (typeof product?.category === 'string') {
      return categoryNameById[product.category] || product.category;
    }
    return 'Unknown Category';
  };

  const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(
      (el: any) => !el.hasAttribute('disabled')
    ) as HTMLElement[];
  };

  const fetchCategoryLookup = async () => {
    const endpoints = ['/admin/categories', '/categories', '/categories/all'];
    const merged: Record<string, string> = {};
    for (const endpoint of endpoints) {
      try {
        const response = await apiClient.get(endpoint);
        Object.assign(merged, extractCategoriesFromPayload(response.data));
      } catch {
        // Try next endpoint variant.
      }
    }
    if (Object.keys(merged).length > 0) {
      setCategoryNameById((prev) => ({ ...prev, ...merged }));
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    productType: 'stocked',
    stock: 0,
    basePrice: 0,
    image: null as File | null,
  });

  const [stockData, setStockData] = useState({
    quantity: 0,
    operation: 'add' as 'add' | 'subtract',
  });

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get<any>('/admin/products', {
        params: { page, limit }
      });

      const productsList = extractProducts(response.data);
      const count = extractTotalProducts(response.data, productsList.length);

      const mappedCategories: Record<string, string> = {};
      productsList.forEach((product: any) => {
        if (product?.category && typeof product.category === 'object') {
          if (typeof product.category._id === 'string' && typeof product.category.name === 'string') {
            mappedCategories[product.category._id] = product.category.name;
          }
        }
      });

      setProducts(productsList);
      setTotalCount(count);
      if (Object.keys(mappedCategories).length > 0) {
        setCategoryNameById((prev) => ({ ...prev, ...mappedCategories }));
      }
    } catch (error) {
      console.error('Error fetching products', error);
      toast.error('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [page]);

  useEffect(() => {
    fetchCategoryLookup();
  }, []);

  useEffect(() => {
    if (!isDeleteModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDeleteModalOpen(false);
        setDeletingProduct(null);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        deleteModalOverlayRef.current &&
        event.target === deleteModalOverlayRef.current
      ) {
        setIsDeleteModalOpen(false);
        setDeletingProduct(null);
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
        setIsModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isModalOpen]);

  useEffect(() => {
    if (!isStockModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsStockModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isStockModalOpen]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name || '',
        description: product.description || '',
        category: typeof product.category === 'object' && product.category !== null ? ((product.category as any)?._id || '') : (product.category || ''),
        productType: product.productType || 'stocked',
        stock: product.stock || 0,
        basePrice: product.basePrice || 0,
        image: null,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        category: '',
        productType: 'stocked',
        stock: 0,
        basePrice: 0,
        image: null,
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (value instanceof File) {
          data.append(key, value);
        } else {
          data.append(key, String(value));
        }
      }
    });

    try {
      if (editingProduct) {
        await apiClient.patch(`/admin/products/${editingProduct._id}`, data);
        toast.success('Product updated successfully');
      } else {
        await apiClient.post('/admin/products', data);
        toast.success('Product created successfully');
      }
      setIsModalOpen(false);
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
      setIsStockModalOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Stock update failed');
    }
  };

  const handleOpenDeleteModal = (product: Product) => {
    setDeletingProduct(product);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct?._id) return;

    setIsDeletingProduct(true);
    try {
      await deleteProduct(deletingProduct._id);
      toast.success('Product deleted');
      setIsDeleteModalOpen(false);
      setDeletingProduct(null);
      await fetchProducts();
    } catch {
      toast.error('Failed to delete product');
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="page-wrapper">
      <div style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 className="page-title">Products</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Review inventory, pricing, and stock changes across the catalog.
          </p>
        </div>

        <div className="toolbar-row" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Product Inventory
            </h2>
          </div>

          <button type="button" onClick={() => setIsCreateModalOpen(true)} className="btn-primary">
            <Plus size={18} />
            <span>Create Product</span>
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 'inherit' }}>
            <table className="data-table">
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
                  products.map((product) => (
                    <tr key={product._id} className="group">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img
                            src={getProductImageUrl(product) || PRODUCT_PLACEHOLDER_IMAGE}
                            alt={product.name}
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
                              {product.name}
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
                            setStockProduct(product);
                            setStockData({ quantity: 0, operation: 'add' });
                            setIsStockModalOpen(true);
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

          {totalPages > 1 ? (
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
                  onClick={() => setPage((previous) => previous - 1)}
                >
                  <ChevronLeft size={15} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={page === totalPages}
                  onClick={() => setPage((previous) => previous + 1)}
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
          <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
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
                    {editingProduct ? 'Edit Product' : 'Create Product'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
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
                    <label className="form-label">Product name</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Description</label>
                    <textarea
                      required
                      rows={3}
                      className="input-field"
                      value={formData.description}
                      onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={formData.category}
                      onChange={(event) => setFormData({ ...formData, category: event.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Product type</label>
                    <select
                      className="input-field"
                      value={formData.productType}
                      onChange={(event) =>
                        setFormData({ ...formData, productType: event.target.value as any })
                      }
                    >
                      <option value="stocked">Stocked</option>
                      <option value="on_demand">On Demand</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Initial stock</label>
                    <input
                      type="number"
                      required
                      className="input-field"
                      value={formData.stock}
                      onChange={(event) =>
                        setFormData({ ...formData, stock: parseInt(event.target.value, 10) || 0 })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Base price</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      className="input-field"
                      value={formData.basePrice}
                      onChange={(event) =>
                        setFormData({ ...formData, basePrice: parseFloat(event.target.value) || 0 })
                      }
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Product image</label>
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
                        type="file"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          opacity: 0,
                          cursor: 'pointer',
                        }}
                        onChange={(event) =>
                          setFormData({ ...formData, image: event.target.files?.[0] || null })
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
                  <button type="button" className="btn-ghost" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingProduct ? 'Save Changes' : 'Create Product'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isStockModalOpen ? (
          <div className="modal-backdrop" onClick={() => setIsStockModalOpen(false)}>
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
                    onClick={() => setIsStockModalOpen(false)}
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
                      {stockProduct?.name}
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                      Current stock: {stockProduct?.stock}
                    </p>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Operation</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setStockData({ ...stockData, operation: 'add' })}
                      className={stockData.operation === 'add' ? 'btn-primary' : 'btn-ghost'}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setStockData({ ...stockData, operation: 'subtract' })}
                      className={stockData.operation === 'subtract' ? 'btn-danger' : 'btn-ghost'}
                    >
                      Subtract
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Quantity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="input-field"
                    value={stockData.quantity}
                    onChange={(event) =>
                      setStockData({ ...stockData, quantity: parseInt(event.target.value, 10) || 0 })
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
                  <button type="button" className="btn-ghost" onClick={() => setIsStockModalOpen(false)}>
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
                  Are you sure you want to delete {deletingProduct?.name}? This action cannot be undone.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletingProduct(null);
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
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => fetchProducts()}
      />
    </div>
  );
};

export default Products;
