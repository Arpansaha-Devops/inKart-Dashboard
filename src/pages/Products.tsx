import React, { useEffect, useState } from 'react';
import apiClient from '../lib/apiClient';
import { PaginatedResponse, Product } from '../types';
import { Search, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, X, Upload, Package } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import CreateProductModal from '../components/CreateProductModal';

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryNameById, setCategoryNameById] = useState<Record<string, string>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const limit = 10;

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
      
      let productsList: Product[] = [];
      let count = 0;

      if (Array.isArray(response.data)) {
        productsList = response.data;
        count = response.data.length;
      } else if (response.data && typeof response.data === 'object') {
        const findArray = (obj: any): any[] | null => {
          if (Array.isArray(obj)) return obj;
          if (!obj || typeof obj !== 'object') return null;
          
          const commonKeys = ['data', 'products', 'results', 'items', 'list', 'inventory'];
          for (const key of commonKeys) {
            if (Array.isArray(obj[key])) return obj[key];
          }
          
          for (const key in obj) {
            const result = findArray(obj[key]);
            if (result) return result;
          }
          return null;
        };

        productsList = findArray(response.data) || [];

        const findCount = (obj: any): number | null => {
          if (!obj || typeof obj !== 'object') return null;
          const countKeys = ['totalCount', 'total', 'count', 'totalResults', 'length'];
          for (const key of countKeys) {
            if (typeof obj[key] === 'number') return obj[key];
          }
          for (const key in obj) {
            const result = findCount(obj[key]);
            if (result !== null) return result;
          }
          return null;
        };

        count = findCount(response.data) ?? productsList.length;
      }

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

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Product Inventory</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary flex items-center gap-2 bg-accent"
        >
          <Plus size={20} /> Create Product
        </button>
      </div>

      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Stock</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="h-12 bg-gray-100 rounded w-full"></div>
                    </td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No products found. Start by adding one!
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={getProductImageUrl(product)}
                          alt={product.name}
                          className="w-14 h-14 rounded-lg object-contain bg-gray-100 p-1"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[200px]">{product.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {getCategoryLabel(product)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        product.productType === 'stocked' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {product.productType ? String(product.productType).replace('_', ' ') : 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <button
                        onClick={() => {
                          setStockProduct(product);
                          setStockData({ quantity: 0, operation: 'add' });
                          setIsStockModalOpen(true);
                        }}
                        className={`font-bold hover:underline ${product.stock < 10 ? 'text-red-500' : 'text-gray-900'}`}
                      >
                        {product.stock}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">${product.basePrice}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(product)}
                          className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
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

        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent"
            >
              <ChevronLeft size={18} /> Previous
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                    page === i + 1 ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent"
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Product Create/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
            >
              <form onSubmit={handleSubmit}>
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-primary text-white">
                  <h3 className="text-xl font-bold">{editingProduct ? 'Edit Product' : 'Create New Product'}</h3>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      required
                      rows={3}
                      className="input-field"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                    <select
                      className="input-field"
                      value={formData.productType}
                      onChange={(e) => setFormData({ ...formData, productType: e.target.value as any })}
                    >
                      <option value="stocked">Stocked</option>
                      <option value="on_demand">On Demand</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock</label>
                    <input
                      type="number"
                      required
                      className="input-field"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Base Price ($)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      className="input-field"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Image</label>
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-accent transition-all cursor-pointer relative">
                      <input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => setFormData({ ...formData, image: e.target.files?.[0] || null })}
                      />
                      <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                      <p className="text-sm text-gray-500">
                        {formData.image ? formData.image.name : 'Click or drag image to upload'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-gray-50 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <form onSubmit={handleUpdateStock}>
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-primary text-white">
                  <h3 className="text-lg font-bold">Update Stock</h3>
                  <button type="button" onClick={() => setIsStockModalOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                    <Package className="text-accent" size={24} />
                    <div>
                      <p className="text-sm font-bold">{stockProduct?.name}</p>
                      <p className="text-xs text-gray-500">Current Stock: {stockProduct?.stock}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Operation</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStockData({ ...stockData, operation: 'add' })}
                        className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                          stockData.operation === 'add' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockData({ ...stockData, operation: 'subtract' })}
                        className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                          stockData.operation === 'subtract' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        Subtract
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      required
                      min="1"
                      className="input-field"
                      value={stockData.quantity}
                      onChange={(e) => setStockData({ ...stockData, quantity: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="p-6 bg-gray-50 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsStockModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium"
                  >
                    Update
                  </button>
                </div>
              </form>
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
