import React, { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Users, Package, Tag, Layers, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

type DashboardStats = {
  totalUsers: number;
  totalProducts: number;
  totalCoupons: number;
  activeCategories: number;
};

const COMMON_ARRAY_KEYS = ['data', 'users', 'products', 'coupons', 'categories', 'results', 'items', 'list', 'docs'];
const COMMON_COUNT_KEYS = ['totalCount', 'total', 'count', 'totalResults', 'length'];
const CHART_COLORS = ['#534AB7', '#0F6E56', '#993C1D', '#185FA5', '#854F0B', '#A32D2D'];

const doughnutOptions = {
  responsive: true,
  plugins: {
    legend: { position: 'right' as const },
    title: { display: true, text: 'Products by category' },
  },
};

const barOptions = {
  responsive: true,
  plugins: {
    legend: { display: false },
    title: { display: true, text: 'Coupon discount values (%)' },
  },
  scales: {
    y: { beginAtZero: true },
  },
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

const isCategoryLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.name === 'string');

const isProductLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.name === 'string');

const isCouponLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.code === 'string');

const pickBestArray = (payload: any, validator: (item: any) => boolean, directCandidates: any[] = []) => {
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      const filtered = candidate.filter(validator);
      if (filtered.length > 0) return filtered;
    }
  }

  const arrays = collectArrays(payload);
  const best = arrays
    .map((arr) => arr.filter(validator))
    .sort((a, b) => b.length - a.length)[0];

  return best || [];
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

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalProducts: 0,
    totalCoupons: 0,
    activeCategories: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const hasShownDashboardErrorRef = useRef(false);

  const [doughnutData, setDoughnutData] = useState({
    labels: [] as string[],
    datasets: [
      {
        data: [] as number[],
        backgroundColor: [] as string[],
      },
    ],
  });

  const [barData, setBarData] = useState({
    labels: [] as string[],
    datasets: [
      {
        data: [] as number[],
        backgroundColor: '#534AB7',
      },
    ],
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [
          usersRes,
          productsRes,
          couponsRes,
          categoriesRes,
          chartProductsRes,
          chartCouponsRes,
        ] = await Promise.allSettled([
          apiClient.get('/users/all', { params: { limit: 1 } }),
          apiClient.get('/admin/products', { params: { limit: 1 } }),
          apiClient.get('/admin/coupons', { params: { page: 1, limit: 1 } }),
          apiClient.get('/admin/categories'),
          apiClient.get('/admin/products', { params: { page: 1, limit: 200 } }),
          apiClient.get('/admin/coupons', { params: { page: 1, limit: 50 } }),
        ]);

        const usersPayload = usersRes.status === 'fulfilled' ? usersRes.value.data : null;
        const productsPayload = productsRes.status === 'fulfilled' ? productsRes.value.data : null;
        const couponsPayload = couponsRes.status === 'fulfilled' ? couponsRes.value.data : null;
        const categoriesPayload = categoriesRes.status === 'fulfilled' ? categoriesRes.value.data : null;
        const chartProductsPayload = chartProductsRes.status === 'fulfilled' ? chartProductsRes.value.data : null;
        const chartCouponsPayload = chartCouponsRes.status === 'fulfilled' ? chartCouponsRes.value.data : null;
        const failedCalls = [
          usersRes,
          productsRes,
          couponsRes,
          categoriesRes,
          chartProductsRes,
          chartCouponsRes,
        ].filter((result) => result.status === 'rejected').length;

        const totalUsers = findCount(usersPayload) ?? 0;
        const totalProducts = findCount(productsPayload) ?? 0;
        const totalCoupons = findCount(couponsPayload) ?? 0;

        const categories = pickBestArray(categoriesPayload, isCategoryLike, [
          (categoriesPayload as any)?.categories,
          (categoriesPayload as any)?.data?.categories,
          (categoriesPayload as any)?.data,
        ]);
        const activeCategories = categories.filter((category: any) => category?.isActive === true).length;

        setStats({
          totalUsers,
          totalProducts,
          totalCoupons,
          activeCategories,
        });

        const chartProducts = pickBestArray(chartProductsPayload, isProductLike, [
          (chartProductsPayload as any)?.products,
          (chartProductsPayload as any)?.data?.products,
          (chartProductsPayload as any)?.data?.items,
          (chartProductsPayload as any)?.data?.docs,
          (chartProductsPayload as any)?.data,
        ]);
        const chartCoupons = pickBestArray(chartCouponsPayload, isCouponLike, [
          (chartCouponsPayload as any)?.coupons,
          (chartCouponsPayload as any)?.data?.coupons,
          (chartCouponsPayload as any)?.data?.items,
          (chartCouponsPayload as any)?.data?.docs,
          (chartCouponsPayload as any)?.data,
        ]);

        if (categories.length > 0) {
          const labels = categories.map((category: any) => category?.name || 'Unnamed');
          const counts = categories.map((category: any) => {
            const categoryId = normalizeValue(category?._id);
            const categoryName = normalizeValue(category?.name);
            const categorySlug = normalizeValue(category?.slug);

            return chartProducts.reduce((total: number, product: any) => {
              const productCategory = product?.category;

              if (typeof productCategory === 'string') {
                const normalized = normalizeValue(productCategory);
                if (
                  normalized === categoryId ||
                  normalized === categoryName ||
                  normalized === categorySlug
                ) {
                  return total + 1;
                }
              }

              if (productCategory && typeof productCategory === 'object') {
                const nestedId = normalizeValue((productCategory as any)?._id || (productCategory as any)?.id);
                const nestedName = normalizeValue((productCategory as any)?.name);
                const nestedSlug = normalizeValue((productCategory as any)?.slug);

                if (
                  nestedId === categoryId ||
                  nestedName === categoryName ||
                  nestedSlug === categorySlug
                ) {
                  return total + 1;
                }
              }

              return total;
            }, 0);
          });

          setDoughnutData({
            labels,
            datasets: [
              {
                data: counts,
                backgroundColor: labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
              },
            ],
          });
        } else {
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

          setDoughnutData({
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
              },
            ],
          });
        }

        const couponRows = chartCoupons
          .filter((coupon: any) => typeof coupon?.code === 'string' && coupon.code.trim().length > 0)
          .map((coupon: any) => ({
            code: coupon.code as string,
            discountValue: Number(coupon?.discountValue) || 0,
          }));

        setBarData({
          labels: couponRows.map((coupon) => coupon.code),
          datasets: [
            {
              data: couponRows.map((coupon) => coupon.discountValue),
              backgroundColor: '#534AB7',
            },
          ],
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

        if (usersPayload || productsPayload || couponsPayload || categoriesPayload) {
          hasShownDashboardErrorRef.current = false;
        }
      } catch (error: any) {
        console.error('Error fetching dashboard data', error);
        toast.error(error?.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
    const intervalId = setInterval(fetchDashboardData, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const statCards = [
    { name: 'Total users', value: stats.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'Total products', value: stats.totalProducts, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
    { name: 'Total coupons', value: stats.totalCoupons, icon: Tag, color: 'text-orange-600', bg: 'bg-orange-50' },
    { name: 'Active categories', value: stats.activeCategories, icon: Layers, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="card flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:p-5 md:p-6"
          >
            <div className={`flex-shrink-0 p-2 sm:p-3 rounded-lg ${stat.bg} ${stat.color}`}>
              <stat.icon size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-500">{stat.name}</p>
              {isLoading ? (
                <div className="h-8 sm:h-9 mt-1 w-20 rounded bg-gray-200 animate-pulse" />
              ) : (
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 truncate">{stat.value}</h3>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="card p-6">
          {isLoading ? (
            <div className="h-72 rounded bg-gray-100 animate-pulse" />
          ) : doughnutData.labels.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-500 text-sm">No data available</div>
          ) : (
            <Doughnut data={doughnutData} options={doughnutOptions} />
          )}
        </div>

        <div className="card p-6">
          {isLoading ? (
            <div className="h-72 rounded bg-gray-100 animate-pulse" />
          ) : barData.labels.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-500 text-sm">No data available</div>
          ) : (
            <Bar data={barData} options={barOptions} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="card p-4 sm:p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Recent Activity</h3>
            <TrendingUp className="text-gray-400 flex-shrink-0" size={20} />
          </div>
          <div className="space-y-3 sm:space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2 sm:p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
                  <Users size={16} className="sm:w-5 sm:h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">New user registered</p>
                  <p className="text-xs text-gray-500">2 hours ago</p>
                </div>
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded flex-shrink-0">User</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 sm:p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button className="p-3 sm:p-4 border border-gray-200 rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-left group min-h-[120px] sm:min-h-auto flex flex-col justify-center">
              <Package className="text-gray-400 group-hover:text-accent mb-2 w-5 h-5 sm:w-6 sm:h-6" />
              <p className="font-medium text-sm sm:text-base">Add Product</p>
              <p className="text-xs text-gray-500">Create a new listing</p>
            </button>
            <button className="p-3 sm:p-4 border border-gray-200 rounded-xl hover:border-accent hover:bg-accent/5 transition-all text-left group min-h-[120px] sm:min-h-auto flex flex-col justify-center">
              <Users className="text-gray-400 group-hover:text-accent mb-2 w-5 h-5 sm:w-6 sm:h-6" />
              <p className="font-medium text-sm sm:text-base">View Users</p>
              <p className="text-xs text-gray-500">Manage customers</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
