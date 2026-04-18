import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { createProduct } from '../services/productService';
import apiClient from '../lib/apiClient';

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
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const categoryListId = 'known-category-names';

  const isObjectId = (value: string) => /^[0-9a-fA-F]{24}$/.test(value.trim());

  const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(
      (element: any) => !element.hasAttribute('disabled')
    ) as HTMLElement[];
  };

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
          const response = await apiClient.get(endpoint);
          aggregated.push(...extractCategoriesFromPayload(response.data));
        } catch {
          // Try next endpoint variant.
        }
      }

      if (aggregated.length === 0) {
        const response = await apiClient.get('/admin/products', {
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

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    const handleOverlayMouseDown = (event: MouseEvent) => {
      if (overlayRef.current && event.target === overlayRef.current) {
        handleClose();
      }
    };

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !contentRef.current) return;

      const focusableElements = getFocusableElements(contentRef.current);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    previousFocusRef.current = document.activeElement as HTMLElement;
    const focusable = contentRef.current ? getFocusableElements(contentRef.current) : [];
    focusable[0]?.focus();

    const overlay = overlayRef.current;
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);
    overlay?.addEventListener('mousedown', handleOverlayMouseDown);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
      overlay?.removeEventListener('mousedown', handleOverlayMouseDown);
      previousFocusRef.current?.focus();
    };
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
        setErrors((prev) => ({ ...prev, images: 'Only JPG, PNG, and WebP files are allowed' }));
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
      setErrors((prev) => ({ ...prev, images: undefined }));
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
      {isOpen ? (
        <div ref={overlayRef} className="modal-backdrop" role="presentation">
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="modal-box modal-box-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-product-title"
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
                  id="create-product-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  Create Product
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="action-icon-button"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Product name</label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    className="input-field"
                    style={errors.name ? { borderColor: 'var(--danger)' } : undefined}
                    placeholder="Enter product name..."
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                  />
                  {errors.name ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {errors.name}
                    </p>
                  ) : null}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Price</label>
                    <div style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-muted)',
                          fontSize: '14px',
                        }}
                      >
                        ₹
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isSubmitting}
                        className="input-field"
                        style={errors.price ? { paddingLeft: 30, borderColor: 'var(--danger)' } : { paddingLeft: 30 }}
                        placeholder="0.00"
                        value={price || ''}
                        onChange={(e) => {
                          setPrice(parseFloat(e.target.value) || 0);
                          if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
                        }}
                      />
                    </div>
                    {errors.price ? (
                      <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                        {errors.price}
                      </p>
                    ) : null}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Base price</label>
                    <div style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-muted)',
                          fontSize: '14px',
                        }}
                      >
                        ₹
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isSubmitting}
                        className="input-field"
                        style={errors.basePrice ? { paddingLeft: 30, borderColor: 'var(--danger)' } : { paddingLeft: 30 }}
                        placeholder="0.00"
                        value={basePrice || ''}
                        onChange={(e) => {
                          setBasePrice(parseFloat(e.target.value) || 0);
                          if (errors.basePrice) setErrors((prev) => ({ ...prev, basePrice: undefined }));
                        }}
                      />
                    </div>
                    {errors.basePrice ? (
                      <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                        {errors.basePrice}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description</label>
                  <textarea
                    rows={3}
                    disabled={isSubmitting}
                    className="input-field"
                    style={errors.description ? { borderColor: 'var(--danger)' } : undefined}
                    placeholder="Enter product description..."
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
                    }}
                  />
                  {errors.description ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {errors.description}
                    </p>
                  ) : null}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Category</label>
                  <input
                    type="text"
                    list={categoryListId}
                    disabled={isSubmitting}
                    className="input-field"
                    style={errors.category ? { borderColor: 'var(--danger)' } : undefined}
                    placeholder="Type existing category name (or paste category ID)"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
                    }}
                  />
                  <datalist id={categoryListId}>
                    {knownCategories.map((entry) => (
                      <option key={entry._id} value={entry.name} />
                    ))}
                  </datalist>
                  {errors.category ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {errors.category}
                    </p>
                  ) : null}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Product type</label>
                    <select
                      disabled={isSubmitting}
                      className="input-field"
                      value={productType}
                      onChange={(e) => {
                        setProductType(e.target.value as 'stocked' | 'on_demand');
                        setErrors((prev) => ({ ...prev, stock: undefined }));
                      }}
                    >
                      <option value="stocked">Stocked</option>
                      <option value="on_demand">On Demand</option>
                    </select>
                  </div>

                  {productType === 'stocked' ? (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Stock quantity</label>
                      <input
                        type="number"
                        min="0"
                        disabled={isSubmitting}
                        placeholder="0"
                        className="input-field"
                        style={errors.stock ? { borderColor: 'var(--danger)' } : undefined}
                        value={stock}
                        onChange={(e) => {
                          setStock(parseInt(e.target.value, 10) || 0);
                          if (errors.stock) setErrors((prev) => ({ ...prev, stock: undefined }));
                        }}
                      />
                      {errors.stock ? (
                        <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                          {errors.stock}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Product image</label>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => !isSubmitting && fileInputRef.current?.click()}
                    style={{
                      border: `1px dashed ${errors.images ? 'var(--danger)' : 'var(--border-active)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '24px',
                      textAlign: 'center',
                      transition: 'border-color 0.2s, background 0.2s',
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      background: errors.images ? 'var(--danger-muted)' : 'var(--bg-surface)',
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
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
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <img
                          src={imagePreview}
                          alt="Preview"
                          style={{
                            margin: '0 auto',
                            maxHeight: 128,
                            borderRadius: 12,
                            objectFit: 'contain',
                          }}
                        />
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {images?.name}
                        </p>
                        <p style={{ margin: 0, color: 'var(--accent)', fontSize: '12px' }}>
                          Click or drag to replace
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px', justifyItems: 'center' }}>
                        <Upload size={24} color="var(--text-muted)" />
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                          Click or drag image to upload
                        </p>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                          JPG, PNG, or WebP
                        </p>
                      </div>
                    )}
                  </div>
                  {errors.images ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {errors.images}
                    </p>
                  ) : null}
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
                <button type="button" onClick={handleClose} disabled={isSubmitting} className="btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Creating...
                    </>
                  ) : (
                    'Create Product'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

export default CreateProductModal;
