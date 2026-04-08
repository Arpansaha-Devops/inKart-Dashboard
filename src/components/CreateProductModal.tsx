
import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { createProduct } from '../services/productService';
import api from '../lib/api';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormErrors {
  name?: string;
  price?: string;
  description?: string;
  category?: string;
  productType?: string;
  stock?: string;
  images?: string;
  basePrice?: string;
}

interface CategoryLookupItem {
  _id: string;
  name: string;
}

const CreateProductModal: React.FC<CreateProductModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productType, setProductType] = useState<'stocked' | 'on_demand'>('stocked');
  const [stock, setStock] = useState<number>(0);
  const [basePrice, setBasePrice] = useState<number>(0);
  const [images, setImages] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [knownCategories, setKnownCategories] = useState<CategoryLookupItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryListId = 'known-category-names';

  const isObjectId = (value: string) => /^[0-9a-fA-F]{24}$/.test(value.trim());

  const extractCategoriesFromPayload = (payload: any): CategoryLookupItem[] => {
    const items: CategoryLookupItem[] = [];
    const visit = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== 'object') return;

      if (typeof node._id === 'string' && typeof node.name === 'string') {
        items.push({ _id: node._id, name: node.name });
      }

      if (node.category && typeof node.category === 'object') {
        if (typeof node.category._id === 'string' && typeof node.category.name === 'string') {
          items.push({ _id: node.category._id, name: node.category.name });
        }
      }

      Object.values(node).forEach(visit);
    };

    visit(payload);

    const uniqueById = new Map<string, CategoryLookupItem>();
    items.forEach((item) => {
      if (item._id && item.name && !uniqueById.has(item._id)) {
        uniqueById.set(item._id, item);
      }
    });
    return Array.from(uniqueById.values());
  };

  const fetchKnownCategories = async () => {
    const categoryEndpoints = ['/admin/categories', '/categories', '/categories/all'];
    const aggregated: CategoryLookupItem[] = [];
    try {
      for (const endpoint of categoryEndpoints) {
        try {
          const response = await api.get(endpoint);
          aggregated.push(...extractCategoriesFromPayload(response.data));
        } catch {
          // Try next endpoint variant.
        }
      }

      if (aggregated.length === 0) {
        const response = await api.get('/admin/products', {
          params: { page: 1, limit: 200 },
        });
        aggregated.push(...extractCategoriesFromPayload(response.data));
      }

      const unique = new Map<string, CategoryLookupItem>();
      aggregated.forEach((item) => {
        if (!unique.has(item._id)) {
          unique.set(item._id, item);
        }
      });

      setKnownCategories(Array.from(unique.values()));
    } catch {
      setKnownCategories([]);
    }
  };

  const resolveCategoryId = (input: string): string | null => {
    const normalized = input.trim();
    if (!normalized) return null;
    if (isObjectId(normalized)) return normalized;

    const match = knownCategories.find(
      (entry) => entry.name.trim().toLowerCase() === normalized.toLowerCase(),
    );
    return match?._id ?? null;
  };

  useEffect(() => {
    if (isOpen) {
      fetchKnownCategories();
    }
  }, [isOpen]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Product name is required';
    }
    if (!price || price <= 0) {
      newErrors.price = 'Price must be greater than 0';
    }
    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (!category.trim()) {
      newErrors.category = 'Category is required';
    }
    if (productType === 'stocked' && (stock === undefined || stock < 0)) {
      newErrors.stock = 'Stock must be 0 or greater';
    }
    if (!basePrice || basePrice <= 0) {
      newErrors.basePrice = 'Base price must be greater than 0';
    }
    if (!images) {
      newErrors.images = 'Product image is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleImageChange = (file: File | null) => {
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, images: 'Only JPG, PNG, and WebP files are allowed' }));
        // Clear the file input so user can reselect the same file
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
      setImages(file);
      setImagePreview(URL.createObjectURL(file));
      setErrors(prev => ({ ...prev, images: undefined }));
    }
  };

  const resetForm = () => {
    setName('');
    setPrice(0);
    setDescription('');
    setCategory('');
    setProductType('stocked');
    setStock(0);
    setBasePrice(0);
    setImages(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setErrors({});
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const resolvedCategoryId = resolveCategoryId(category);
    if (!resolvedCategoryId) {
      setErrors((prev) => ({
        ...prev,
        category:
          'Category not recognized. Use an existing category name or paste its 24-character category ID.',
      }));
      return;
    }

    setIsSubmitting(true);

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Session expired. Please login again.');
      localStorage.clear();
      window.location.href = '/login';
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('price', String(price));
    formData.append('description', description);
    formData.append('category', resolvedCategoryId);
    formData.append('productType', productType);
    if (productType === 'stocked') {
      formData.append('stock', String(stock));
    }
   formData.append('image', images!);
    formData.append('basePrice', String(basePrice));

    try {
      await createProduct(formData);
      toast.success('Product created successfully!');
      resetForm();
      onClose();
      onSuccess();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to create product';
      if (error.response?.status === 401) {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageChange(file);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col"
          >
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
              <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-primary text-white flex-shrink-0">
                <h3 className="text-base sm:text-xl font-bold truncate">Create New Product</h3>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    className={`input-field text-base sm:text-sm ${errors.name ? 'border-red-500 focus:ring-red-500' : ''}`}
                    placeholder="Enter product name..."
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                    }}
                  />
                  {errors.name && (
                    <p className="text-red-500 text-xs mt-1">{errors.name}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                      Price <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">{'\u20B9'}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isSubmitting}
                        className={`input-field pl-8 text-base sm:text-sm ${errors.price ? 'border-red-500 focus:ring-red-500' : ''}`}
                        placeholder="0.00"
                        value={price || ''}
                        onChange={(e) => {
                          setPrice(parseFloat(e.target.value) || 0);
                          if (errors.price) setErrors(prev => ({ ...prev, price: undefined }));
                        }}
                      />
                    </div>
                    {errors.price && (
                      <p className="text-red-500 text-xs mt-1">{errors.price}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                      Base Price <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">{'\u20B9'}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isSubmitting}
                        className={`input-field pl-8 text-base sm:text-sm ${errors.basePrice ? 'border-red-500 focus:ring-red-500' : ''}`}
                        placeholder="0.00"
                        value={basePrice || ''}
                        onChange={(e) => {
                          setBasePrice(parseFloat(e.target.value) || 0);
                          if (errors.basePrice) setErrors(prev => ({ ...prev, basePrice: undefined }));
                        }}
                      />
                    </div>
                    {errors.basePrice && (
                      <p className="text-red-500 text-xs mt-1">{errors.basePrice}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    disabled={isSubmitting}
                    className={`input-field text-base sm:text-sm ${errors.description ? 'border-red-500 focus:ring-red-500' : ''}`}
                    placeholder="Enter product description..."
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (errors.description) setErrors(prev => ({ ...prev, description: undefined }));
                    }}
                  />
                  {errors.description && (
                    <p className="text-red-500 text-xs mt-1">{errors.description}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list={categoryListId}
                    disabled={isSubmitting}
                    className={`input-field text-base sm:text-sm ${errors.category ? 'border-red-500 focus:ring-red-500' : ''}`}
                    placeholder="Type existing category name (or paste category ID)"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      if (errors.category) setErrors(prev => ({ ...prev, category: undefined }));
                    }}
                  />
                  <datalist id={categoryListId}>
                    {knownCategories.map((entry) => (
                      <option key={entry._id} value={entry.name} />
                    ))}
                  </datalist>
                  {errors.category && (
                    <p className="text-red-500 text-xs mt-1">{errors.category}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                      Product Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      disabled={isSubmitting}
                      className="input-field text-base sm:text-sm"
                      value={productType}
                      onChange={(e) => {
                        setProductType(e.target.value as 'stocked' | 'on_demand');
                        // Clear stock error when switching product type
                        setErrors(prev => ({ ...prev, stock: undefined }));
                      }}
                    >
                      <option value="stocked">Stocked</option>
                      <option value="on_demand">On Demand</option>
                    </select>
                  </div>

                  {productType === 'stocked' && (
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                        Stock Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        disabled={isSubmitting}
                        placeholder="0"
                        className={`input-field text-base sm:text-sm ${errors.stock ? 'border-red-500 focus:ring-red-500' : ''}`}
                        value={stock}
                        onChange={(e) => {
                          setStock(parseInt(e.target.value, 10) || 0);
                          if (errors.stock) setErrors(prev => ({ ...prev, stock: undefined }));
                        }}
                      />
                      {errors.stock && (
                        <p className="text-red-500 text-xs mt-1">{errors.stock}</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Product Image <span className="text-red-500">*</span>
                  </label>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => !isSubmitting && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 sm:p-6 text-center transition-all cursor-pointer ${
                      errors.images ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-accent'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''} min-h-[120px] sm:min-h-[150px] flex flex-col items-center justify-center`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={isSubmitting}
                      onChange={(e) => handleImageChange(e.target.files?.[0] || null)}
                    />
                    {imagePreview ? (
                      <div className="space-y-1 sm:space-y-2 w-full">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="mx-auto max-h-24 sm:max-h-32 rounded-lg object-contain"
                        />
                        <p className="text-xs sm:text-sm text-gray-500 truncate">{images?.name}</p>
                        <p className="text-xs text-accent">Click or drag to replace</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="text-gray-400 mb-2 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6" />
                        <p className="text-xs sm:text-sm text-gray-500">Click or drag image to upload</p>
                        <p className="text-xs text-gray-400 mt-1">JPG, PNG, or WebP</p>
                      </>
                    )}
                  </div>
                  {errors.images && (
                    <p className="text-red-500 text-xs mt-1">{errors.images}</p>
                  )}
                </div>
              </div>

              <div className="p-3 sm:p-4 bg-gray-50 flex justify-end gap-2 flex-shrink-0 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-3 sm:px-4 py-2 sm:py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium text-xs sm:text-sm disabled:opacity-50 min-h-[40px] sm:min-h-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 sm:px-6 py-2 sm:py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-colors font-medium flex items-center gap-1 sm:gap-2 text-xs sm:text-sm disabled:opacity-50 min-h-[40px] sm:min-h-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin flex-shrink-0" size={16} />
                      <span className="hidden sm:inline">Creating...</span>
                    </>
                  ) : (
                    'Create Product'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CreateProductModal;
