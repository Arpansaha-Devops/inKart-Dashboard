import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { updateCategory } from '../services/categoryService';
import type { Category, CreateCategoryPayload } from '../types';

type EditCategoryModalProps = {
  isOpen: boolean;
  category: Category | null;
  onClose: () => void;
  onSuccess: () => void;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  isOpen,
  category,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<CreateCategoryPayload>({
    name: '',
    description: '',
    slug: '',
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlugEdited, setIsSlugEdited] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(
      (el: any) => !el.hasAttribute('disabled')
    ) as HTMLElement[];
  };

  useEffect(() => {
    if (!isOpen || !category) return;

    setFormData({
      name: category.name || '',
      description: category.description || '',
      slug: category.slug || '',
      isActive: category.isActive ?? true,
    });
    setIsSlugEdited(false);
  }, [isOpen, category]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleOverlayMouseDown = (event: MouseEvent) => {
      if (overlayRef.current && event.target === overlayRef.current) {
        onClose();
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
  }, [isOpen, onClose]);

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      name: value,
      slug: isSlugEdited ? prev.slug : slugify(value),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!category?._id) return;
    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    const payload: Partial<CreateCategoryPayload> = {
      ...formData,
      slug: formData.slug?.trim() ? formData.slug : slugify(formData.name),
    };

    setIsSubmitting(true);
    try {
      await updateCategory(category._id, payload);
      toast.success('Category updated');
      onClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update category');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && category && (
        <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="presentation">
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 sm:mx-0 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-category-title"
          >
            <form onSubmit={handleSubmit}>
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 bg-primary text-white">
                <h3 id="edit-category-title" className="text-base sm:text-xl font-bold">Edit Category</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px] sm:min-h-auto sm:min-w-auto"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                  <input
                    type="text"
                    value={formData.slug || ''}
                    onChange={(e) => {
                      setIsSlugEdited(true);
                      setFormData((prev) => ({ ...prev, slug: e.target.value }));
                    }}
                    className="input-field"
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm font-medium text-gray-700">Is Active</span>
                </label>
              </div>

              <div className="p-4 sm:p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[44px] sm:min-h-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary px-5 py-2.5 min-h-[44px] sm:min-h-auto disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSubmitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Update
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EditCategoryModal;
