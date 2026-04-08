export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  category: string;
  productType: 'stocked' | 'on_demand';
  stock: number;
  basePrice: number;
  image: string;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  refreshToken: string;
  user?: User;
  data?: {
    user: User;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data?: T[];
  users?: T[];
  products?: T[];
  totalCount?: number;
  total?: number;
  page: number;
  limit: number;
}

export interface Coupon {
  _id: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  maxDiscountAmount?: number;
  minOrderAmount?: number;
  usageLimit?: number;
  perUserLimit?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableCategories: string[];
  createdAt?: string;
}

export interface CreateCouponPayload {
  code: string;
  description: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  maxDiscountAmount?: number;
  minOrderAmount?: number;
  usageLimit?: number;
  perUserLimit?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableCategories: string[];
}

export interface CouponResponse {
  success: boolean;
  data: { coupon: Coupon };
}
