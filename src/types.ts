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
