import React, { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Package,
  ShoppingBag,
  Tag,
  Ticket,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { User } from '../types';

const DashboardCharts = lazy(() => import('../components/DashboardCharts'));

type DashboardStats = {
  totalUsers: number;
  totalProducts: number;
  totalCoupons: number;
  activeCategories: number;
};

type DashboardChartData = {
  labels: string[];
  datasets: {
    data: number[];
    backgroundColor: string[] | string;
    borderWidth?: number;
    borderRadius?: number;
    borderSkipped?: false;
  }[];
};

type DashboardDataState = {
  stats: DashboardStats;
  isLoading: boolean;
  recentUsers: User[];
  recentPurchasedOrders: DashboardActivityOrder[];
  recentDeliveredOrders: DashboardActivityOrder[];
  doughnutData: DashboardChartData;
  barData: DashboardChartData;
};

type DashboardDataAction =
  | {
      type: 'SET_SUMMARY';
      payload: {
        stats: DashboardStats;
        recentUsers: User[];
        recentPurchasedOrders: DashboardActivityOrder[];
        recentDeliveredOrders: DashboardActivityOrder[];
      };
    }
  | { type: 'SET_DOUGHNUT_DATA'; payload: DashboardChartData }
  | { type: 'SET_BAR_DATA'; payload: DashboardChartData }
  | { type: 'SET_LOADING'; payload: boolean };

const COMMON_ARRAY_KEYS = ['data', 'users', 'products', 'coupons', 'categories', 'results', 'items', 'list', 'docs'];
const COMMON_COUNT_KEYS = ['totalCount', 'total', 'count', 'totalResults', 'length'];
const PRODUCT_CHART_LIMIT = 500;
const COUPON_CHART_LIMIT = 50;
const ACTIVITY_ORDER_LIMIT = 8;

type DashboardActivityOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  deliveredAt: string;
  status: string;
};

type DashboardActivityItem = {
  id: string;
  type: 'user' | 'purchase' | 'delivery';
  title: string;
  description: string;
  timestamp: string;
  sortTime: number;
  badge: string;
};

const quickActions = [
  {
    to: '/products',
    icon: Package,
    iconColor: 'var(--accent)',
    title: 'Add Product',
    description: 'Create a new listing',
  },
  {
    to: '/customers',
    icon: Users,
    iconColor: 'var(--info)',
    title: 'View Users',
    description: 'Manage customers',
  },
  {
    to: '/categories',
    icon: Tag,
    iconColor: 'var(--success)',
    title: 'Add Category',
    description: 'Create a new category',
  },
  {
    to: '/coupons',
    icon: Ticket,
    iconColor: 'var(--warning)',
    title: 'Add Coupon',
    description: 'Create a discount',
  },
];

const dashboardDataInitialState: DashboardDataState = {
  stats: {
    totalUsers: 0,
    totalProducts: 0,
    totalCoupons: 0,
    activeCategories: 0,
  },
  isLoading: true,
  recentUsers: [],
  recentPurchasedOrders: [],
  recentDeliveredOrders: [],
  doughnutData: {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
        borderWidth: 0,
      },
    ],
  },
  barData: {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: '#F97316',
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  },
};

function dashboardDataReducer(
  state: DashboardDataState,
  action: DashboardDataAction
): DashboardDataState {
  switch (action.type) {
    case 'SET_SUMMARY':
      return {
        ...state,
        stats: action.payload.stats,
        recentUsers: action.payload.recentUsers,
        recentPurchasedOrders: action.payload.recentPurchasedOrders,
        recentDeliveredOrders: action.payload.recentDeliveredOrders,
      };
    case 'SET_DOUGHNUT_DATA':
      return { ...state, doughnutData: action.payload };
    case 'SET_BAR_DATA':
      return { ...state, barData: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

type ChartThemeColors = {
  textSecondary: string;
  border: string;
};

const getChartThemeColors = (): ChartThemeColors => {
  if (typeof window === 'undefined') {
    return {
      textSecondary: '#a0a0a0',
      border: '#2e2e2e',
    };
  }

  const styles = getComputedStyle(document.body);

  return {
    textSecondary: styles.getPropertyValue('--text-secondary').trim() || '#a0a0a0',
    border: styles.getPropertyValue('--border').trim() || '#2e2e2e',
  };
};

const findCount = (payload: unknown): number | null => {
  if (typeof payload === 'number') return payload;
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return null;

  const obj = payload as Record<string, unknown>;

  for (const key of COMMON_COUNT_KEYS) {
    if (typeof obj[key] === 'number') {
      return obj[key] as number;
    }
  }

  for (const key of COMMON_ARRAY_KEYS) {
    if (Array.isArray(obj[key])) {
      return (obj[key] as unknown[]).length;
    }
  }

  for (const value of Object.values(obj)) {
    const nested = findCount(value);
    if (nested !== null) return nested;
  }

  return null;
};

const normalizeValue = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const createChartColors = (labels: string[]): string[] => {
  const n = Math.max(1, labels.length);
  return labels.map((label, index) => {
    const seed = hashString(label || `chart-item-${index}`);
    // base hue from hash to vary per-label, then spread hues by index to avoid collisions
    const baseHue = seed % 360;
    const spread = Math.floor(360 / n) || 1;
    const hue = Math.round((baseHue + index * spread) % 360);
    const saturation = 60 + (seed % 16); // 60-75%
    const lightness = 44 + ((seed >> 3) % 12); // 44-55%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  });
};

const isCategoryLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.name === 'string');

const isProductLike = (item: any): boolean =>
  Boolean(
    item &&
      typeof item === 'object' &&
      (typeof item._id === 'string' || typeof item.id === 'string') &&
      typeof item.name === 'string'
  );

const isCouponLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.code === 'string');

const isOrderLike = (item: any): boolean =>
  Boolean(
    item &&
      typeof item === 'object' &&
      (typeof item._id === 'string' || typeof item.id === 'string') &&
      (
        typeof item.orderNumber === 'string' ||
        typeof item.orderId === 'string' ||
        typeof item.orderStatus === 'string'
      )
  );

const isUserLike = (item: any): item is User =>
  Boolean(
    item &&
      typeof item === 'object' &&
      typeof item._id === 'string' &&
      (typeof item.email === 'string' || typeof item.name === 'string')
  );

const pickBestArray = (payload: any, validator: (item: any) => boolean, directCandidates: any[] = []) => {
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      const filtered = candidate.filter(validator);
      if (filtered.length > 0) return filtered;
    }
  }

  const arrays = collectArrays(payload);
  let best: any[] = [];
  arrays.forEach((arr) => {
    const filtered = arr.filter(validator);
    if (filtered.length > best.length) {
      best = filtered;
    }
  });

  return best;
};

const collectArrays = (node: unknown, arrays: any[][] = []): any[][] => {
  if (Array.isArray(node)) {
    arrays.push(node);
    return arrays;
  }

  if (!node || typeof node !== 'object') {
    return arrays;
  }

  Object.values(node as Record<string, unknown>).forEach((value) => collectArrays(value, arrays));
  return arrays;
};

const extractUsers = (payload: any): User[] => {
  const directCandidates = [
    payload?.users,
    payload?.data?.users,
    payload?.data?.data?.users,
    payload?.data?.items,
    payload?.data,
  ];

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate) && candidate.some(isUserLike)) {
      return candidate.filter(isUserLike);
    }
  }

  const deepCandidates = collectArrays(payload);
  let best: User[] = [];
  deepCandidates.forEach((arr) => {
    const filtered = arr.filter(isUserLike);
    if (filtered.length > best.length) {
      best = filtered;
    }
  });

  return best;
};

const extractProducts = (payload: any): any[] =>
  pickBestArray(payload, isProductLike, [
    payload?.products,
    payload?.data?.products,
    payload?.data?.items,
    payload?.data?.docs,
    payload?.data,
  ]);

const extractActivityOrders = (payload: any): DashboardActivityOrder[] => {
  const rows = pickBestArray(payload, isOrderLike, [
    payload?.orders,
    payload?.data?.orders,
    payload?.data?.items,
    payload?.data?.docs,
    payload?.data,
  ]);

  return rows.flatMap((order: any) => {
    const id = String(order?._id || order?.id || '').trim();
    if (!id) return [];

    const customer = order?.customer || order?.user || {};
    const shiprocket = order?.shiprocket || order?.shipment || {};

    return [{
      id,
      orderNumber: String(order?.orderNumber || order?.orderId || id).trim(),
      customerName: String(
        customer?.name ||
        order?.customerName ||
        order?.address?.fullName ||
        'Customer'
      ).trim(),
      createdAt: String(order?.createdAt || '').trim(),
      deliveredAt: String(
        order?.deliveredAt ||
        order?.deliveryDate ||
        shiprocket?.deliveredDate ||
        shiprocket?.delivered_date ||
        order?.updatedAt ||
        ''
      ).trim(),
      status: normalizeValue(order?.orderStatus || order?.status),
    }];
  });
};

const activityDateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const toActivityTime = (value: string): number => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatActivityTime = (value: string): string => {
  const timestamp = toActivityTime(value);
  if (!timestamp) return 'Recently';

  const elapsed = Date.now() - timestamp;
  if (elapsed >= 0 && elapsed < 60_000) return 'Just now';
  if (elapsed >= 0 && elapsed < 3_600_000) return `${Math.max(1, Math.floor(elapsed / 60_000))}m ago`;
  if (elapsed >= 0 && elapsed < 86_400_000) return `${Math.max(1, Math.floor(elapsed / 3_600_000))}h ago`;

  return activityDateFormatter.format(new Date(timestamp));
};

const formatActivityDateTitle = (value: string): string => {
  const timestamp = toActivityTime(value);
  return timestamp ? activityDateFormatter.format(new Date(timestamp)) : 'Recently';
};

const Dashboard: React.FC = () => {
  const [state, dispatch] = useReducer(dashboardDataReducer, dashboardDataInitialState);
  const {
    stats,
    isLoading,
    recentUsers,
    recentPurchasedOrders,
    recentDeliveredOrders,
    doughnutData,
    barData,
  } = state;
  const hasShownDashboardErrorRef = useRef(false);
  const lastKnownCounts = useRef({
    users: 0,
    products: 0,
    coupons: 0,
    categories: 0,
  });
  const lastKnownRecentUsers = useRef<User[]>([]);
  const lastKnownPurchasedOrders = useRef<DashboardActivityOrder[]>([]);
  const lastKnownDeliveredOrders = useRef<DashboardActivityOrder[]>([]);
  const [chartTheme, setChartTheme] = useState<ChartThemeColors>(getChartThemeColors);

  useEffect(() => {
    const syncTheme = () => {
      setChartTheme(getChartThemeColors());
    };

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('themechange', syncTheme as EventListener);

    return () => {
      observer.disconnect();
      window.removeEventListener('themechange', syncTheme as EventListener);
    };
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [
          usersRes,
          productsRes,
          couponsRes,
          categoriesRes,
          purchasedOrdersRes,
          deliveredOrdersRes,
        ] = await Promise.allSettled([
          apiClient.get('/users/all', { params: { page: 1, limit: 5 } }),
          apiClient.get('/admin/products', {
            params: { page: 1, limit: PRODUCT_CHART_LIMIT, _ts: Date.now() },
          }),
          apiClient.get('/admin/coupons', { params: { page: 1, limit: COUPON_CHART_LIMIT } }),
          apiClient.get('/admin/categories'),
          apiClient.get('/admin/orders', {
            params: { page: 1, limit: ACTIVITY_ORDER_LIMIT, paymentStatus: 'paid' },
          }),
          apiClient.get('/admin/orders', {
            params: {
              page: 1,
              limit: ACTIVITY_ORDER_LIMIT,
              paymentStatus: 'paid',
              status: 'delivered',
            },
          }),
        ]);

        const usersPayload = usersRes.status === 'fulfilled' ? usersRes.value.data : null;
        const productsPayload = productsRes.status === 'fulfilled' ? productsRes.value.data : null;
        const couponsPayload = couponsRes.status === 'fulfilled' ? couponsRes.value.data : null;
        const categoriesPayload = categoriesRes.status === 'fulfilled' ? categoriesRes.value.data : null;
        const purchasedOrdersPayload =
          purchasedOrdersRes.status === 'fulfilled' ? purchasedOrdersRes.value.data : null;
        const deliveredOrdersPayload =
          deliveredOrdersRes.status === 'fulfilled' ? deliveredOrdersRes.value.data : null;
        let chartProductsPayload = productsPayload;
        const chartCouponsPayload = couponsPayload;
        const failedCalls = [
          usersRes,
          productsRes,
          couponsRes,
          categoriesRes,
          purchasedOrdersRes,
          deliveredOrdersRes,
        ].filter(
          (result) => result.status === 'rejected'
        ).length;

        const dashboardUsers =
          usersRes.status === 'fulfilled'
            ? extractUsers(usersPayload)
            : lastKnownRecentUsers.current;
        if (usersRes.status === 'fulfilled') {
          lastKnownRecentUsers.current = dashboardUsers;
        }

        const dashboardPurchasedOrders =
          purchasedOrdersRes.status === 'fulfilled'
            ? extractActivityOrders(purchasedOrdersPayload)
            : lastKnownPurchasedOrders.current;
        if (purchasedOrdersRes.status === 'fulfilled') {
          lastKnownPurchasedOrders.current = dashboardPurchasedOrders;
        }

        const dashboardDeliveredOrders =
          deliveredOrdersRes.status === 'fulfilled'
            ? extractActivityOrders(deliveredOrdersPayload).filter(
                (order) => order.status === 'delivered'
              )
            : lastKnownDeliveredOrders.current;
        if (deliveredOrdersRes.status === 'fulfilled') {
          lastKnownDeliveredOrders.current = dashboardDeliveredOrders;
        }

        const categories = pickBestArray(categoriesPayload, isCategoryLike, [
          (categoriesPayload as any)?.categories,
          (categoriesPayload as any)?.data?.categories,
          (categoriesPayload as any)?.data,
        ]);

        let chartProducts = extractProducts(chartProductsPayload);

        if (chartProducts.length === 0) {
          try {
            const publicProductsResponse = await apiClient.get('/products', {
              params: { page: 1, limit: PRODUCT_CHART_LIMIT },
            });
            chartProductsPayload = publicProductsResponse.data;
            chartProducts = extractProducts(chartProductsPayload);
          } catch {
            // Keep the admin endpoint result as the dashboard source when public fallback is unavailable.
          }
        }

        const nextCounts = {
          users: usersRes.status === 'fulfilled'
            ? findCount(usersPayload) ?? lastKnownCounts.current.users
            : lastKnownCounts.current.users,
          products: chartProducts.length > 0
            ? chartProducts.length
            : productsRes.status === 'fulfilled'
              ? findCount(productsPayload) ?? lastKnownCounts.current.products
            : lastKnownCounts.current.products,
          coupons: couponsRes.status === 'fulfilled'
            ? findCount(couponsPayload) ?? lastKnownCounts.current.coupons
            : lastKnownCounts.current.coupons,
          categories: categoriesRes.status === 'fulfilled'
            ? categories.filter((category: any) => category?.isActive === true).length
            : lastKnownCounts.current.categories,
        };
        lastKnownCounts.current = nextCounts;
        const chartCoupons = pickBestArray(chartCouponsPayload, isCouponLike, [
          (chartCouponsPayload as any)?.coupons,
          (chartCouponsPayload as any)?.data?.coupons,
          (chartCouponsPayload as any)?.data?.items,
          (chartCouponsPayload as any)?.data?.docs,
          (chartCouponsPayload as any)?.data,
        ]);

        dispatch({
          type: 'SET_SUMMARY',
          payload: {
            stats: {
              totalUsers: nextCounts.users,
              totalProducts: nextCounts.products,
              totalCoupons: nextCounts.coupons,
              activeCategories: nextCounts.categories,
            },
            recentUsers: dashboardUsers.slice(0, 5),
            recentPurchasedOrders: dashboardPurchasedOrders.slice(0, ACTIVITY_ORDER_LIMIT),
            recentDeliveredOrders: dashboardDeliveredOrders.slice(0, ACTIVITY_ORDER_LIMIT),
          },
        });

        if (categories.length > 0 && chartProducts.length > 0) {
          const fullLabels = categories.map((category: any) => category?.name || 'Unnamed');
          const shortenLabel = (s: string, max = 24) =>
            typeof s === 'string' && s.length > max ? `${s.slice(0, max - 3)}...` : s;
          const counts = categories.map((category: any) => {
            const categoryId = normalizeValue(category?._id);
            const categoryName = normalizeValue(category?.name);
            const categorySlug = normalizeValue(category?.slug);

            return chartProducts.reduce((total: number, product: any) => {
              const productCategory = product?.category;

              if (typeof productCategory === 'string') {
                const normalized = normalizeValue(productCategory);
                if (
                  (categoryId && normalized === categoryId) ||
                  (categoryName && normalized === categoryName) ||
                  (categorySlug && normalized === categorySlug)
                ) {
                  return total + 1;
                }
              }

              if (productCategory && typeof productCategory === 'object') {
                const nestedId = normalizeValue((productCategory as any)?._id || (productCategory as any)?.id);
                const nestedName = normalizeValue((productCategory as any)?.name);
                const nestedSlug = normalizeValue((productCategory as any)?.slug);

                if (
                  (categoryId && nestedId === categoryId) ||
                  (categoryName && nestedName === categoryName) ||
                  (categorySlug && nestedSlug === categorySlug)
                ) {
                  return total + 1;
                }
              }

              return total;
            }, 0);
          });

          // Pair full labels with counts and filter out zero-count categories
          const paired = fullLabels.map((full, i) => ({ full, count: counts[i] || 0 }));
          const filtered = paired.filter((p) => p.count > 0);

          if (filtered.length === 0) {
            dispatch({
              type: 'SET_DOUGHNUT_DATA',
              payload: {
                labels: [],
                datasets: [
                  { data: [], backgroundColor: [], borderWidth: 0 },
                ],
              },
            });
          } else {
            const shortLabels = filtered.map((p) => shortenLabel(p.full));
            const dataCounts = filtered.map((p) => p.count);
            const bgColors = createChartColors(filtered.map((p) => p.full));

            dispatch({
              type: 'SET_DOUGHNUT_DATA',
              payload: {
                labels: shortLabels,
                datasets: [
                  {
                    data: dataCounts,
                    backgroundColor: bgColors,
                    borderWidth: 0,
                    // @ts-ignore - store full labels for tooltip
                    fullLabels: filtered.map((p) => p.full),
                  },
                ],
              },
            });
          }
        } else if (chartProducts.length > 0) {
          const fallbackMap = new Map<string, number>();

          chartProducts.forEach((product: any) => {
            const categoryValue =
              typeof product?.category === 'string'
                ? product.category
                : product?.category?.name || product?.category?._id;

            const key = categoryValue?.toString().trim();
            if (!key) return;

            fallbackMap.set(key, (fallbackMap.get(key) || 0) + 1);
          });

          const labels = Array.from(fallbackMap.keys());
          const values = Array.from(fallbackMap.values());
          const shortenLabel = (s: string, max = 24) =>
            typeof s === 'string' && s.length > max ? `${s.slice(0, max - 3)}...` : s;

          const paired = labels.map((l, i) => ({ full: l, count: values[i] || 0 }));
          const filtered = paired.filter((p) => p.count > 0);

          if (filtered.length === 0) {
            dispatch({
              type: 'SET_DOUGHNUT_DATA',
              payload: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }] },
            });
          } else {
            const shortLabels = filtered.map((p) => shortenLabel(p.full));
            const dataCounts = filtered.map((p) => p.count);
            const bgColors = createChartColors(filtered.map((p) => p.full));

            dispatch({
              type: 'SET_DOUGHNUT_DATA',
              payload: {
                labels: shortLabels,
                datasets: [
                  {
                    data: dataCounts,
                    backgroundColor: bgColors,
                    borderWidth: 0,
                    // @ts-ignore
                    fullLabels: filtered.map((p) => p.full),
                  },
                ],
              },
            });
          }
        } else {
          dispatch({
            type: 'SET_DOUGHNUT_DATA',
            payload: {
              labels: [],
              datasets: [
                {
                  data: [],
                  backgroundColor: [],
                  borderWidth: 0,
                },
              ],
            },
          });
        }

        const couponRows = chartCoupons.flatMap((coupon: any) => {
          if (typeof coupon?.code !== 'string' || coupon.code.trim().length === 0) {
            return [];
          }

          return [{
            code: coupon.code as string,
            discountValue: Number(coupon?.discountValue) || 0,
          }];
        });

        dispatch({
          type: 'SET_BAR_DATA',
          payload: {
            labels: couponRows.map((coupon) => coupon.code),
            datasets: [
              {
                data: couponRows.map((coupon) => coupon.discountValue),
                backgroundColor: createChartColors(couponRows.map((coupon) => coupon.code)),
                borderRadius: 8,
                borderSkipped: false,
              },
            ],
          },
        });

        if (
          failedCalls > 0 &&
          !usersPayload &&
          !productsPayload &&
          !couponsPayload &&
          !categoriesPayload &&
          !hasShownDashboardErrorRef.current
        ) {
          toast.error('Failed to load dashboard data');
          hasShownDashboardErrorRef.current = true;
        }

        if (
          usersPayload ||
          productsPayload ||
          couponsPayload ||
          categoriesPayload ||
          purchasedOrdersPayload ||
          deliveredOrdersPayload
        ) {
          hasShownDashboardErrorRef.current = false;
        }
      } catch (error: any) {
        console.error('Error fetching dashboard data', error);
        toast.error(error?.response?.data?.message || 'Failed to load dashboard');
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    fetchDashboardData();
    const intervalId = setInterval(fetchDashboardData, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const chartFallback = useMemo(
    () => <div className="skeleton" style={{ width: '100%', height: '100%' }} />,
    []
  );

  const recentActivities = useMemo<DashboardActivityItem[]>(() => {
    const userActivities = recentUsers.map((user) => ({
      id: `user-${user._id}`,
      type: 'user' as const,
      title: 'New user registered',
      description: `${user.name || 'Unnamed user'} · ${user.email || 'No email'}`,
      timestamp: user.createdAt,
      sortTime: toActivityTime(user.createdAt),
      badge: 'User',
    }));

    const purchaseActivities = recentPurchasedOrders.map((order) => ({
      id: `purchase-${order.id}`,
      type: 'purchase' as const,
      title: 'New order purchased',
      description: `${order.orderNumber} · ${order.customerName}`,
      timestamp: order.createdAt,
      sortTime: toActivityTime(order.createdAt),
      badge: 'Paid',
    }));

    const deliveryActivities = recentDeliveredOrders.map((order) => ({
      id: `delivery-${order.id}`,
      type: 'delivery' as const,
      title: `${order.orderNumber} delivered`,
      description: `Successfully delivered to ${order.customerName}`,
      timestamp: order.deliveredAt,
      sortTime: toActivityTime(order.deliveredAt),
      badge: 'Delivered',
    }));

    return [...userActivities, ...purchaseActivities, ...deliveryActivities]
      .sort((left, right) => right.sortTime - left.sortTime)
      .slice(0, 5);
  }, [recentDeliveredOrders, recentPurchasedOrders, recentUsers]);

  const statCards = [
    {
      name: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      iconColor: 'var(--accent)',
      background: 'var(--accent-muted)',
    },
    {
      name: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      iconColor: 'var(--info)',
      background: 'var(--info-muted)',
    },
    {
      name: 'Total Coupons',
      value: stats.totalCoupons,
      icon: Ticket,
      iconColor: 'var(--warning)',
      background: 'var(--warning-muted)',
    },
    {
      name: 'Active Categories',
      value: stats.activeCategories,
      icon: Tag,
      iconColor: 'var(--success)',
      background: 'var(--success-muted)',
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="stat-grid">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="card card-hover"
            style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
          >
            <div className="icon-box" style={{ background: stat.background }}>
              <stat.icon size={20} color={stat.iconColor} />
            </div>
            <div>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  margin: '0 0 4px',
                }}
              >
                {stat.name}
              </p>
              <p
                style={{
                  fontSize: '26px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                {isLoading ? (
                  <span
                    className="skeleton"
                    style={{ width: 40, height: 26, display: 'inline-block' }}
                  />
                ) : (
                  stat.value
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="card" style={{ padding: '20px' }}>
          <h3 className="section-title">Products by category</h3>
          <div
            style={{
              height: '280px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isLoading ? (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            ) : doughnutData.labels.length === 0 ? (
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
                No data available
              </p>
            ) : (
              <Suspense fallback={chartFallback}>
                <DashboardCharts
                  chart="products"
                  chartTheme={chartTheme}
                  doughnutData={doughnutData}
                  barData={barData}
                />
              </Suspense>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 className="section-title">Coupon discounts</h3>
          <div
            style={{
              height: '280px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isLoading ? (
              <div className="skeleton" style={{ width: '100%', height: '100%' }} />
            ) : barData.labels.length === 0 ? (
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
                No data available
              </p>
            ) : (
              <Suspense fallback={chartFallback}>
                <DashboardCharts
                  chart="coupons"
                  chartTheme={chartTheme}
                  doughnutData={doughnutData}
                  barData={barData}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      <div className="split-grid">
        <div className="card" style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 className="section-title" style={{ margin: 0 }}>
              Recent Activity
            </h3>
            <TrendingUp size={16} color="var(--text-muted)" />
          </div>

          {isLoading ? (
            <div className="dashboard-activity-list">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton dashboard-activity-skeleton" />
              ))}
            </div>
          ) : recentActivities.length === 0 ? (
            <div className="dashboard-activity-empty">
              <TrendingUp size={24} />
              <strong>No recent activity</strong>
              <span>Registrations and order updates will appear here.</span>
            </div>
          ) : (
            <div className="dashboard-activity-list">
              {recentActivities.map((activity) => {
                const ActivityIcon =
                  activity.type === 'delivery'
                    ? CheckCircle2
                    : activity.type === 'purchase'
                      ? ShoppingBag
                      : UserCheck;

                return (
                  <article
                    key={activity.id}
                    className="dashboard-activity-row"
                    data-activity-type={activity.type}
                  >
                    <span className="dashboard-activity-icon" aria-hidden="true">
                      <ActivityIcon size={17} />
                    </span>
                    <div className="dashboard-activity-copy">
                      <div className="dashboard-activity-title-line">
                        <strong>{activity.title}</strong>
                        <span className="dashboard-activity-badge">{activity.badge}</span>
                      </div>
                      <p title={activity.description}>{activity.description}</p>
                    </div>
                    <time
                      className="dashboard-activity-time"
                      dateTime={activity.timestamp || undefined}
                      title={formatActivityDateTitle(activity.timestamp)}
                    >
                      {formatActivityTime(activity.timestamp)}
                    </time>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 className="section-title">Quick Actions</h3>
          <div className="quick-actions-grid">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to} className="quick-action-card">
                <action.icon size={22} color={action.iconColor} />
                <p
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {action.title}
                </p>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    margin: 0,
                  }}
                >
                  {action.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
