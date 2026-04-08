import React, { useEffect, useState, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, X, Tag, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Coupon, CreateCouponPayload } from '../types';
import { createCoupon, updateCoupon, deleteCoupon } from '../services/couponService';
import { formatDate } from '../lib/utils';
import apiClient from '../lib/apiClient';

const Coupons: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [page, setPage] = useState(1);
  const [isLoadingAPI, setIsLoadingAPI] = useState(false);
  const [activeFilters, setActiveFilters] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState<CreateCouponPayload>({
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: 0,
    maxDiscountAmount: undefined,
    minOrderAmount: undefined,
    usageLimit: undefined,
    perUserLimit: undefined,
    validFrom: new Date().toISOString().slice(0, 16),
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    isActive: true,
    applicableCategories: [],
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const limit = 10;
  const totalCount = coupons.length;
  const totalPages = Math.ceil(totalCount / limit);
  const displayedCoupons = coupons.slice((page - 1) * limit, page * limit);

  const activeCouponsCount = coupons.filter((c) => c.isActive).length;
  const expiredCouponsCount = coupons.filter(
    (c) => new Date(c.validUntil) < new Date()
  ).length;

  // Modal refs for accessibility (focus trap & click-outside)
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const deleteModalOverlayRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const deleteModalContentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Helper: Get all focusable elements
  const getFocusableElements = (container: HTMLElement): HTMLButtonElement[] => {
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(
      (el: any) => !el.hasAttribute('disabled')
    ) as HTMLButtonElement[];
  };

  // Handle Escape key for Create/Edit modal
  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModalOpen(false);
      }
    };

    // Handle click outside on overlay only
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalOverlayRef.current &&
        event.target === modalOverlayRef.current
      ) {
        setIsModalOpen(false);
      }
    };

    // Set initial focus to first focusable element
    const focusableElements = modalContentRef.current
      ? getFocusableElements(modalContentRef.current)
      : [];
    if (focusableElements.length > 0) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      focusableElements[0].focus();
    }

    // Focus trap: prevent focus from leaving modal
    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (!modalContentRef.current) return;
      const focusableEls = getFocusableElements(modalContentRef.current);
      if (focusableEls.length === 0) return;

      const firstEl = focusableEls[0];
      const lastEl = focusableEls[focusableEls.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('keydown', handleTabKey);
    
    const overlay = modalOverlayRef.current;
    overlay?.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('keydown', handleTabKey);
      
      if (overlay) {
        overlay.removeEventListener('mousedown', handleClickOutside);
      }

      // Restore focus
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isModalOpen]);

  // Handle Escape key for Delete modal
  useEffect(() => {
    if (!isDeleteModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDeleteModalOpen(false);
        setDeletingCoupon(null);
      }
    };

    // Handle click outside on overlay only
    const handleClickOutside = (event: MouseEvent) => {
      if (
        deleteModalOverlayRef.current &&
        event.target === deleteModalOverlayRef.current
      ) {
        setIsDeleteModalOpen(false);
        setDeletingCoupon(null);
      }
    };

    // Set initial focus to Cancel/first button
    const focusableElements = deleteModalContentRef.current
      ? getFocusableElements(deleteModalContentRef.current)
      : [];
    if (focusableElements.length > 0) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      focusableElements[0].focus();
    }

    // Focus trap: prevent focus from leaving modal
    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (!deleteModalContentRef.current) return;
      const focusableEls = getFocusableElements(deleteModalContentRef.current);
      if (focusableEls.length === 0) return;

      const firstEl = focusableEls[0];
      const lastEl = focusableEls[focusableEls.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('keydown', handleTabKey);
    
    const deleteOverlay = deleteModalOverlayRef.current;
    deleteOverlay?.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('keydown', handleTabKey);
      
      if (deleteOverlay) {
        deleteOverlay.removeEventListener('mousedown', handleClickOutside);
      }

      // Restore focus
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isDeleteModalOpen]);
  // Fetch coupons from API on mount and when page changes
  useEffect(() => {
    const fetchCoupons = async () => {
      setIsLoadingAPI(true);
      try {
        const response = await apiClient.get<any>('/admin/coupons', {
          params: { page, limit: 10 },
        });

        let couponsList: Coupon[] = [];

        if (Array.isArray(response.data)) {
          couponsList = response.data;
        } else if (response.data && typeof response.data === 'object') {
          // Helper to find array in nested response
          const findArray = (obj: any): any[] | null => {
            if (Array.isArray(obj)) return obj;
            if (!obj || typeof obj !== 'object') return null;

            const commonKeys = ['data', 'coupons', 'results', 'items', 'list'];
            for (const key of commonKeys) {
              if (Array.isArray(obj[key])) return obj[key];
            }

            for (const key in obj) {
              const result = findArray(obj[key]);
              if (result) return result;
            }
            return null;
          };

          couponsList = findArray(response.data) || [];
        }

        setCoupons(couponsList);
      } catch (error: any) {
        // Gracefully handle 404 or other errors if endpoint not available yet
        console.error('Error fetching coupons:', error.response?.status, error.message);
        // Don't show error toast since endpoint may not exist yet
        // Keep existing coupons in local state
      } finally {
        setIsLoadingAPI(false);
      }
    };

    fetchCoupons();
  }, [page]);
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.code.trim()) {
      errors.code = 'Coupon code is required';
    }
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }
    if (formData.discountValue <= 0) {
      errors.discountValue = 'Discount must be greater than 0';
    }
    if (formData.discountType === 'percentage' && formData.discountValue > 100) {
      errors.discountValue = 'Percentage cannot exceed 100';
    }
    
    const validFrom = new Date(formData.validFrom);
    const validUntil = new Date(formData.validUntil);
    
    if (validUntil <= validFrom) {
      errors.validUntil = 'Valid Until must be after Valid From';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenModal = (coupon?: Coupon) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setFormData({
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        minOrderAmount: coupon.minOrderAmount,
        usageLimit: coupon.usageLimit,
        perUserLimit: coupon.perUserLimit,
        validFrom: coupon.validFrom.slice(0, 16),
        validUntil: coupon.validUntil.slice(0, 16),
        isActive: coupon.isActive,
        applicableCategories: coupon.applicableCategories,
      });
    } else {
      setEditingCoupon(null);
      setFormData({
        code: '',
        description: '',
        discountType: 'percentage',
        discountValue: 0,
        maxDiscountAmount: undefined,
        minOrderAmount: undefined,
        usageLimit: undefined,
        perUserLimit: undefined,
        validFrom: new Date().toISOString().slice(0, 16),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        isActive: true,
        applicableCategories: [],
      });
    }
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        code: formData.code.toUpperCase(),
      };

      if (editingCoupon) {
        const response = await updateCoupon(editingCoupon._id, payload);
        const updatedCoupon = response.data.coupon;
        setCoupons((prev) =>
          prev.map((c) => (c._id === editingCoupon._id ? updatedCoupon : c))
        );
        toast.success('Coupon updated successfully!');
      } else {
        const response = await createCoupon(payload);
        const newCoupon = response.data.coupon;
        setCoupons((prev) => [newCoupon, ...prev]);
        toast.success('Coupon created successfully!');
      }

      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Form submission error:', error);
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCoupon) return;

    setIsLoadingAPI(true);
    try {
      await deleteCoupon(deletingCoupon._id);
      setCoupons((prev) => prev.filter((c) => c._id !== deletingCoupon._id));
      toast.success('Coupon deleted successfully!');
      setIsDeleteModalOpen(false);
      setDeletingCoupon(null);
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.response?.data?.message || 'Delete failed');
    } finally {
      setIsLoadingAPI(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (name === 'code') {
      setFormData((prev) => ({
        ...prev,
        code: value.toUpperCase(),
      }));
    } else if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        isActive: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === 'applicableCategories') {
      setFormData((prev) => ({
        ...prev,
        applicableCategories: value.split(',').map((c) => c.trim()).filter((c) => c),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]:
          type === 'number' && value !== ''
            ? parseFloat(value)
            : value,
      }));
    }
  };

  const getDiscountLabel = (coupon: Coupon): string => {
    if (coupon.discountType === 'percentage') {
      return `${coupon.discountValue}%`;
    }
    return `₹${coupon.discountValue}`;
  };

  const getMinOrderLabel = (coupon: Coupon): string => {
    return coupon.minOrderAmount ? `₹${coupon.minOrderAmount}` : '—';
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Coupons</h2>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2 bg-accent w-full sm:w-auto py-2.5 sm:py-2 text-sm sm:text-base min-h-[44px] sm:min-h-auto"
        >
          <Plus size={20} /> Create Coupon
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total Coupons', value: totalCount, color: 'blue' },
          { label: 'Active', value: activeCouponsCount, color: 'green' },
          { label: 'Expired', value: expiredCouponsCount, color: 'red' },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 100 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                <p className={`text-2xl sm:text-3xl font-bold mt-1 ${
                  stat.color === 'blue' ? 'text-blue-600' :
                  stat.color === 'green' ? 'text-green-600' :
                  'text-red-600'
                }`}>
                  {stat.value}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${
                stat.color === 'blue' ? 'bg-blue-100' :
                stat.color === 'green' ? 'bg-green-100' :
                'bg-red-100'
              }`}>
                <Tag className={`${
                  stat.color === 'blue' ? 'text-blue-600' :
                  stat.color === 'green' ? 'text-green-600' :
                  'text-red-600'
                }`} size={24} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Coupons Table */}
      <div className="card overflow-hidden !p-0 border-0 shadow-sm">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="inline-block min-w-full">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Code
                  </th>
                  <th className="hidden sm:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Description
                  </th>
                  <th className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Type
                  </th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">
                    Discount
                  </th>
                  <th className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Min Order
                  </th>
                  <th className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Valid Until
                  </th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap text-center">
                    Status
                  </th>
                  <th className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedCoupons.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 sm:px-4 md:px-6 py-8 sm:py-12 text-center text-gray-500 text-sm sm:text-base">
                      <div className="flex flex-col items-center justify-center">
                        <Tag size={40} className="text-gray-300 mb-3" />
                        <p className="font-medium">No coupons yet</p>
                        <p className="text-xs sm:text-sm">Create your first coupon to get started</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedCoupons.map((coupon) => (
                    <tr key={coupon._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4">
                        <span className="inline-block bg-accent text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-mono font-bold">
                          {coupon.code}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600 max-w-xs truncate">
                        {coupon.description}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                          coupon.discountType === 'percentage'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {coupon.discountType === 'percentage' ? 'Percentage' : 'Flat Amount'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-center text-gray-900">
                        {getDiscountLabel(coupon)}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600">
                        {getMinOrderLabel(coupon)}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600">
                        {formatDate(coupon.validUntil)}
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-xs sm:text-sm text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                          coupon.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {coupon.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 text-right">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button
                            onClick={() => handleOpenModal(coupon)}
                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
                            aria-label="Edit coupon"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setDeletingCoupon(coupon);
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
                            aria-label="Delete coupon"
                          >
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
        </div>

        {totalPages > 1 && (
          <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 overflow-x-auto">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <ChevronLeft size={16} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const pageNum = totalPages > 5 ? (page > 3 ? page - 2 + i : i + 1) : i + 1;
                if (pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
                      page === pageNum ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-gray-600 disabled:opacity-50 hover:text-accent whitespace-nowrap"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={16} className="sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Coupon Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            ref={modalOverlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="presentation"
          >
            <motion.div
              ref={modalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
                <h3 id="modal-title" className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <form id="coupon-form" onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-3 sm:space-y-4">
                {/* Coupon Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    placeholder="SAVE30"
                    maxLength={20}
                    className="input-field"
                  />
                  {formErrors.code && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.code}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="30% off on orders above ₹500"
                    rows={2}
                    className="input-field resize-none"
                  />
                  {formErrors.description && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.description}</p>
                  )}
                </div>

                {/* Discount Type & Value */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Type *
                    </label>
                    <select
                      name="discountType"
                      value={formData.discountType}
                      onChange={handleInputChange}
                      className="input-field"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="flat">Flat Amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Value *
                    </label>
                    <input
                      type="number"
                      name="discountValue"
                      value={formData.discountValue}
                      onChange={handleInputChange}
                      placeholder="30"
                      min="0"
                      step="0.01"
                      className="input-field"
                    />
                    {formErrors.discountValue && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.discountValue}</p>
                    )}
                  </div>
                </div>

                {/* Max Discount Amount (only for percentage) */}
                {formData.discountType === 'percentage' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Discount Amount (₹)
                    </label>
                    <input
                      type="number"
                      name="maxDiscountAmount"
                      value={formData.maxDiscountAmount || ''}
                      onChange={handleInputChange}
                      placeholder="150"
                      min="0"
                      step="0.01"
                      className="input-field"
                    />
                  </div>
                )}

                {/* Min Order Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Order Amount (₹)
                  </label>
                  <input
                    type="number"
                    name="minOrderAmount"
                    value={formData.minOrderAmount || ''}
                    onChange={handleInputChange}
                    placeholder="400"
                    min="0"
                    step="0.01"
                    className="input-field"
                  />
                </div>

                {/* Usage Limits */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total Usage Limit
                    </label>
                    <input
                      type="number"
                      name="usageLimit"
                      value={formData.usageLimit || ''}
                      onChange={handleInputChange}
                      placeholder="100"
                      min="0"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Per User Limit
                    </label>
                    <input
                      type="number"
                      name="perUserLimit"
                      value={formData.perUserLimit || ''}
                      onChange={handleInputChange}
                      placeholder="1"
                      min="0"
                      className="input-field"
                    />
                  </div>
                </div>

                {/* Valid From & Until */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valid From *
                    </label>
                    <input
                      type="datetime-local"
                      name="validFrom"
                      value={formData.validFrom}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valid Until *
                    </label>
                    <input
                      type="datetime-local"
                      name="validUntil"
                      value={formData.validUntil}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                    {formErrors.validUntil && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.validUntil}</p>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                    className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent cursor-pointer"
                  />
                  <label className="ml-2 text-sm font-medium text-gray-700 cursor-pointer">
                    Active
                  </label>
                </div>

                {/* Applicable Categories */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Applicable Categories
                  </label>
                  <textarea
                    name="applicableCategories"
                    value={formData.applicableCategories.join(', ')}
                    onChange={handleInputChange}
                    placeholder="Electronics, Books, Clothing"
                    rows={2}
                    className="input-field resize-none"
                  />
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                    <p className="text-xs text-blue-700 font-medium">💡 How to add multiple categories:</p>
                    <p className="text-xs text-blue-600 mt-1">Type category names separated by commas. Example: <code className="bg-blue-100 px-1 rounded">Books, Electronics, Clothing</code></p>
                    <p className="text-xs text-blue-600 mt-1">Leave empty to apply to all categories</p>
                  </div>
                </div>
              </form>

              <div className="flex gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="coupon-form"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-accent text-white hover:bg-accent/90 disabled:opacity-50 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {isSubmitting && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {editingCoupon ? 'Update' : 'Create'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div 
            ref={deleteModalOverlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="presentation"
          >
            <motion.div
              ref={deleteModalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-modal-title"
            >
              <div className="p-6">
                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
                </div>
                <h3 id="delete-modal-title" className="text-lg sm:text-xl font-semibold text-center text-gray-900 mb-2">
                  Delete Coupon?
                </h3>
                <p className="text-center text-gray-500 text-sm mb-6">
                  Are you sure you want to delete the coupon <strong>{deletingCoupon?.code}</strong>? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setDeletingCoupon(null);
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isLoadingAPI}
                    className="flex-1 px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {isLoadingAPI && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Coupons;
