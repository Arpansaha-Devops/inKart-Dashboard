import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { deleteCategory } from '../services/categoryService';
import type { Category } from '../types';

type DeleteCategoryModalProps = {
  isOpen: boolean;
  category: Category | null;
  onClose: () => void;
  onSuccess: () => void;
};

const DeleteCategoryModal: React.FC<DeleteCategoryModalProps> = ({
  isOpen,
  category,
  onClose,
  onSuccess,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!category?._id) return;

    setIsDeleting(true);
    try {
      await deleteCategory(category._id);
      toast.success('Category deleted');
      onClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && category && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="presentation"
        >
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 sm:mx-0 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-category-title"
          >
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
              </div>
              <h3 id="delete-category-title" className="text-lg sm:text-xl font-semibold text-center text-gray-900 mb-2">
                Delete category
              </h3>
              <p className="text-center text-gray-500 text-sm mb-6">
                Are you sure you want to delete <strong>{category.name}</strong>? This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {isDeleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DeleteCategoryModal;
