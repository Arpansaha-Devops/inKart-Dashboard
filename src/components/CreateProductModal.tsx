import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X, Upload, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createProduct } from '../services/productService';
import apiClient from '../lib/apiClient';
import {
  formatProductImageBytes,
  optimizeProductImages,
  PRODUCT_IMAGE_TYPES,
} from '../lib/productImages';
import { setUniqueProductSlug } from '../lib/productSlugs';
import type { QuantityPricingTier } from '../types';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdProductPayload?: unknown) => void;
}

interface FormErrors {
  name?: string;
  price?: string;
  description?: string;
  category?: string;
  images?: string;
  basePrice?: string;
  stock?: string;
  quantityPricing?: string;
}

interface CategoryLookupItem {
  _id: string;
  name: string;
  isActive: boolean;
}

type QuantityPricingTierForm = QuantityPricingTier & {
  id: string;
};

type CreateProductFormState = {
  name: string;
  price: number;
  description: string;
  category: string;
  basePrice: number;
  productType: 'stocked' | 'on_demand';
  stock: number;
  isCustomizable: boolean;
  quantityPricing: QuantityPricingTierForm[];
  errors: FormErrors;
  isSubmitting: boolean;
  knownCategories: CategoryLookupItem[];
};

type CreateProductFormAction =
  | { type: 'SET_FIELD'; payload: Partial<CreateProductFormState> }
  | { type: 'SET_ERRORS'; payload: FormErrors | ((previous: FormErrors) => FormErrors) }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_KNOWN_CATEGORIES'; payload: CategoryLookupItem[] }
  | { type: 'RESET_FORM' };

const createProductFormInitialState: CreateProductFormState = {
  name: '',
  price: 0,
  description: '',
  category: '',
  basePrice: 0,
  productType: 'on_demand',
  stock: 0,
  isCustomizable: true,
  quantityPricing: [{ id: 'tier-1', minQty: 1, pricePerUnit: 0 }],
  errors: {},
  isSubmitting: false,
  knownCategories: [],
};

function createProductFormReducer(
  state: CreateProductFormState,
  action: CreateProductFormAction
): CreateProductFormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, ...action.payload };
    case 'SET_ERRORS':
      return {
        ...state,
        errors:
          typeof action.payload === 'function'
            ? action.payload(state.errors)
            : action.payload,
      };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload };
    case 'SET_KNOWN_CATEGORIES':
      return { ...state, knownCategories: action.payload };
    case 'RESET_FORM':
      return { ...createProductFormInitialState, knownCategories: state.knownCategories };
    default:
      return state;
  }
}

const getCreateProductErrorMessage = (error: any): string => {
  const message = error?.response?.data?.message || '';

  if (error?.response?.status === 413) {
    return 'The product images are too large for the server. Please remove an image or choose smaller files.';
  }

  if (
    error?.response?.status === 409 ||
    /duplicate key|E11000|name_1|slug_1/i.test(message)
  ) {
    return 'Could not create this product because the server rejected it as a duplicate.';
  }

  return message || 'Failed to create product';
};

const isObjectId = (value: string) => /^[0-9a-fA-F]{24}$/.test(value.trim());

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter(
    (element: any) => !element.hasAttribute('disabled')
  ) as HTMLElement[];
};

const handleDragOver = (event: React.DragEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const sortQuantityPricing = (tiers: QuantityPricingTier[]) =>
  [...tiers].sort((a, b) => a.minQty - b.minQty);

const validateQuantityPricing = (tiers: QuantityPricingTier[]): string | null => {
  if (tiers.length === 0) {
    return 'Add at least one pricing tier';
  }

  if (tiers.some((tier) => !Number.isInteger(tier.minQty) || tier.minQty <= 0)) {
    return 'Min quantity must be a positive whole number for every tier';
  }

  if (tiers.some((tier) => !Number.isFinite(tier.pricePerUnit) || tier.pricePerUnit <= 0)) {
    return 'Price per unit must be greater than 0 for every tier';
  }

  const minQtyValues = new Set<number>();
  for (const tier of tiers) {
    if (minQtyValues.has(tier.minQty)) {
      return 'Pricing tiers cannot use duplicate min quantities';
    }
    minQtyValues.add(tier.minQty);
  }

  if (sortQuantityPricing(tiers)[0]?.minQty !== 1) {
    return 'The first pricing tier must start at min quantity 1';
  }

  return null;
};

const CreateProductModal: React.FC<CreateProductModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(
    createProductFormReducer,
    createProductFormInitialState
  );
  const {
    name,
    price,
    description,
    category,
    basePrice,
    productType,
    stock,
    isCustomizable,
    quantityPricing,
    errors,
    isSubmitting,
    knownCategories,
  } = state;
  const [images, setImages] = useState<File[]>([]);
  const [imagePreview, setImagePreview] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const handleCloseRef = useRef<() => void>(() => {});
  const isOpenRef = useRef(isOpen);
  const categoryListId = 'known-category-names';

  const extractCategoriesFromPayload = useCallback((payload: any): CategoryLookupItem[] => {
    const items: CategoryLookupItem[] = [];
    const visit = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== 'object') return;

      if (
        typeof node._id === 'string' &&
        typeof node.name === 'string' &&
        node.isActive === true
      ) {
        items.push({ _id: node._id, name: node.name, isActive: true });
      }

      if (node.category && typeof node.category === 'object') {
        if (
          typeof node.category._id === 'string' &&
          typeof node.category.name === 'string' &&
          node.category.isActive === true
        ) {
          items.push({ _id: node.category._id, name: node.category.name, isActive: true });
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
  }, []);

  const fetchKnownCategories = useCallback(async () => {
    const categoryEndpoints = ['/admin/categories', '/categories'];
    try {
      let aggregated: CategoryLookupItem[] = [];

      for (const endpoint of categoryEndpoints) {
        try {
          const response = await apiClient.get(endpoint);
          aggregated = extractCategoriesFromPayload(response.data);
          if (aggregated.length > 0) break;
        } catch (error: any) {
          if (error?.response?.status !== 404) throw error;
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

      dispatch({ type: 'SET_KNOWN_CATEGORIES', payload: Array.from(unique.values()) });
    } catch {
      dispatch({ type: 'SET_KNOWN_CATEGORIES', payload: [] });
    }
  }, [extractCategoriesFromPayload]);

  const resolveCategoryId = (input: string): string | null => {
    const normalized = input.trim();
    if (!normalized) return null;
    if (isObjectId(normalized)) {
      if (knownCategories.length === 0) return normalized;
      return knownCategories.some((entry) => entry._id === normalized) ? normalized : null;
    }

    const match = knownCategories.find(
      (entry) => entry.name.trim().toLowerCase() === normalized.toLowerCase(),
    );
    return match?._id ?? null;
  };

  useEffect(() => {
    if (isOpen) {
      fetchKnownCategories();
    }
  }, [fetchKnownCategories, isOpen]);

  const validate = (): QuantityPricingTier[] | null => {
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
    if (!basePrice || basePrice <= 0) {
      newErrors.basePrice = 'Base price must be greater than 0';
    }
    if (stock < 0) {
      newErrors.stock = 'Stock cannot be negative';
    }
    if (images.length === 0) {
      newErrors.images = 'At least one product image is required';
    }

    const pricingTiers = quantityPricing.map(({ minQty, pricePerUnit }) => ({
      minQty,
      pricePerUnit,
    }));
    const quantityPricingError = validateQuantityPricing(pricingTiers);
    if (quantityPricingError) {
      newErrors.quantityPricing = quantityPricingError;
    }

    dispatch({ type: 'SET_ERRORS', payload: newErrors });
    return Object.keys(newErrors).length === 0 ? sortQuantityPricing(pricingTiers) : null;
  };

  const updatePricingTier = (
    tierId: string,
    field: 'minQty' | 'pricePerUnit',
    value: number
  ) => {
    dispatch({
      type: 'SET_FIELD',
      payload: {
        quantityPricing: quantityPricing.map((tier) =>
          tier.id === tierId ? { ...tier, [field]: value } : tier
        ),
      },
    });
    if (errors.quantityPricing) {
      dispatch({
        type: 'SET_ERRORS',
        payload: (prev) => ({ ...prev, quantityPricing: undefined }),
      });
    }
  };

  const addPricingTier = () => {
    dispatch({
      type: 'SET_FIELD',
      payload: {
        quantityPricing: [
          ...quantityPricing,
          {
            id: `tier-${Date.now()}-${quantityPricing.length}`,
            minQty: 0,
            pricePerUnit: 0,
          },
        ],
      },
    });
    if (errors.quantityPricing) {
      dispatch({
        type: 'SET_ERRORS',
        payload: (prev) => ({ ...prev, quantityPricing: undefined }),
      });
    }
  };

  const removePricingTier = (tierId: string) => {
    if (quantityPricing.length <= 1) return;
    dispatch({
      type: 'SET_FIELD',
      payload: {
        quantityPricing: quantityPricing.filter((tier) => tier.id !== tierId),
      },
    });
  };

  const movePricingTier = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= quantityPricing.length) return;
    const nextTiers = [...quantityPricing];
    [nextTiers[index], nextTiers[nextIndex]] = [nextTiers[nextIndex], nextTiers[index]];
    dispatch({ type: 'SET_FIELD', payload: { quantityPricing: nextTiers } });
  };

  const handleImageChange = (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    
    const filesToAdd: File[] = [];
    const newPreviews: string[] = [...imagePreview];
    
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      if (images.length + filesToAdd.length >= 5) {
        toast.error('Maximum 5 images allowed');
        break;
      }
      if (!PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number])) {
        toast.error(`${file.name} must be a JPG, PNG, or WebP image`);
        continue;
      }
      filesToAdd.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }
    
    if (filesToAdd.length > 0) {
      setImages([...images, ...filesToAdd]);
      setImagePreview(newPreviews);
      dispatch({
        type: 'SET_ERRORS',
        payload: (prev) => ({ ...prev, images: undefined }),
      });
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = imagePreview.filter((_, i) => i !== index);
    URL.revokeObjectURL(imagePreview[index]);
    setImages(newImages);
    setImagePreview(newPreviews);
  };

  const resetForm = useCallback(() => {
    dispatch({ type: 'RESET_FORM' });
    setImages([]);
    imagePreview.forEach((preview) => URL.revokeObjectURL(preview));
    setImagePreview([]);
  }, [imagePreview]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }, [isSubmitting, onClose, resetForm]);

  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    const focusable = contentRef.current ? getFocusableElements(contentRef.current) : [];
    focusable[0]?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (!isOpenRef.current) return;
      if (event.key === 'Escape') {
        handleCloseRef.current();
      }
    };

    const handleOverlayMouseDown = (event: MouseEvent) => {
      if (!isOpenRef.current) return;
      if (overlayRef.current && event.target === overlayRef.current) {
        handleCloseRef.current();
      }
    };

    const handleTab = (event: KeyboardEvent) => {
      if (!isOpenRef.current) return;
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

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);
    document.addEventListener('mousedown', handleOverlayMouseDown);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
      document.removeEventListener('mousedown', handleOverlayMouseDown);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const sortedPricingTiers = validate();
    if (!sortedPricingTiers) return;

    const resolvedCategoryId = resolveCategoryId(category);
    if (!resolvedCategoryId) {
      dispatch({
        type: 'SET_ERRORS',
        payload: (prev) => ({
          ...prev,
          category:
            'Category not recognized. Use an active category name or paste its 24-character active category ID.',
        }),
      });
      return;
    }

    dispatch({ type: 'SET_SUBMITTING', payload: true });

    try {
      const optimizedImages = await optimizeProductImages(images);
      const formData = new FormData();
      formData.append('name', name.trim());
      setUniqueProductSlug(formData, name);
      formData.append('price', String(price));
      formData.append('description', description);
      formData.append('category', resolvedCategoryId);
      formData.append('productType', productType);
      formData.append('stock', String(stock));
      formData.append('isCustomizable', String(isCustomizable));
      formData.append('isActive', 'true');
      optimizedImages.forEach((image) => {
        formData.append('images', image);
      });
      formData.append('basePrice', String(basePrice));
      formData.append('quantityPricing', JSON.stringify(sortedPricingTiers));

      const response = await createProduct(formData);
      toast.success('Product created successfully!');
      resetForm();
      onClose();
      onSuccess(response.data);
    } catch (error: any) {
      if (error.response?.status === 401) {
        navigate('/login');
        return;
      }
      toast.error(getCreateProductErrorMessage(error));
    } finally {
      dispatch({ type: 'SET_SUBMITTING', payload: false });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files) {
      handleImageChange(e.dataTransfer.files);
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
                  <label className="form-label" htmlFor="create-product-name">Product name</label>
                  <input
                    id="create-product-name"
                    type="text"
                    disabled={isSubmitting}
                    className="input-field"
                    style={errors.name ? { borderColor: 'var(--danger)' } : undefined}
                    placeholder="Enter product name..."
                    value={name}
                    onChange={(e) => {
                      dispatch({ type: 'SET_FIELD', payload: { name: e.target.value } });
                      if (errors.name) {
                        dispatch({
                          type: 'SET_ERRORS',
                          payload: (prev) => ({ ...prev, name: undefined }),
                        });
                      }
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
                    <label className="form-label" htmlFor="create-product-price">Price</label>
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
                        id="create-product-price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isSubmitting}
                        className="input-field"
                        style={errors.price ? { paddingLeft: 30, borderColor: 'var(--danger)' } : { paddingLeft: 30 }}
                        placeholder="0.00"
                        value={price || ''}
                        onChange={(e) => {
                          dispatch({
                            type: 'SET_FIELD',
                            payload: { price: parseFloat(e.target.value) || 0 },
                          });
                          if (errors.price) {
                            dispatch({
                              type: 'SET_ERRORS',
                              payload: (prev) => ({ ...prev, price: undefined }),
                            });
                          }
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
                    <label className="form-label" htmlFor="create-product-base-price">Base price</label>
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
                        id="create-product-base-price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isSubmitting}
                        className="input-field"
                        style={errors.basePrice ? { paddingLeft: 30, borderColor: 'var(--danger)' } : { paddingLeft: 30 }}
                        placeholder="0.00"
                        value={basePrice || ''}
                        onChange={(e) => {
                          dispatch({
                            type: 'SET_FIELD',
                            payload: { basePrice: parseFloat(e.target.value) || 0 },
                          });
                          if (errors.basePrice) {
                            dispatch({
                              type: 'SET_ERRORS',
                              payload: (prev) => ({ ...prev, basePrice: undefined }),
                            });
                          }
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

                <div
                  className="form-group"
                  style={{
                    marginBottom: 0,
                    display: 'grid',
                    gap: '12px',
                    padding: '16px',
                    border: `1px solid ${errors.quantityPricing ? 'var(--danger)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <label className="form-label" style={{ margin: 0 }}>
                      Pricing Tiers
                    </label>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={addPricingTier}
                      disabled={isSubmitting}
                    >
                      <Plus size={15} />
                      Add tier
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: '10px' }}>
                    {quantityPricing.map((tier, index) => (
                      <div
                        key={tier.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          gap: '10px',
                          alignItems: 'end',
                        }}
                      >
                        <div>
                          <label className="form-label" htmlFor={`create-tier-min-${tier.id}`}>
                            Min Quantity
                          </label>
                          <input
                            id={`create-tier-min-${tier.id}`}
                            type="number"
                            min="1"
                            step="1"
                            className="input-field"
                            disabled={isSubmitting}
                            value={tier.minQty || ''}
                            onChange={(event) =>
                              updatePricingTier(
                                tier.id,
                                'minQty',
                                Number(event.target.value) || 0
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="form-label" htmlFor={`create-tier-price-${tier.id}`}>
                            Price Per Unit
                          </label>
                          <input
                            id={`create-tier-price-${tier.id}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="input-field"
                            disabled={isSubmitting}
                            value={tier.pricePerUnit || ''}
                            onChange={(event) =>
                              updatePricingTier(
                                tier.id,
                                'pricePerUnit',
                                parseFloat(event.target.value) || 0
                              )
                            }
                          />
                        </div>

                        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignSelf: 'end' }}>
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => movePricingTier(index, -1)}
                            disabled={isSubmitting || index === 0}
                            aria-label="Move pricing tier up"
                            title="Move up"
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => movePricingTier(index, 1)}
                            disabled={isSubmitting || index === quantityPricing.length - 1}
                            aria-label="Move pricing tier down"
                            title="Move down"
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-button danger"
                            onClick={() => removePricingTier(tier.id)}
                            disabled={isSubmitting || quantityPricing.length <= 1}
                            aria-label="Remove pricing tier"
                            title="Remove tier"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {errors.quantityPricing ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: 0 }}>
                      {errors.quantityPricing}
                    </p>
                  ) : null}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="create-product-description">Description</label>
                  <textarea
                    id="create-product-description"
                    rows={3}
                    disabled={isSubmitting}
                    className="input-field"
                    style={errors.description ? { borderColor: 'var(--danger)' } : undefined}
                    placeholder="Enter product description..."
                    value={description}
                    onChange={(e) => {
                      dispatch({ type: 'SET_FIELD', payload: { description: e.target.value } });
                      if (errors.description) {
                        dispatch({
                          type: 'SET_ERRORS',
                          payload: (prev) => ({ ...prev, description: undefined }),
                        });
                      }
                    }}
                  />
                  {errors.description ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {errors.description}
                    </p>
                  ) : null}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="create-product-category">Category</label>
                  <input
                    id="create-product-category"
                    type="text"
                    list={categoryListId}
                    disabled={isSubmitting}
                    className="input-field"
                    style={errors.category ? { borderColor: 'var(--danger)' } : undefined}
                    placeholder="Type existing category name (or paste category ID)"
                    value={category}
                    onChange={(e) => {
                      dispatch({ type: 'SET_FIELD', payload: { category: e.target.value } });
                      if (errors.category) {
                        dispatch({
                          type: 'SET_ERRORS',
                          payload: (prev) => ({ ...prev, category: undefined }),
                        });
                      }
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
                    <label className="form-label" htmlFor="create-product-type">Product type</label>
                    <select
                      id="create-product-type"
                      className="input-field"
                      disabled={isSubmitting}
                      value={productType}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FIELD',
                          payload: { productType: event.target.value as 'stocked' | 'on_demand' },
                        })
                      }
                    >
                      <option value="on_demand">On demand</option>
                      <option value="stocked">Stock</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="create-product-stock">Initial stock</label>
                    <input
                      id="create-product-stock"
                      type="number"
                      min="0"
                      step="1"
                      disabled={isSubmitting}
                      className="input-field"
                      style={errors.stock ? { borderColor: 'var(--danger)' } : undefined}
                      value={stock}
                      onChange={(event) => {
                        dispatch({
                          type: 'SET_FIELD',
                          payload: { stock: parseInt(event.target.value, 10) || 0 },
                        });
                        if (errors.stock) {
                          dispatch({
                            type: 'SET_ERRORS',
                            payload: (prev) => ({ ...prev, stock: undefined }),
                          });
                        }
                      }}
                    />
                    {errors.stock ? (
                      <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                        {errors.stock}
                      </p>
                    ) : null}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="create-product-customizable">Customizable</label>
                    <select
                      id="create-product-customizable"
                      className="input-field"
                      disabled={isSubmitting}
                      value={String(isCustomizable)}
                      onChange={(event) =>
                        dispatch({
                          type: 'SET_FIELD',
                          payload: { isCustomizable: event.target.value === 'true' },
                        })
                      }
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="create-product-images">Product images ({images.length}/5)</label>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    style={{
                      border: `1px dashed ${errors.images ? 'var(--danger)' : 'var(--border-active)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '24px',
                      textAlign: 'center',
                      transition: 'border-color 0.2s, background 0.2s',
                      cursor: isSubmitting || images.length >= 5 ? 'not-allowed' : 'pointer',
                      background: errors.images ? 'var(--danger-muted)' : 'var(--bg-surface)',
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
                  >
                    <input
                      id="create-product-images"
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={isSubmitting}
                      aria-label="Upload product images"
                      onChange={(e) => handleImageChange(e.target.files)}
                    />
                    {imagePreview.length > 0 ? (
                      <div style={{ display: 'grid', gap: '12px' }}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                          gap: '12px',
                        }}>
                          {imagePreview.map((preview, index) => (
                            <div key={preview} style={{
                              position: 'relative',
                              borderRadius: 12,
                              overflow: 'hidden',
                              background: 'var(--bg-secondary)',
                            }}>
                              <img
                                src={preview}
                                alt={`Preview ${index + 1}`}
                                style={{
                                  width: '100%',
                                  height: '100px',
                                  objectFit: 'cover',
                                }}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeImage(index);
                                }}
                                disabled={isSubmitting}
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  right: '4px',
                                  background: 'rgba(0, 0, 0, 0.6)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '24px',
                                  height: '24px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: 'white',
                                  fontSize: '16px',
                                  padding: 0,
                                  transition: 'background 0.2s',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)')}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        {images.length < 5 && (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSubmitting}
                            style={{ justifySelf: 'center' }}
                          >
                            Add more images
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px', justifyItems: 'center' }}>
                        <Upload size={24} color="var(--text-muted)" />
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                          Click or drag images to upload
                        </p>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                          JPG, PNG, or WebP (up to 5 images; large files are optimized automatically)
                        </p>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isSubmitting}
                        >
                          Choose images
                        </button>
                      </div>
                    )}
                  </div>
                  {errors.images ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {errors.images}
                    </p>
                  ) : images.length > 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '6px 0 0' }}>
                      Selected size: {formatProductImageBytes(images.reduce((total, image) => total + image.size, 0))}
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
