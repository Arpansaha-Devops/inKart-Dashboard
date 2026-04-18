import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Package,
  Tag,
  Ticket,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { User } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
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
const CHART_COLORS = ['#F97316', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444'];

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

const isCategoryLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.name === 'string');

const isProductLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.name === 'string');

const isCouponLike = (item: any): boolean =>
  Boolean(item && typeof item === 'object' && typeof item._id === 'string' && typeof item.code === 'string');

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
  const best = deepCandidates
    .map((arr) => arr.filter(isUserLike))
    .sort((a, b) => b.length - a.length)[0];

  return best || [];
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalProducts: 0,
    totalCoupons: 0,
    activeCategories: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const hasShownDashboardErrorRef = useRef(false);
  const [chartTheme, setChartTheme] = useState<ChartThemeColors>(getChartThemeColors);

  const [doughnutData, setDoughnutData] = useState({
    labels: [] as string[],
    datasets: [
      {
        data: [] as number[],
        backgroundColor: [] as string[],
        borderWidth: 0,
      },
    ],
  });

  const [barData, setBarData] = useState({
    labels: [] as string[],
    datasets: [
      {
        data: [] as number[],
        backgroundColor: '#F97316',
        borderRadius: 8,
        borderSkipped: false as const,
      },
    ],
  });

  useEffect(() => {
    const syncTheme = () => {
      setChartTheme(getChartThemeColors());
    };

    syncTheme();

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
    ChartJS.defaults.color = chartTheme.textSecondary;
    ChartJS.defaults.borderColor = chartTheme.border;
    ChartJS.defaults.font.family = "'Inter', system-ui, sans-serif";
  }, [chartTheme]);

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: chartTheme.textSecondary,
            font: { size: 13 },
            boxWidth: 12,
            padding: 16,
          },
        },
        title: { display: false },
      },
    }),
    [chartTheme]
  );

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: {
          grid: { color: chartTheme.border },
          ticks: { color: chartTheme.textSecondary },
        },
        y: {
          beginAtZero: true,
          grid: { color: chartTheme.border },
          ticks: { color: chartTheme.textSecondary },
        },
      },
    }),
    [chartTheme]
  );

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
        const dashboardUsers = extractUsers(usersPayload);

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
        setRecentUsers(dashboardUsers.slice(0, 5));

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
                borderWidth: 0,
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
                borderWidth: 0,
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
              backgroundColor: '#F97316',
              borderRadius: 8,
              borderSkipped: false,
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
              <Doughnut data={doughnutData} options={doughnutOptions} />
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
              <Bar data={barData} options={barOptions} />
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
            <div style={{ display: 'grid', gap: '12px' }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton" style={{ height: 60 }} />
              ))}
            </div>
          ) : recentUsers.length === 0 ? (
            <div
              style={{
                minHeight: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: '14px',
              }}
            >
              No recent user activity available
            </div>
          ) : (
            recentUsers.map((user) => (
              <div
                key={user._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--bg-input)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UserCheck size={16} color="var(--text-muted)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    New user registered
                  </p>
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user.name || 'Unnamed user'} · {user.email || 'No email'}
                  </p>
                </div>
                <span
                  style={{
                    background: 'var(--info-muted)',
                    color: 'var(--info)',
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  User
                </span>
              </div>
            ))
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
