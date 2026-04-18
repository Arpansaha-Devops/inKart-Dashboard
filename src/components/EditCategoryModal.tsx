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
      {isOpen && category ? (
        <div ref={overlayRef} className="modal-backdrop" role="presentation">
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-category-title"
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
                  id="edit-category-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  Edit Category
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="action-icon-button"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description</label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    className="input-field"
                    rows={3}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Slug</label>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                    className={`status-toggle ${formData.isActive ? 'is-active' : ''}`}
                    aria-pressed={formData.isActive}
                    aria-label="Toggle category status"
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="sr-only">{formData.isActive ? 'Active' : 'Inactive'}</span>
                  </button>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {formData.isActive ? 'Active' : 'Inactive'}
                  </span>
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
                <button type="button" onClick={onClose} className="btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? 'Updating...' : 'Update'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

export default EditCategoryModal;
