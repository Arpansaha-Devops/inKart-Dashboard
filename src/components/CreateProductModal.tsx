import React, { useState, useRef } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { createProduct } from '../services/productService';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormErrors {
  description?: string;
  category?: string;
  productType?: string;
  stock?: string;
  basePrice?: string;
  image?: string;
}

const CreateProductModal: React.FC<CreateProductModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productType, setProductType] = useState<'stocked' | 'on_demand'>('stocked');
  const [stock, setStock] = useState<number>(0);
  const [basePrice, setBasePrice] = useState<number>(0);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

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
      newErrors.basePrice = 'Price must be greater than 0';
    }
    if (!image) {
      newErrors.image = 'Product image is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleImageChange = (file: File | null) => {
    if (file) {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
      setErrors(prev => ({ ...prev, image: undefined }));
    }
  };

  const resetForm = () => {
    setDescription('');
    setCategory('');
    setProductType('stocked');
    setStock(0);
    setBasePrice(0);
    setImage(null);
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

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('description', description);
    formData.append('category', category);
    formData.append('productType', productType);
    if (productType === 'stocked') {
      formData.append('stock', String(stock));
    }
    formData.append('basePrice', String(basePrice));
    formData.append('productImage', image!);

    try {
      await createProduct(formData);
      toast.success('Product created successfully!');
      resetForm();
      onClose();
      onSuccess();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to create product';
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
          >
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-primary text-white">
                <h3 className="text-xl font-bold">Create New Product</h3>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Form Body */}
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    disabled={isSubmitting}
                    className={`input-field ${errors.description ? 'border-red-500 focus:ring-red-500' : ''}`}
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

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    className={`input-field ${errors.category ? 'border-red-500 focus:ring-red-500' : ''}`}
                    placeholder="e.g. Business Cards, Stickers..."
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      if (errors.category) setErrors(prev => ({ ...prev, category: undefined }));
                    }}
                  />
                  {errors.category && (
                    <p className="text-red-500 text-xs mt-1">{errors.category}</p>
                  )}
                </div>

                {/* Product Type & Stock */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      disabled={isSubmitting}
                      className="input-field"
                      value={productType}
                      onChange={(e) => {
                        setProductType(e.target.value as 'stocked' | 'on_demand');
                      }}
                    >
                      <option value="stocked">Stocked</option>
                      <option value="on_demand">On Demand</option>
                    </select>
                  </div>

                  {productType === 'stocked' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Stock Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        disabled={isSubmitting}
                        className={`input-field ${errors.stock ? 'border-red-500 focus:ring-red-500' : ''}`}
                        value={stock}
                        onChange={(e) => {
                          setStock(parseInt(e.target.value) || 0);
                          if (errors.stock) setErrors(prev => ({ ...prev, stock: undefined }));
                        }}
                      />
                      {errors.stock && (
                        <p className="text-red-500 text-xs mt-1">{errors.stock}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Base Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Price <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      disabled={isSubmitting}
                      className={`input-field pl-8 ${errors.basePrice ? 'border-red-500 focus:ring-red-500' : ''}`}
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

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Image <span className="text-red-500">*</span>
                  </label>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => !isSubmitting && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                      errors.image
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-200 hover:border-accent'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                      <div className="space-y-3">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="mx-auto max-h-40 rounded-lg object-contain"
                        />
                        <p className="text-sm text-gray-500">{image?.name}</p>
                        <p className="text-xs text-accent">Click or drag to replace</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                        <p className="text-sm text-gray-500">Click or drag image to upload</p>
                        <p className="text-xs text-gray-400 mt-1">JPG, PNG, or WebP</p>
                      </>
                    )}
                  </div>
                  {errors.image && (
                    <p className="text-red-500 text-xs mt-1">{errors.image}</p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
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
      )}
    </AnimatePresence>
  );
};

export default CreateProductModal;
