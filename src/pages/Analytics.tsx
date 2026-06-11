import React, { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  BarChart2,
  ChartNoAxesCombined,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { toast } from 'sonner';
import { getDashboardStats, getRevenueOverTime } from '../services/analyticsService';
import type { AnalyticsMetric, RevenueDataPoint } from '../types';

type ThemeColors = {
  textPrimary: string;
  textSecondary: string;
  border: string;
  accent: string;
  accentMuted: string;
  info: string;
  infoMuted: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
};

type StatsSectionState = {
  loading: boolean;
  error: string | null;
  metrics: AnalyticsMetric[];
};

type RevenueSectionState = {
  loading: boolean;
  error: string | null;
  points: RevenueDataPoint[];
};

type MetricVisual = {
  icon: typeof Wallet;
  color: string;
  background: string;
};

type RevenueChartData = {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    pointBackgroundColor: string;
    pointBorderColor: string;
    pointHoverBackgroundColor: string;
    pointHoverBorderColor: string;
    pointRadius: number;
    pointHoverRadius: number;
    borderWidth: number;
    tension: number;
    fill: boolean;
  }[];
};

type RevenueLineChartProps = {
  data: RevenueChartData;
  options: Record<string, unknown>;
};

const LazyRevenueLineChart = lazy(async () => {
  const [chartComponents, chartJs] = await Promise.all([
    import('react-chartjs-2'),
    import('chart.js'),
  ]);

  chartJs.Chart.register(
    chartJs.CategoryScale,
    chartJs.LinearScale,
    chartJs.PointElement,
    chartJs.LineElement,
    chartJs.Tooltip,
    chartJs.Legend,
    chartJs.Filler
  );

  return {
    default: ({ data, options }: RevenueLineChartProps) => (
      <chartComponents.Line data={data} options={options} />
    ),
  };
});

const getThemeColors = (): ThemeColors => {
  if (typeof window === 'undefined') {
    return {
      textPrimary: '#f0f0f0',
      textSecondary: '#a0a0a0',
      border: '#2e2e2e',
      accent: '#f97316',
      accentMuted: 'rgba(249, 115, 22, 0.15)',
      info: '#3b82f6',
      infoMuted: 'rgba(59, 130, 246, 0.15)',
      success: '#22c55e',
      successMuted: 'rgba(34, 197, 94, 0.15)',
      warning: '#f59e0b',
      warningMuted: 'rgba(245, 158, 11, 0.15)',
    };
  }

  const styles = getComputedStyle(document.body);

  return {
    textPrimary: styles.getPropertyValue('--text-primary').trim() || '#f0f0f0',
    textSecondary: styles.getPropertyValue('--text-secondary').trim() || '#a0a0a0',
    border: styles.getPropertyValue('--border').trim() || '#2e2e2e',
    accent: styles.getPropertyValue('--accent').trim() || '#f97316',
    accentMuted: styles.getPropertyValue('--accent-muted').trim() || 'rgba(249, 115, 22, 0.15)',
    info: styles.getPropertyValue('--info').trim() || '#3b82f6',
    infoMuted: styles.getPropertyValue('--info-muted').trim() || 'rgba(59, 130, 246, 0.15)',
    success: styles.getPropertyValue('--success').trim() || '#22c55e',
    successMuted: styles.getPropertyValue('--success-muted').trim() || 'rgba(34, 197, 94, 0.15)',
    warning: styles.getPropertyValue('--warning').trim() || '#f59e0b',
    warningMuted: styles.getPropertyValue('--warning-muted').trim() || 'rgba(245, 158, 11, 0.15)',
  };
};

const subscribeToThemeChanges = (onThemeChange: () => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const observer = new MutationObserver(onThemeChange);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  window.addEventListener('themechange', onThemeChange as EventListener);

  return () => {
    observer.disconnect();
    window.removeEventListener('themechange', onThemeChange as EventListener);
  };
};

const getThemeSnapshot = () => JSON.stringify(getThemeColors());

const useThemeColors = () => {
  const themeSnapshot = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    getThemeSnapshot
  );

  return useMemo(() => JSON.parse(themeSnapshot) as ThemeColors, [themeSnapshot]);
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const formatNumber = (value: number) =>
  (Number.isInteger(value) ? integerFormatter : decimalFormatter).format(value || 0);

const normalizeMetricKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const metricNeedsCurrency = (metric: AnalyticsMetric) => {
  const normalized = normalizeMetricKey(metric.key);
  return ['revenue', 'sales', 'amount', 'value', 'aov'].some((fragment) =>
    normalized.includes(fragment)
  );
};

const metricNeedsPercentage = (metric: AnalyticsMetric) => {
  const normalized = normalizeMetricKey(metric.key);
  return normalized.includes('rate') || normalized.includes('percentage');
};

const formatMetricValue = (metric: AnalyticsMetric) => {
  if (metricNeedsCurrency(metric)) {
    return formatCurrency(metric.value);
  }

  if (metricNeedsPercentage(metric)) {
    const percentage = metric.value <= 1 ? metric.value * 100 : metric.value;
    return `${formatNumber(percentage)}%`;
  }

  return formatNumber(metric.value);
};

const getMetricVisual = (metric: AnalyticsMetric, colors: ThemeColors): MetricVisual => {
  const normalized = normalizeMetricKey(metric.key);

  if (normalized.includes('revenue') || normalized.includes('sales')) {
    return {
      icon: Wallet,
      color: colors.accent,
      background: colors.accentMuted,
    };
  }

  if (normalized.includes('order')) {
    return {
      icon: ShoppingCart,
      color: colors.info,
      background: colors.infoMuted,
    };
  }

  if (normalized.includes('average') || normalized.includes('aov') || normalized.includes('value')) {
    return {
      icon: Receipt,
      color: colors.success,
      background: colors.successMuted,
    };
  }

  if (normalized.includes('product') || normalized.includes('item')) {
    return {
      icon: Package,
      color: colors.warning,
      background: colors.warningMuted,
    };
  }

  return {
    icon: ChartNoAxesCombined,
    color: colors.info,
    background: colors.infoMuted,
  };
};

const getRevenueTrend = (points: RevenueDataPoint[]): number | null => {
  if (points.length < 2) {
    return null;
  }

  const latest = points[points.length - 1]?.revenue ?? 0;
  const previous = points[points.length - 2]?.revenue ?? 0;

  if (previous === 0) {
    return latest === 0 ? 0 : 100;
  }

  return Number((((latest - previous) / previous) * 100).toFixed(1));
};

const StatsSkeleton: React.FC = () => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '12px',
    }}
  >
    {Array.from({ length: 4 }).map((_, index) => (
      <div key={index} className="card" style={{ minHeight: 136 }}>
        <div className="skeleton" style={{ width: '36%', height: 12, marginBottom: 18 }} />
        <div className="skeleton" style={{ width: '58%', height: 30, marginBottom: 22 }} />
        <div className="skeleton" style={{ width: '46%', height: 42, borderRadius: 12 }} />
      </div>
    ))}
  </div>
);

const ChartSkeleton: React.FC = () => (
  <div className="card" style={{ padding: '20px' }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '18px',
      }}
    >
      <div>
        <div className="skeleton" style={{ width: 170, height: 16, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: 230, height: 12 }} />
      </div>
      <div className="skeleton" style={{ width: 96, height: 36, borderRadius: 10 }} />
    </div>
    <div className="skeleton" style={{ width: '100%', height: 340 }} />
  </div>
);

const SectionError: React.FC<{
  title: string;
  description: string;
  onRetry: () => void;
}> = ({ title, description, onRetry }) => (
  <div className="card" style={{ padding: '28px', textAlign: 'center' }}>
    <div className="analytics-error-icon">
      <BarChart2 size={22} />
    </div>
    <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--text-primary)' }}>{title}</h3>
    <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: '14px' }}>{description}</p>
    <button type="button" className="btn-ghost" onClick={onRetry}>
      <RefreshCw size={16} />
      Retry
    </button>
  </div>
);

const AnalyticsKpiSection: React.FC<{
  statsSection: StatsSectionState;
  statsMetrics: AnalyticsMetric[];
  themeColors: ThemeColors;
  onRefresh: () => void;
}> = ({ statsSection, statsMetrics, themeColors, onRefresh }) => (
  <section style={{ display: 'grid', gap: 'clamp(12px, 3vw, 16px)' }} aria-labelledby="analytics-kpi-heading">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <h2 id="analytics-kpi-heading" className="section-title" style={{ marginBottom: 0, fontSize: 'clamp(16px, 5vw, 20px)' }}>
        KPI Overview
      </h2>
      {!statsSection.loading && !statsSection.error ? (
        <button type="button" className="btn-ghost" onClick={onRefresh}>
          <RefreshCw size={16} />
          Refresh Stats
        </button>
      ) : null}
    </div>

    {statsSection.loading ? (
      <StatsSkeleton />
    ) : statsSection.error ? (
      <SectionError title="Could not load analytics stats" description={statsSection.error} onRetry={onRefresh} />
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {statsMetrics.map((metric, index) => {
          const visual = getMetricVisual(metric, themeColors);
          const Icon = visual.icon;
          const hasTrend = typeof metric.trend === 'number';
          const trendColor = hasTrend && metric.trend! < 0 ? 'var(--danger)' : 'var(--success)';

          return (
            <m.div
              key={metric.key}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: index * 0.08 }}
              className="card card-hover"
              style={{ padding: '14px 16px', borderLeft: `4px solid ${visual.color}`, display: 'grid', gap: '12px', minWidth: 0 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {metric.label}
                  </p>
                  <p style={{ margin: 0, fontSize: 'clamp(18px, 5vw, 26px)', lineHeight: 1.1, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word', overflow: 'hidden' }}>
                    {formatMetricValue(metric)}
                  </p>
                </div>
                <div className="icon-box" style={{ background: visual.background, flexShrink: 0 }}>
                  <Icon size={16} color={visual.color} />
                </div>
              </div>

              <div className="analytics-trend-row" style={{ color: hasTrend ? trendColor : 'var(--text-muted)' }}>
                <TrendingUp size={12} style={{ flexShrink: 0 }} />
                <span>
                  {hasTrend
                    ? `${metric.trend! >= 0 ? '+' : ''}${formatNumber(metric.trend!)}%`
                    : 'Live snapshot'}
                </span>
              </div>
            </m.div>
          );
        })}
      </div>
    )}
  </section>
);

const AnalyticsRevenueSection: React.FC<{
  revenueSection: RevenueSectionState;
  chartData: RevenueChartData;
  chartOptions: Record<string, unknown>;
  onRefresh: () => void;
}> = ({ revenueSection, chartData, chartOptions, onRefresh }) => (
  <section style={{ display: 'grid', gap: '16px' }} aria-labelledby="analytics-chart-heading">
    {revenueSection.loading ? (
      <ChartSkeleton />
    ) : revenueSection.error ? (
      <SectionError title="Could not load revenue over time" description={revenueSection.error} onRetry={onRefresh} />
    ) : (
      <div className="card" style={{ padding: 'clamp(14px, 4vw, 20px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="analytics-chart-heading" className="section-title" style={{ marginBottom: '4px', fontSize: 'clamp(16px, 5vw, 20px)' }}>
              Revenue Over Time
            </h2>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
              Real revenue points returned by the analytics endpoint.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onRefresh} style={{ flexShrink: 0 }}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {revenueSection.points.length === 0 ? (
          <div style={{ minHeight: 'clamp(200px, 50vw, 360px)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No revenue data points are available yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ width: '100%', minWidth: 'min(100vw - 32px, 100%)', height: 'clamp(200px, 50vw, 360px)' }}>
              <Suspense fallback={<div className="skeleton" style={{ width: '100%', height: '100%' }} />}>
                <LazyRevenueLineChart data={chartData} options={chartOptions} />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    )}
  </section>
);

const Analytics: React.FC = () => {
  const themeColors = useThemeColors();
  const [statsSection, setStatsSection] = useState<StatsSectionState>({
    loading: true,
    error: null,
    metrics: [],
  });
  const [revenueSection, setRevenueSection] = useState<RevenueSectionState>({
    loading: true,
    error: null,
    points: [],
  });

  const fetchStats = async () => {
    setStatsSection((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const response = await getDashboardStats();
      setStatsSection({
        loading: false,
        error: null,
        metrics: response.data.metrics,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message || error?.message || 'Unable to load dashboard stats.';
      setStatsSection({
        loading: false,
        error: message,
        metrics: [],
      });
      toast.error('Analytics stats failed to load');
    }
  };

  const fetchRevenue = async () => {
    setRevenueSection((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const response = await getRevenueOverTime();
      setRevenueSection({
        loading: false,
        error: null,
        points: response.data,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message || error?.message || 'Unable to load revenue data.';
      setRevenueSection({
        loading: false,
        error: message,
        points: [],
      });
      toast.error('Revenue chart failed to load');
    }
  };

  useEffect(() => {
    void Promise.allSettled([fetchStats(), fetchRevenue()]);
  }, []);

  const revenueTrend = useMemo(
    () => getRevenueTrend(revenueSection.points),
    [revenueSection.points]
  );

  const statsMetrics = useMemo(() => {
    return statsSection.metrics.map((metric) => {
      if (normalizeMetricKey(metric.key) === 'totalrevenue' && revenueTrend !== null) {
        return {
          ...metric,
          trend: revenueTrend,
        };
      }

      return metric;
    });
  }, [revenueTrend, statsSection.metrics]);

  const chartData = useMemo(
    () => ({
      labels: revenueSection.points.map((point) => point.label),
      datasets: [
        {
          label: 'Revenue',
          data: revenueSection.points.map((point) => point.revenue),
          borderColor: themeColors.accent,
          backgroundColor: themeColors.accentMuted,
          pointBackgroundColor: themeColors.accent,
          pointBorderColor: themeColors.accent,
          pointHoverBackgroundColor: themeColors.accent,
          pointHoverBorderColor: '#ffffff',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
        },
      ],
    }),
    [revenueSection.points, themeColors]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index' as const,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context: any) => `Revenue: ${formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: themeColors.border,
            drawBorder: false,
          },
          ticks: {
            color: themeColors.textSecondary,
            maxRotation: 0,
            autoSkipPadding: 12,
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: themeColors.border,
            drawBorder: false,
          },
          ticks: {
            color: themeColors.textSecondary,
            callback: (value: string | number) => formatCurrency(Number(value)),
          },
        },
      },
    }),
    [themeColors]
  );

  return (
    <LazyMotion features={domAnimation}>
      <div className="page-wrapper">
        <div style={{ display: 'grid', gap: 'clamp(16px, 4vw, 24px)' }}>
        <div style={{ display: 'grid', gap: 'clamp(8px, 2vw, 12px)' }}>
          <h1 className="page-title" style={{ fontSize: 'clamp(24px, 6vw, 32px)', margin: 0 }}>Order Analytics</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'clamp(12px, 3vw, 14px)' }}>
            Track order performance, revenue movement, and the latest admin analytics snapshot.
          </p>
        </div>

        <AnalyticsKpiSection
          statsSection={statsSection}
          statsMetrics={statsMetrics}
          themeColors={themeColors}
          onRefresh={fetchStats}
        />
        <AnalyticsRevenueSection
          revenueSection={revenueSection}
          chartData={chartData}
          chartOptions={chartOptions}
          onRefresh={fetchRevenue}
        />
      </div>
      </div>
    </LazyMotion>
  );
};

export default Analytics;
