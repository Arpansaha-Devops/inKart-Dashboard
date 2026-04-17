import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../lib/apiClient';
import { Product } from '../types';
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight, X, Upload, Package, AlertTriangle } from 'lucide-react';
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

    return 'https://picsum.photos/seed/product/100/100';
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
      setCategoryNameById(prev => ({ ...prev, ...merged }));
    }
  };

  // Form states
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
        setCategoryNameById(prev => ({ ...prev, ...mappedCategories }));
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
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Product Inventory</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary flex items-center justify-center gap-2 bg-accent w-full sm:w-auto py-2.5 sm:py-2 text-sm sm:text-base min-h-[44px] sm:min-h-auto"
        >
          <Plus size={20} /> Create Product
        </button>
      </div>

      <div className="card overflow-hidden !p-0 border-0 shadow-sm">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="inline-block min-w-full">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Product</th>
                  <th className="hidden sm:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Category</th>
                  <th className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Type</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">Stock</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Price</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-3 sm:px-4 md:px-6 py-4">
                        <div className="h-12 bg-gray-100 rounded w-full"></div>
                      </td>
                    </tr>
                  ))
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 sm:px-4 md:px-6 py-8 sm:py-12 text-center text-gray-500 text-sm sm:text-base">
                      No products found. Start by adding one!
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                          <img
                            src={getProductImageUrl(product)}
                            alt={product.name}
                            className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg object-contain bg-gray-100 p-1 flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{product.name}</p>
                            <p className="text-xs text-gray-500 truncate hidden sm:block max-w-[150px] md:max-w-[200px]">{product.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600">
                        {getCategoryLabel(product)}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                          product.productType === 'stocked' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {product.productType ? String(product.productType).replace('_', ' ') : 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-center">
                        <button
                          onClick={() => {
                            setStockProduct(product);
                            setStockData({ quantity: 0, operation: 'add' });
                            setIsStockModalOpen(true);
                          }}
                          className={`w-full min-h-[40px] sm:min-h-auto font-bold hover:underline cursor-pointer ${product.stock < 10 ? 'text-red-500' : 'text-gray-900'}`}
                        >
                          {product.stock}
                        </button>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold text-gray-900">
                        <span className="hidden sm:inline">${product.basePrice}</span>
                        <span className="sm:hidden">${product.basePrice}</span>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
                            aria-label="Edit product"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleOpenDeleteModal(product)}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
                            aria-label="Delete product"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 overflow-x-auto">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <ChevronLeft size={16} className="sm:w-4 sm:h-4" /> 
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const pageNum = totalPages > 5 ? (page > 3 ? page - 2 + i : i + 1) : i + 1;
                if (pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
                      page === pageNum ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={16} className="sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Product Create/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <form onSubmit={handleSubmit} className="flex flex-col h-full">
                <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-primary text-white flex-shrink-0">
                  <h3 className="text-base sm:text-xl font-bold truncate">{editingProduct ? 'Edit Product' : 'Create New Product'}</h3>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-auto sm:min-w-auto">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 overflow-y-auto flex-1">
                  <div className="md:col-span-2">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Product Name</label>
                    <input
                      type="text"
                      required
                      className="input-field text-sm sm:text-base"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      required
                      rows={3}
                      className="input-field text-sm sm:text-base"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      required
                      className="input-field text-sm sm:text-base"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Product Type</label>
                    <select
                      className="input-field text-sm sm:text-base"
                      value={formData.productType}
                      onChange={(e) => setFormData({ ...formData, productType: e.target.value as any })}
                    >
                      <option value="stocked">Stocked</option>
                      <option value="on_demand">On Demand</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Initial Stock</label>
                    <input
                      type="number"
                      required
                      className="input-field text-sm sm:text-base"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Base Price ($)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      className="input-field text-sm sm:text-base"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Product Image</label>
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 sm:p-8 text-center hover:border-accent transition-all cursor-pointer relative">
                      <input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => setFormData({ ...formData, image: e.target.files?.[0] || null })}
                      />
                      <Upload className="mx-auto text-gray-400 mb-2 w-8 h-8" />
                      <p className="text-xs sm:text-sm text-gray-500">
                        {formData.image ? formData.image.name : 'Click or drag image to upload'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-4 sm:p-6 bg-gray-50 flex justify-end gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 sm:py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm sm:text-base min-h-[44px] sm:min-h-auto"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 sm:py-2 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium text-sm sm:text-base min-h-[44px] sm:min-h-auto"
                  >
                    {editingProduct ? 'Save Changes' : 'Create Product'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock Update Modal */}
      <AnimatePresence>
        {isStockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <form onSubmit={handleUpdateStock}>
                <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-primary text-white">
                  <h3 className="text-base sm:text-lg font-bold truncate">Update Stock</h3>
                  <button type="button" onClick={() => setIsStockModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-auto sm:min-w-auto">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                    <Package className="text-accent flex-shrink-0 w-6 h-6" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{stockProduct?.name}</p>
                      <p className="text-xs text-gray-500">Current Stock: {stockProduct?.stock}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Operation</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStockData({ ...stockData, operation: 'add' })}
                        className={`py-2 rounded-lg text-xs sm:text-sm font-bold border transition-all min-h-[44px] sm:min-h-auto ${
                          stockData.operation === 'add' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockData({ ...stockData, operation: 'subtract' })}
                        className={`py-2 rounded-lg text-xs sm:text-sm font-bold border transition-all min-h-[44px] sm:min-h-auto ${
                          stockData.operation === 'subtract' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        Subtract
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      required
                      min="1"
                      className="input-field text-sm sm:text-base"
                      value={stockData.quantity}
                      onChange={(e) => setStockData({ ...stockData, quantity: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="p-4 sm:p-6 bg-gray-50 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsStockModalOpen(false)}
                    className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 min-h-[44px] sm:min-h-auto flex items-center justify-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 sm:py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium text-sm sm:text-base min-h-[44px] sm:min-h-auto"
                  >
                    Update
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Product Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div
            ref={deleteModalOverlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="presentation"
          >
            <motion.div
              ref={deleteModalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-product-title"
            >
              <div className="p-6">
                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
                </div>
                <h3 id="delete-product-title" className="text-lg sm:text-xl font-semibold text-center text-gray-900 mb-2">
                  Delete product
                </h3>
                <p className="text-center text-gray-500 text-sm mb-6">
                  Are you sure you want to delete <strong>{deletingProduct?.name}</strong>? This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setDeletingProduct(null);
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteProduct}
                    disabled={isDeletingProduct}
                    className="flex-1 px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {isDeletingProduct && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Product Modal */}
      <CreateProductModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => fetchProducts()}
      />
    </div>
  );
};

export default Products;
