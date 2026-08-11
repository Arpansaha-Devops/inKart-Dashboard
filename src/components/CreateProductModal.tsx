import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X, Upload, Loader2, Calculator } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createProduct, updateProduct } from '../services/productService';
import apiClient from '../lib/apiClient';
import {
  formatProductImageBytes,
  optimizeProductImages,
  PRODUCT_IMAGE_TYPES,
} from '../lib/productImages';
import { setUniqueProductSlug } from '../lib/productSlugs';
import {
  getProductDescriptionError,
  normalizeProductDescription,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
} from '../lib/productValidation';
import type { QuantityPricingTier } from '../types';

interface CreateProductModalProps {
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
  hsnCode?: string;
  gstPercentage?: string;
  stock?: string;
  quantityPricing?: string;
  variants?: string;
}

interface CategoryLookupItem {
  _id: string;
  name: string;
  isActive: boolean;
}

type QuantityPricingTierForm = QuantityPricingTier & {
  id: string;
};

type VariantSizeForm = {
  id: string;
  size: string;
  stock: number;
};

type ProductVariantForm = {
  id: string;
  colorName: string;
  hexCode: string;
  colorFront: File | null;
  colorBack: File | null;
  colorFrontPreview: string;
  colorBackPreview: string;
  sizes: VariantSizeForm[];
};

const createVariantSize = (): VariantSizeForm => ({
  id: `size-${crypto.randomUUID()}`,
  size: '',
  stock: 0,
});

const createProductVariant = (): ProductVariantForm => ({
  id: `variant-${crypto.randomUUID()}`,
  colorName: '',
  hexCode: '#000000',
  colorFront: null,
  colorBack: null,
  colorFrontPreview: '',
  colorBackPreview: '',
  sizes: [createVariantSize()],
});

const isSupportedProductImage = (file: File) =>
  PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number]);

const normalizeHexCode = (value: string) => {
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) return `#${normalized.toUpperCase()}`;
  return null;
};

const validateVariants = (variants: ProductVariantForm[]): string | null => {
  const colorNames = new Set<string>();
  const hexCodes = new Set<string>();

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const label = `Color ${index + 1}`;
    const colorName = variant.colorName.trim();
    const hexCode = normalizeHexCode(variant.hexCode);

    if (!colorName) return `${label}: color name is required`;
    if (!hexCode) return `${label}: enter a valid 6-digit hex code`;
    if (!variant.colorFront) {
      return `${label}: upload a front mockup image`;
    }
    if (
      !isSupportedProductImage(variant.colorFront) ||
      (variant.colorBack && !isSupportedProductImage(variant.colorBack))
    ) {
      return `${label}: mockups must be JPG, PNG, or WebP images`;
    }
    if (colorNames.has(colorName.toLowerCase())) return `${label}: color names must be unique`;
    if (hexCodes.has(hexCode)) return `${label}: hex codes must be unique`;
    colorNames.add(colorName.toLowerCase());
    hexCodes.add(hexCode);

    if (variant.sizes.length === 0) return `${label}: add at least one size`;
    const sizes = new Set<string>();
    for (const sizeEntry of variant.sizes) {
      const size = sizeEntry.size.trim();
      if (!size) return `${label}: every size needs a name`;
      if (!Number.isInteger(sizeEntry.stock) || sizeEntry.stock < 0) {
        return `${label}: stock must be a non-negative whole number`;
      }
      if (sizes.has(size.toLowerCase())) return `${label}: sizes must be unique`;
      sizes.add(size.toLowerCase());
    }
  }

  return null;
};

const getCreatedProductId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const directId = record._id ?? record.id;
  if (
    typeof directId === 'string' &&
    (typeof record.name === 'string' ||
      typeof record.description === 'string' ||
      Array.isArray(record.images))
  ) {
    return directId;
  }

  for (const key of ['product', 'data', 'result']) {
    const productId = getCreatedProductId(record[key]);
    if (productId) return productId;
  }

  return null;
};

type CreateProductFormState = {
  name: string;
  price: number;
  description: string;
  category: string;
  basePrice: number;
  hsnCode: string;
  gstPercentage: number;
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
  hsnCode: '',
  gstPercentage: 5,
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
  const responseData = error?.response?.data;
  const message =
    (typeof responseData === 'string' ? responseData : '') ||
    responseData?.message ||
    responseData?.error?.message ||
    responseData?.error ||
    '';

  if (error?.response?.status === 413) {
    return 'The product images are too large for the server. Please remove an image or choose smaller files.';
  }

  if (
    error?.response?.status === 409 ||
    /duplicate key|E11000|name_1|slug_1/i.test(message)
  ) {
    return 'Could not create this product because the server rejected it as a duplicate.';
  }

  if (/description[\s\S]*longer than the maximum allowed length|description[\s\S]*5000/i.test(message)) {
    return `Description must be ${PRODUCT_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`;
  }

  return message || error?.message || 'Failed to create product';
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

const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onSuccess }) => {
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
    hsnCode,
    gstPercentage,
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
  const [variants, setVariants] = useState<ProductVariantForm[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const handleCloseRef = useRef<() => void>(() => {});
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
    try {
      let aggregated: CategoryLookupItem[] = [];
      try {
        const response = await apiClient.get('/admin/categories');
        aggregated = extractCategoriesFromPayload(response.data);
      } catch (error: any) {
        if (error?.response?.status !== 404) throw error;
      }

      // Older API deployments exposed only the public route. Avoid requesting it
      // when the canonical admin endpoint has already supplied the categories.
      if (aggregated.length === 0) {
        try {
          const response = await apiClient.get('/categories');
          aggregated = extractCategoriesFromPayload(response.data);
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
    void fetchKnownCategories();
  }, [fetchKnownCategories]);

  const validate = (): QuantityPricingTier[] | null => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Product name is required';
    }
    if (!price || price <= 0) {
      newErrors.price = 'Price must be greater than 0';
    }
    const descriptionError = getProductDescriptionError(description);
    if (descriptionError) newErrors.description = descriptionError;
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

    const variantsError = validateVariants(variants);
    if (variantsError) {
      newErrors.variants = variantsError;
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

  const clearVariantError = () => {
    if (!errors.variants) return;
    dispatch({
      type: 'SET_ERRORS',
      payload: (previous) => ({ ...previous, variants: undefined }),
    });
  };

  const updateVariant = (variantId: string, patch: Partial<ProductVariantForm>) => {
    setVariants((current) =>
      current.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant))
    );
    clearVariantError();
  };

  const addVariant = () => {
    setVariants((current) => [...current, createProductVariant()]);
    clearVariantError();
  };

  const removeVariant = (variantId: string) => {
    setVariants((current) => {
      const removed = current.find((variant) => variant.id === variantId);
      if (removed?.colorFrontPreview) URL.revokeObjectURL(removed.colorFrontPreview);
      if (removed?.colorBackPreview) URL.revokeObjectURL(removed.colorBackPreview);
      return current.filter((variant) => variant.id !== variantId);
    });
    clearVariantError();
  };

  const handleVariantImageChange = (
    variantId: string,
    side: 'colorFront' | 'colorBack',
    file: File | undefined
  ) => {
    if (!file) return;
    if (!isSupportedProductImage(file)) {
      toast.error(`${file.name} must be a JPG, PNG, or WebP image`);
      return;
    }

    const previewKey = side === 'colorFront' ? 'colorFrontPreview' : 'colorBackPreview';
    setVariants((current) =>
      current.map((variant) => {
        if (variant.id !== variantId) return variant;
        if (variant[previewKey]) URL.revokeObjectURL(variant[previewKey]);
        return {
          ...variant,
          [side]: file,
          [previewKey]: URL.createObjectURL(file),
        };
      })
    );
    clearVariantError();
  };

  const updateVariantSize = (
    variantId: string,
    sizeId: string,
    patch: Partial<VariantSizeForm>
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              sizes: variant.sizes.map((size) =>
                size.id === sizeId ? { ...size, ...patch } : size
              ),
            }
          : variant
      )
    );
    clearVariantError();
  };

  const addVariantSize = (variantId: string) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? { ...variant, sizes: [...variant.sizes, createVariantSize()] }
          : variant
      )
    );
    clearVariantError();
  };

  const removeVariantSize = (variantId: string, sizeId: string) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId && variant.sizes.length > 1
          ? { ...variant, sizes: variant.sizes.filter((size) => size.id !== sizeId) }
          : variant
      )
    );
    clearVariantError();
  };

  const resetForm = useCallback(() => {
    dispatch({ type: 'RESET_FORM' });
    setImages([]);
    imagePreview.forEach((preview) => URL.revokeObjectURL(preview));
    setImagePreview([]);
    variants.forEach((variant) => {
      if (variant.colorFrontPreview) URL.revokeObjectURL(variant.colorFrontPreview);
      if (variant.colorBackPreview) URL.revokeObjectURL(variant.colorBackPreview);
    });
    setVariants([]);
  }, [imagePreview, variants]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }, [isSubmitting, onClose, resetForm]);

  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const focusable = contentRef.current ? getFocusableElements(contentRef.current) : [];
    focusable[0]?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseRef.current();
      }
    };

    const handleOverlayMouseDown = (event: MouseEvent) => {
      if (overlayRef.current && event.target === overlayRef.current) {
        handleCloseRef.current();
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
      const variantImageFiles = variants.flatMap((variant) => [
        variant.colorFront as File,
        ...(variant.colorBack ? [variant.colorBack] : []),
      ]);
      const optimizedFiles = await optimizeProductImages([...images, ...variantImageFiles]);
      const optimizedImages = optimizedFiles.slice(0, images.length);
      const optimizedVariantImages = optimizedFiles.slice(images.length);
      const formData = new FormData();
      formData.append('name', name.trim());
      setUniqueProductSlug(formData, name);
      formData.append('price', String(price));
      formData.append('description', normalizeProductDescription(description));
      formData.append('category', resolvedCategoryId);
      formData.append('productType', productType);
      const variantStock = variants.reduce(
        (total, variant) =>
          total + variant.sizes.reduce((variantTotal, size) => variantTotal + size.stock, 0),
        0
      );
      formData.append('stock', String(variants.length > 0 ? variantStock : stock));
      formData.append('isCustomizable', String(isCustomizable));
      formData.append('isActive', 'true');
      // The live POST middleware rejects both `images` and `image`. Create the record
      // with text fields first, then attach all files through the documented PATCH route.
      formData.append('basePrice', String(basePrice));
      if (hsnCode.trim()) {
        formData.append('hsnCode', hsnCode.trim());
      }
      formData.append('gstPercentage', String(gstPercentage ?? 5));
      formData.append('quantityPricing', JSON.stringify(sortedPricingTiers));

      const response = await createProduct(formData);
      let createdProductPayload = response.data;

      if (optimizedImages.length > 0) {
        const productId = getCreatedProductId(response.data);
        if (!productId) {
          toast.error(
            'The product was created, but its ID was missing from the response, so gallery images and color variants could not be attached.'
          );
          resetForm();
          onClose();
          onSuccess(response.data);
          return;
        }

        const updateFormData = new FormData();
        // PATCH /admin/products/:id accepts the gallery under `productImages`.
        optimizedImages.forEach((image) => updateFormData.append('productImages', image));

        if (variants.length > 0) {
          // Documented API contract: metadata is JSON and mockups use indexed field names.
          const variantPayload = variants.map((variant) => ({
            colorName: variant.colorName.trim(),
            hexCode: normalizeHexCode(variant.hexCode),
            sizes: variant.sizes.map((size) => ({
              size: size.size.trim(),
              stock: size.stock,
            })),
          }));
          updateFormData.append('variants', JSON.stringify(variantPayload));
          updateFormData.append('stock', String(variantStock));
          let mockupImageIndex = 0;
          variants.forEach((variant, index) => {
            updateFormData.append(`colorFront_${index}`, optimizedVariantImages[mockupImageIndex]);
            mockupImageIndex += 1;

            if (variant.colorBack) {
              updateFormData.append(`colorBack_${index}`, optimizedVariantImages[mockupImageIndex]);
              mockupImageIndex += 1;
            }
          });
        }

        try {
          const updateResponse = await updateProduct(productId, updateFormData);
          createdProductPayload = updateResponse.data;
        } catch (variantError) {
          toast.error(
            `The base product was created, but its gallery or color variants could not be attached. ${getCreateProductErrorMessage(
              variantError
            )}`
          );
          resetForm();
          onClose();
          onSuccess(response.data);
          return;
        }
      }

      toast.success('Product created successfully!');
      resetForm();
      onClose();
      onSuccess(createdProductPayload);
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
      <div ref={overlayRef} className="modal-backdrop" role="presentation">
          <m.div
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
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="create-product-price">Price (incl. GST)</label>
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

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="create-product-hsn">HSN Code</label>
                    <input
                      id="create-product-hsn"
                      type="text"
                      disabled={isSubmitting}
                      className="input-field"
                      placeholder="e.g. 6109"
                      value={hsnCode}
                      onChange={(e) => {
                        dispatch({
                          type: 'SET_FIELD',
                          payload: { hsnCode: e.target.value },
                        });
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="create-product-gst">GST (%)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="create-product-gst"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        disabled={isSubmitting}
                        className="input-field"
                        style={{ paddingRight: 30 }}
                        placeholder="5"
                        value={gstPercentage ?? 5}
                        onChange={(e) => {
                          const rawValue = e.target.value;
                          const nextGstPercentage = rawValue === '' ? 5 : Number(rawValue);
                          if (!Number.isFinite(nextGstPercentage)) return;
                          dispatch({
                            type: 'SET_FIELD',
                            payload: { gstPercentage: nextGstPercentage },
                          });
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          right: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-muted)',
                          fontSize: '14px',
                        }}
                      >
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {price > 0 && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(59, 130, 246, 0.06)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--primary, #3b82f6)' }}>
                      <Calculator size={16} />
                      <span>Price & Tax Calculation (Inclusive of GST)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Selling Price (incl. GST)</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>₹{price.toFixed(2)}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Excl. GST (Actual Price)</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
                          ₹{(price / (1 + (gstPercentage || 0) / 100)).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>GST Amount ({gstPercentage ?? 5}%)</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary, #3b82f6)', fontSize: '15px' }}>
                          ₹{(price - price / (1 + (gstPercentage || 0) / 100)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

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
                    <span className="form-label" style={{ margin: 0 }}>
                      Pricing Tiers
                    </span>
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
                    maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
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
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '6px 0 0', textAlign: 'right' }}>
                      {description.length.toLocaleString()} / {PRODUCT_DESCRIPTION_MAX_LENGTH.toLocaleString()}
                    </p>
                  )}
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

                <section
                  aria-labelledby="create-product-variants-title"
                  style={{
                    display: 'grid',
                    gap: '14px',
                    padding: '16px',
                    border: `1px solid ${errors.variants ? 'var(--danger)' : 'var(--border)'}`,
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
                    <div>
                      <h3
                        id="create-product-variants-title"
                        style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}
                      >
                        Color variants
                      </h3>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                        Optional. Add a front mockup and size stock for every color. Back mockups are optional.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={addVariant}
                      disabled={isSubmitting}
                    >
                      <Plus size={15} />
                      Add color
                    </button>
                  </div>

                  {variants.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        padding: '14px',
                        border: '1px dashed var(--border-active)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        textAlign: 'center',
                      }}
                    >
                      No color variants. This product will use the standard image and stock flow.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '14px' }}>
                      {variants.map((variant, variantIndex) => {
                        const colorStock = variant.sizes.reduce(
                          (total, size) => total + size.stock,
                          0
                        );
                        return (
                          <fieldset
                            key={variant.id}
                            disabled={isSubmitting}
                            style={{
                              display: 'grid',
                              gap: '14px',
                              margin: 0,
                              padding: '14px',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              minWidth: 0,
                            }}
                          >
                            <legend
                              style={{
                                padding: '0 6px',
                                color: 'var(--text-secondary)',
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              Color {variantIndex + 1} · {colorStock} in stock
                            </legend>

                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '10px',
                                alignItems: 'end',
                              }}
                            >
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" htmlFor={`variant-name-${variant.id}`}>
                                  Color name
                                </label>
                                <input
                                  id={`variant-name-${variant.id}`}
                                  className="input-field"
                                  value={variant.colorName}
                                  placeholder="Black"
                                  onChange={(event) =>
                                    updateVariant(variant.id, { colorName: event.target.value })
                                  }
                                />
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" htmlFor={`variant-hex-${variant.id}`}>
                                  Hex color
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: '8px' }}>
                                  <input
                                    id={`variant-color-picker-${variant.id}`}
                                    type="color"
                                    aria-label={`Choose ${variant.colorName || `color ${variantIndex + 1}`}`}
                                    value={normalizeHexCode(variant.hexCode) || '#000000'}
                                    onChange={(event) =>
                                      updateVariant(variant.id, { hexCode: event.target.value.toUpperCase() })
                                    }
                                    style={{
                                      width: '44px',
                                      height: '42px',
                                      padding: '3px',
                                      border: '1px solid var(--border)',
                                      borderRadius: 'var(--radius-md)',
                                      background: 'var(--bg-primary)',
                                      cursor: 'pointer',
                                    }}
                                  />
                                  <input
                                    id={`variant-hex-${variant.id}`}
                                    className="input-field"
                                    value={variant.hexCode}
                                    placeholder="#000000"
                                    maxLength={7}
                                    onChange={(event) =>
                                      updateVariant(variant.id, { hexCode: event.target.value })
                                    }
                                    onBlur={() => {
                                      const normalized = normalizeHexCode(variant.hexCode);
                                      if (normalized) updateVariant(variant.id, { hexCode: normalized });
                                    }}
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                className="action-icon-button danger"
                                onClick={() => removeVariant(variant.id)}
                                aria-label={`Remove ${variant.colorName || `color ${variantIndex + 1}`}`}
                                title="Remove color"
                                style={{ justifySelf: 'end' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                                gap: '10px',
                              }}
                            >
                              {(['colorFront', 'colorBack'] as const).map((side) => {
                                const isFront = side === 'colorFront';
                                const preview = isFront
                                  ? variant.colorFrontPreview
                                  : variant.colorBackPreview;
                                const inputId = `${side}-${variant.id}`;
                                return (
                                  <div key={side} className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label" htmlFor={inputId}>
                                      {isFront ? 'Front mockup' : 'Back mockup (optional)'}
                                    </label>
                                    <input
                                      id={inputId}
                                      type="file"
                                      className="hidden"
                                      accept="image/jpeg,image/png,image/webp"
                                      onChange={(event) => {
                                        handleVariantImageChange(
                                          variant.id,
                                          side,
                                          event.target.files?.[0]
                                        );
                                        event.target.value = '';
                                      }}
                                    />
                                    <label
                                      htmlFor={inputId}
                                      style={{
                                        display: 'grid',
                                        placeItems: 'center',
                                        minHeight: '142px',
                                        overflow: 'hidden',
                                        border: '1px dashed var(--border-active)',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-primary)',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {preview ? (
                                        <img
                                          src={preview}
                                          alt={`${variant.colorName || `Color ${variantIndex + 1}`} ${
                                            isFront ? 'front' : 'back'
                                          } preview`}
                                          style={{ width: '100%', height: '142px', objectFit: 'contain' }}
                                        />
                                      ) : (
                                        <span
                                          style={{
                                            display: 'grid',
                                            gap: '6px',
                                            justifyItems: 'center',
                                            color: 'var(--text-muted)',
                                            fontSize: '12px',
                                          }}
                                        >
                                          <Upload size={20} />
                                          Choose {isFront ? 'front' : 'back'} image
                                        </span>
                                      )}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>

                            <div style={{ display: 'grid', gap: '9px' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '10px',
                                }}
                              >
                                <span className="form-label" style={{ margin: 0 }}>Sizes and stock</span>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  onClick={() => addVariantSize(variant.id)}
                                >
                                  <Plus size={14} /> Add size
                                </button>
                              </div>
                              {variant.sizes.map((sizeEntry, sizeIndex) => (
                                <div
                                  key={sizeEntry.id}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                    gap: '8px',
                                    alignItems: 'end',
                                  }}
                                >
                                  <div>
                                    <label
                                      className="form-label"
                                      htmlFor={`variant-size-${sizeEntry.id}`}
                                    >
                                      Size {sizeIndex + 1}
                                    </label>
                                    <input
                                      id={`variant-size-${sizeEntry.id}`}
                                      className="input-field"
                                      value={sizeEntry.size}
                                      placeholder="S, M, L..."
                                      onChange={(event) =>
                                        updateVariantSize(variant.id, sizeEntry.id, {
                                          size: event.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label
                                      className="form-label"
                                      htmlFor={`variant-stock-${sizeEntry.id}`}
                                    >
                                      Stock
                                    </label>
                                    <input
                                      id={`variant-stock-${sizeEntry.id}`}
                                      type="number"
                                      min="0"
                                      step="1"
                                      className="input-field"
                                      value={sizeEntry.stock}
                                      onChange={(event) =>
                                        updateVariantSize(variant.id, sizeEntry.id, {
                                          stock: Number.parseInt(event.target.value, 10) || 0,
                                        })
                                      }
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className="action-icon-button danger"
                                    disabled={variant.sizes.length <= 1}
                                    onClick={() => removeVariantSize(variant.id, sizeEntry.id)}
                                    aria-label={`Remove size ${sizeEntry.size || sizeIndex + 1}`}
                                    title="Remove size"
                                    style={{ justifySelf: 'end' }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </fieldset>
                        );
                      })}
                    </div>
                  )}

                  {errors.variants ? (
                    <p role="alert" style={{ color: 'var(--danger)', fontSize: '12px', margin: 0 }}>
                      {errors.variants}
                    </p>
                  ) : variants.length > 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
                      Initial stock will be calculated from all variant sizes when the product is created.
                    </p>
                  ) : null}
                </section>

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
          </m.div>
      </div>
      </AnimatePresence>
  );
};

export default CreateProductModal;
