import React, { useEffect, useState, useRef } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  AlertTriangle,
  Ticket,
  BadgePercent,
  Clock3,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Coupon, CreateCouponPayload } from '../types';
import { createCoupon, updateCoupon, deleteCoupon } from '../services/couponService';
import { formatDate } from '../lib/utils';
import apiClient from '../lib/apiClient';

const formatCurrency = (value?: number) =>
  typeof value === 'number'
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      }).format(value)
    : '\u2014';

const COUPON_COUNT_KEYS = [
  'total',
  'totalCount',
  'count',
  'totalCoupons',
  'totalResults',
  'totalItems',
];

const extractCoupons = (payload: any): Coupon[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
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

    return findArray(payload) || [];
  }

  return [];
};

const extractTotalCoupons = (payload: any, fallback = 0): number => {
  const visit = (node: any): number | null => {
    if (!node || typeof node !== 'object') return null;

    for (const key of COUPON_COUNT_KEYS) {
      if (typeof node[key] === 'number') {
        return node[key];
      }
    }

    for (const value of Object.values(node)) {
      const found = visit(value);
      if (found !== null) return found;
    }

    return null;
  };

  return visit(payload) ?? fallback;
};

const Coupons: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoadingAPI, setIsLoadingAPI] = useState(false);

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
  const isServerPaginated = totalCount > coupons.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const displayedCoupons = isServerPaginated
    ? coupons
    : coupons.length <= limit
      ? coupons
      : coupons.slice((page - 1) * limit, page * limit);

  const now = new Date();
  const activeCouponsCount = coupons.filter((coupon) => coupon.isActive && new Date(coupon.validUntil) > now).length;
  const expiredCouponsCount = coupons.filter((coupon) => !coupon.isActive || new Date(coupon.validUntil) <= now).length;

  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const deleteModalOverlayRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const deleteModalContentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = (container: HTMLElement): HTMLButtonElement[] => {
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(
      (el: any) => !el.hasAttribute('disabled')
    ) as HTMLButtonElement[];
  };

  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModalOpen(false);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalOverlayRef.current &&
        event.target === modalOverlayRef.current
      ) {
        setIsModalOpen(false);
      }
    };

    const focusableElements = modalContentRef.current
      ? getFocusableElements(modalContentRef.current)
      : [];
    if (focusableElements.length > 0) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      focusableElements[0].focus();
    }

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

      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isDeleteModalOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDeleteModalOpen(false);
        setDeletingCoupon(null);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        deleteModalOverlayRef.current &&
        event.target === deleteModalOverlayRef.current
      ) {
        setIsDeleteModalOpen(false);
        setDeletingCoupon(null);
      }
    };

    const focusableElements = deleteModalContentRef.current
      ? getFocusableElements(deleteModalContentRef.current)
      : [];
    if (focusableElements.length > 0) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      focusableElements[0].focus();
    }

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

      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isDeleteModalOpen]);

  useEffect(() => {
    const fetchCoupons = async () => {
      setIsLoadingAPI(true);
      try {
        const response = await apiClient.get<any>('/admin/coupons', {
          params: { page, limit },
        });

        const couponsList = extractCoupons(response.data);
        const count = extractTotalCoupons(response.data, couponsList.length);

        setCoupons(couponsList);
        setTotalCount(count);
      } catch (error: any) {
        console.error('Error fetching coupons:', error.response?.status, error.message);
      } finally {
        setIsLoadingAPI(false);
      }
    };

    fetchCoupons();
  }, [page, limit]);

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
          prev.map((coupon) => (coupon._id === editingCoupon._id ? updatedCoupon : coupon))
        );
        toast.success('Coupon updated successfully!');
      } else {
        const response = await createCoupon(payload);
        const newCoupon = response.data.coupon;
        setCoupons((prev) => {
          if (!isServerPaginated) {
            return [newCoupon, ...prev];
          }

          if (page === 1) {
            return [newCoupon, ...prev].slice(0, limit);
          }

          return prev;
        });
        setTotalCount((prev) => prev + 1);
        if (isServerPaginated && page !== 1) {
          setPage(1);
        }
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
      setCoupons((prev) => prev.filter((coupon) => coupon._id !== deletingCoupon._id));
      setTotalCount((prev) => Math.max(0, prev - 1));
      if (!isServerPaginated && page > 1 && displayedCoupons.length === 1) {
        setPage((prev) => prev - 1);
      }
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
        applicableCategories: value.split(',').map((category) => category.trim()).filter((category) => category),
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
    return formatCurrency(coupon.discountValue);
  };

  const getMinOrderLabel = (coupon: Coupon): string => {
    return coupon.minOrderAmount ? formatCurrency(coupon.minOrderAmount) : '\u2014';
  };

  return (
    <div className="page-wrapper">
      <div style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 className="page-title">Coupons</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Create promotional offers and monitor which codes are still live.
          </p>
        </div>

        <div className="mini-stats-grid">
          {[
            {
              label: 'Total Coupons',
              value: totalCount,
              color: 'var(--info)',
              bg: 'var(--info-muted)',
              icon: Ticket,
            },
            {
              label: 'Active',
              value: activeCouponsCount,
              color: 'var(--success)',
              bg: 'var(--success-muted)',
              icon: BadgePercent,
            },
            {
              label: 'Expired',
              value: expiredCouponsCount,
              color: 'var(--danger)',
              bg: 'var(--danger-muted)',
              icon: Clock3,
            },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div
              key={label}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                  {label}
                </p>
                <p style={{ fontSize: '24px', fontWeight: 700, color, margin: 0 }}>{value}</p>
              </div>
              <div className="icon-box" style={{ background: bg }}>
                <Icon size={20} color={color} />
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar-row" style={{ marginBottom: 0 }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Coupons
          </h2>

          <button type="button" onClick={() => handleOpenModal()} className="btn-primary">
            <Plus size={18} />
            <span>Create Coupon</span>
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 'inherit' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Discount</th>
                  <th>Min Order</th>
                  <th>Valid Until</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoadingAPI ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={8}>
                        <div className="skeleton" style={{ height: 48 }} />
                      </td>
                    </tr>
                  ))
                ) : displayedCoupons.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                        <Tag size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <p style={{ fontSize: '15px', margin: '0 0 4px', color: 'var(--text-primary)' }}>
                          No coupons yet
                        </p>
                        <p style={{ fontSize: '13px', margin: 0 }}>
                          Create your first coupon to get started
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedCoupons.map((coupon) => {
                    const isExpired = !coupon.isActive || new Date(coupon.validUntil) <= now;

                    return (
                      <tr key={coupon._id} className="group">
                        <td>
                          <span
                            style={{
                              fontFamily: "'SFMono-Regular', Consolas, monospace",
                              color: 'var(--accent)',
                              fontWeight: 600,
                            }}
                          >
                            {coupon.code}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', maxWidth: 280 }}>
                          <div
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {coupon.description}
                          </div>
                        </td>
                        <td>
                          <span className={coupon.discountType === 'percentage' ? 'badge-info' : 'badge-warning'}>
                            {coupon.discountType === 'percentage' ? 'Percentage' : 'Flat'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{getDiscountLabel(coupon)}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{getMinOrderLabel(coupon)}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{formatDate(coupon.validUntil)}</td>
                        <td>
                          <span className={isExpired ? 'badge-danger' : 'badge-active'}>
                            {isExpired ? 'Expired' : 'Active'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '8px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenModal(coupon)}
                              className="action-icon-button"
                              aria-label="Edit coupon"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingCoupon(coupon);
                                setIsDeleteModalOpen(true);
                              }}
                              className="action-icon-button danger opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                              aria-label="Delete coupon"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderTop: '1px solid var(--border)',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                Page {page} of {totalPages}
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={page === 1}
                  onClick={() => setPage((previous) => previous - 1)}
                >
                  <ChevronLeft size={15} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={page === totalPages}
                  onClick={() => setPage((previous) => previous + 1)}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen ? (
          <div
            ref={modalOverlayRef}
            className="modal-backdrop"
            role="presentation"
          >
            <motion.div
              ref={modalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="modal-box modal-box-lg"
              role="dialog"
              aria-modal="true"
              aria-labelledby="coupon-modal-title"
            >
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
                  id="coupon-modal-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="action-icon-button"
                  aria-label="Close coupon modal"
                >
                  <X size={20} />
                </button>
              </div>

              <form
                id="coupon-form"
                onSubmit={handleSubmitForm}
                style={{ display: 'grid', gap: '16px' }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Coupon code</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    placeholder="SAVE30"
                    maxLength={20}
                    className="input-field"
                  />
                  {formErrors.code ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {formErrors.code}
                    </p>
                  ) : null}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="30% off on orders above ₹500"
                    rows={2}
                    className="input-field"
                  />
                  {formErrors.description ? (
                    <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                      {formErrors.description}
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
                    <label className="form-label">Discount type</label>
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

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Discount value</label>
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
                    {formErrors.discountValue ? (
                      <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                        {formErrors.discountValue}
                      </p>
                    ) : null}
                  </div>
                </div>

                {formData.discountType === 'percentage' ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Max discount amount</label>
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
                ) : null}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Minimum order amount</label>
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

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Usage limit</label>
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
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Per user limit</label>
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

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Applicable categories</label>
                    <input
                      type="text"
                      name="applicableCategories"
                      value={formData.applicableCategories.join(', ')}
                      onChange={handleInputChange}
                      placeholder="Books, Electronics, Clothing"
                      className="input-field"
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Valid from</label>
                    <input
                      type="datetime-local"
                      name="validFrom"
                      value={formData.validFrom}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Valid until</label>
                    <input
                      type="datetime-local"
                      name="validUntil"
                      value={formData.validUntil}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                    {formErrors.validUntil ? (
                      <p style={{ color: 'var(--danger)', fontSize: '12px', margin: '6px 0 0' }}>
                        {formErrors.validUntil}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className={`status-toggle ${formData.isActive ? 'is-active' : ''}`}
                    onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                    aria-pressed={formData.isActive}
                    aria-label="Toggle coupon status"
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {formData.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                  }}
                >
                  Separate category names with commas. Leave this empty to apply the coupon to all categories.
                </div>
              </form>

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
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="coupon-form"
                  disabled={isSubmitting}
                  className="btn-primary"
                >
                  {isSubmitting ? (editingCoupon ? 'Updating...' : 'Creating...') : editingCoupon ? 'Update' : 'Create'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen ? (
          <div
            ref={deleteModalOverlayRef}
            className="modal-backdrop"
            role="presentation"
          >
            <motion.div
              ref={deleteModalContentRef}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="modal-box"
              style={{ maxWidth: '400px' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-coupon-title"
            >
              <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--danger-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <AlertTriangle size={24} color="var(--danger)" />
                </div>
                <h2
                  id="delete-coupon-title"
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    margin: '0 0 8px',
                    color: 'var(--text-primary)',
                  }}
                >
                  Delete coupon?
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  This will permanently delete {deletingCoupon?.code}. This action cannot be undone.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletingCoupon(null);
                  }}
                  className="btn-ghost"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isLoadingAPI}
                  className="btn-danger"
                  style={{ flex: 1 }}
                >
                  {isLoadingAPI ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default Coupons;
