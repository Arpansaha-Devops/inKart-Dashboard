import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createCategory } from '../services/categoryService';
import type { CreateCategoryPayload } from '../types';

type CreateCategoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const defaultForm: CreateCategoryPayload = {
  name: '',
  description: '',
  slug: '',
  isActive: true,
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter(
    (el: any) => !el.hasAttribute('disabled')
  ) as HTMLElement[];
};

const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<CreateCategoryPayload>(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isOpenRef = useRef(isOpen);
  const isSlugEditedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const resetForm = useCallback(() => {
    setFormData(defaultForm);
    isSlugEditedRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onCloseRef.current();
  }, [resetForm]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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
        handleClose();
      }
    };

    const handleOverlayMouseDown = (event: MouseEvent) => {
      if (!isOpenRef.current) return;
      if (overlayRef.current && event.target === overlayRef.current) {
        handleClose();
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
  }, [handleClose]);

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      name: value,
      slug: isSlugEditedRef.current ? prev.slug : slugify(value),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    const payload: CreateCategoryPayload = {
      ...formData,
      slug: formData.slug?.trim() ? formData.slug : slugify(formData.name),
    };

    setIsSubmitting(true);
    try {
      await createCategory(payload);
      toast.success('Category created');
      resetForm();
      onCloseRef.current();
      onSuccess();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <div ref={overlayRef} className="modal-backdrop" role="presentation">
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-category-title"
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
                  id="create-category-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  Create Category
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="action-icon-button"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="create-category-name">Name</label>
                  <input
                    id="create-category-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="input-field"
                    placeholder="Electronics"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="create-category-description">Description</label>
                  <textarea
                    id="create-category-description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    className="input-field"
                    rows={3}
                    placeholder="All electronic products"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="create-category-slug">Slug</label>
                  <input
                    id="create-category-slug"
                    type="text"
                    value={formData.slug || ''}
                    onChange={(e) => {
                      isSlugEditedRef.current = true;
                      setFormData((prev) => ({ ...prev, slug: e.target.value }));
                    }}
                    className="input-field"
                    placeholder="electronics"
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
                  />
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
                <button type="button" onClick={handleClose} className="btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

export default CreateCategoryModal;
