/**
 * Coupon service — all coupon-related API calls.
 * Uses the apiClient which auto-handles auth.
 */
import apiClient from '../lib/apiClient';
import { CreateCouponPayload, CouponResponse } from '../types';

/**
 * Create a new coupon.
 */
export const createCoupon = async (data: CreateCouponPayload): Promise<CouponResponse> => {
  const response = await apiClient.post('/admin/coupons', data);
  return response.data;
};

/**
 * Update an existing coupon.
 */
export const updateCoupon = async (
  couponId: string,
  data: Partial<CreateCouponPayload>,
): Promise<CouponResponse> => {
  const response = await apiClient.patch(`/admin/coupons/${couponId}`, data);
  return response.data;
};

/**
 * Delete a coupon.
 */
export const deleteCoupon = async (couponId: string): Promise<void> => {
  await apiClient.delete(`/admin/coupons/${couponId}`);
};
