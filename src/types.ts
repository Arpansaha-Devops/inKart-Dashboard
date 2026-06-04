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
  isCustomizable?: boolean;
  basePrice: number;
  image: string;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token: string;
  refreshToken: string;
  user?: User;
  data?: {
    user: User;
    token?: string;
    refreshToken?: string;
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

export interface Category {
  _id: string;
  name: string;
  description?: string;
  slug?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string;
  slug?: string;
  isActive: boolean;
}

export interface StockUpdatePayload {
  quantity: number;
  operation: 'add' | 'subtract';
}

export interface RevenueDataPoint {
  label: string;
  revenue: number;
  date?: string;
}

export interface AnalyticsMetric {
  key: string;
  label: string;
  value: number;
  trend?: number | null;
}

export interface AnalyticsDashboardStats {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  metrics: AnalyticsMetric[];
}

export interface RevenueOverTimeResponse {
  success: boolean;
  data: RevenueDataPoint[];
  raw?: unknown;
}

export interface DashboardStatsResponse {
  success: boolean;
  data: AnalyticsDashboardStats;
  raw?: unknown;
}
