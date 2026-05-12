import apiClient from '../lib/apiClient';
import type {
  AnalyticsDashboardStats,
  AnalyticsMetric,
  DashboardStatsResponse,
  RevenueDataPoint,
  RevenueOverTimeResponse,
} from '../types';

const REVENUE_VALUE_KEYS = [
  'revenue',
  'totalRevenue',
  'amount',
  'sales',
  'value',
  'total',
  'grossRevenue',
  'netRevenue',
];

const REVENUE_LABEL_KEYS = [
  'label',
  'date',
  'day',
  'month',
  'week',
  'period',
  'name',
  'title',
  'x',
];

const CORE_STAT_KEY_MAP = {
  totalRevenue: ['totalRevenue', 'revenue', 'grossRevenue', 'netRevenue', 'totalSales', 'sales'],
  totalOrders: ['totalOrders', 'orders', 'orderCount', 'totalOrderCount', 'numberOfOrders'],
  averageOrderValue: ['averageOrderValue', 'avgOrderValue', 'averageValue', 'aov'],
} as const;

const METADATA_KEYS = new Set([
  'id',
  '_id',
  'page',
  'limit',
  'totalpages',
  'currentpage',
  'success',
  'status',
  'code',
]);

type NumericEntry = {
  key: string;
  normalizedKey: string;
  value: number;
};

const emptyStats: AnalyticsDashboardStats = {
  totalRevenue: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  metrics: [],
};

const normalizeKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) {
      return null;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toLabel = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return null;
};

const collectArrays = (node: unknown, arrays: unknown[][] = []): unknown[][] => {
  if (Array.isArray(node)) {
    arrays.push(node);
    node.forEach((item) => collectArrays(item, arrays));
    return arrays;
  }

  if (!node || typeof node !== 'object') {
    return arrays;
  }

  Object.values(node as Record<string, unknown>).forEach((value) => collectArrays(value, arrays));
  return arrays;
};

const collectObjects = (node: unknown, objects: Record<string, unknown>[] = []): Record<string, unknown>[] => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return objects;
  }

  const obj = node as Record<string, unknown>;
  objects.push(obj);
  Object.values(obj).forEach((value) => collectObjects(value, objects));
  return objects;
};

const collectNumericEntries = (obj: Record<string, unknown>): NumericEntry[] =>
  Object.entries(obj)
    .map(([key, value]) => {
      const numericValue = toNumber(value);
      return numericValue === null
        ? null
        : {
            key,
            normalizedKey: normalizeKey(key),
            value: numericValue,
          };
    })
    .filter((entry): entry is NumericEntry => entry !== null);

const matchesAnyKey = (normalizedKey: string, aliases: readonly string[]) =>
  aliases.some((alias) => normalizedKey === normalizeKey(alias));

const humanizeKey = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getBucketLabel = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const bucket = value as Record<string, unknown>;
  const year = toNumber(bucket.year);
  const week = toNumber(bucket.week);
  const month = toNumber(bucket.month);
  const day = toNumber(bucket.day);
  const date = toLabel(bucket.date);

  if (year !== null && week !== null) {
    return `Week ${week}, ${year}`;
  }

  if (year !== null && month !== null) {
    return `Month ${month}, ${year}`;
  }

  if (year !== null && day !== null) {
    return `Day ${day}, ${year}`;
  }

  if (date) {
    return date;
  }

  const primitiveParts = Object.values(bucket)
    .filter((entry) => ['string', 'number'].includes(typeof entry))
    .map((entry) => String(entry).trim())
    .filter(Boolean);

  return primitiveParts.length > 0 ? primitiveParts.join(' - ') : null;
};

const pickStatValue = (
  objects: Record<string, unknown>[],
  aliases: readonly string[],
): number => {
  for (const obj of objects) {
    for (const [key, value] of Object.entries(obj)) {
      const numericValue = toNumber(value);
      if (numericValue === null) {
        continue;
      }

      if (matchesAnyKey(normalizeKey(key), aliases)) {
        return numericValue;
      }
    }
  }

  return 0;
};

const getRevenuePoint = (item: unknown, index: number): RevenueDataPoint | null => {
  if (typeof item === 'number') {
    return {
      label: `Point ${index + 1}`,
      revenue: item,
    };
  }

  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const obj = item as Record<string, unknown>;

  let revenue: number | null = null;
  for (const key of REVENUE_VALUE_KEYS) {
    revenue = toNumber(obj[key]);
    if (revenue !== null) {
      break;
    }
  }

  if (revenue === null) {
    const numericEntries = collectNumericEntries(obj).filter(
      (entry) => !METADATA_KEYS.has(entry.normalizedKey)
    );
    revenue = numericEntries[0]?.value ?? null;
  }

  if (revenue === null) {
    return null;
  }

  let label: string | null = null;
  for (const key of REVENUE_LABEL_KEYS) {
    label = toLabel(obj[key]);
    if (label) {
      break;
    }
  }

  if (!label && typeof obj.startDate === 'string' && typeof obj.endDate === 'string') {
    label = `${obj.startDate} - ${obj.endDate}`;
  }

  if (!label) {
    label = getBucketLabel(obj._id);
  }

  const date = typeof obj.date === 'string' ? obj.date : undefined;

  return {
    label: label || date || `Point ${index + 1}`,
    revenue,
    date,
  };
};

const extractRevenuePoints = (payload: unknown): RevenueDataPoint[] => {
  const directCandidates = [
    (payload as any)?.data?.revenueOverTime,
    (payload as any)?.data?.series,
    (payload as any)?.data?.chart,
    (payload as any)?.data?.items,
    (payload as any)?.revenueOverTime,
    (payload as any)?.series,
    (payload as any)?.chart,
    (payload as any)?.data,
    payload,
  ];

  for (const candidate of directCandidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const points = candidate
      .map((item, index) => getRevenuePoint(item, index))
      .filter((item): item is RevenueDataPoint => item !== null);

    if (points.length > 0) {
      return points;
    }
  }

  const arrays = collectArrays(payload);
  const best = arrays
    .map((candidate) =>
      candidate
        .map((item, index) => getRevenuePoint(item, index))
        .filter((item): item is RevenueDataPoint => item !== null)
    )
    .sort((a, b) => b.length - a.length)[0];

  return best || [];
};

const scoreStatsObject = (obj: Record<string, unknown>) => {
  const numericEntries = collectNumericEntries(obj).filter(
    (entry) => !METADATA_KEYS.has(entry.normalizedKey)
  );

  if (numericEntries.length === 0) {
    return -1;
  }

  let coreMatches = 0;
  for (const aliases of Object.values(CORE_STAT_KEY_MAP)) {
    if (numericEntries.some((entry) => matchesAnyKey(entry.normalizedKey, aliases))) {
      coreMatches += 1;
    }
  }

  return coreMatches * 10 + numericEntries.length;
};

const extractStats = (payload: unknown): AnalyticsDashboardStats => {
  const objects = collectObjects(payload);
  const sortedObjects = [...objects].sort((a, b) => scoreStatsObject(b) - scoreStatsObject(a));
  const bestObject = sortedObjects[0];
  const bestEntries = bestObject ? collectNumericEntries(bestObject) : [];

  const totalRevenue = pickStatValue(sortedObjects, CORE_STAT_KEY_MAP.totalRevenue);
  const totalOrders = pickStatValue(sortedObjects, CORE_STAT_KEY_MAP.totalOrders);
  const derivedAverage =
    totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0;
  const averageOrderValue =
    pickStatValue(sortedObjects, CORE_STAT_KEY_MAP.averageOrderValue) || derivedAverage;

  if (!bestObject) {
    return {
      ...emptyStats,
      totalRevenue,
      totalOrders,
      averageOrderValue,
    };
  }

  const reservedKeys = new Set(
    [
      ...CORE_STAT_KEY_MAP.totalRevenue,
      ...CORE_STAT_KEY_MAP.totalOrders,
      ...CORE_STAT_KEY_MAP.averageOrderValue,
    ].map((key) => normalizeKey(key))
  );

  const metrics: AnalyticsMetric[] = [
    {
      key: 'totalRevenue',
      label: 'Total Revenue',
      value: totalRevenue,
    },
    {
      key: 'totalOrders',
      label: 'Total Orders',
      value: totalOrders,
    },
    {
      key: 'averageOrderValue',
      label: 'Average Order Value',
      value: averageOrderValue,
    },
  ];

  bestEntries.forEach((entry) => {
    if (METADATA_KEYS.has(entry.normalizedKey) || reservedKeys.has(entry.normalizedKey)) {
      return;
    }

    metrics.push({
      key: entry.key,
      label: humanizeKey(entry.key),
      value: entry.value,
    });
  });

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    metrics,
  };
};

export const getRevenueOverTime = async (): Promise<RevenueOverTimeResponse> => {
  try {
    const response = await apiClient.get('/admin/analytics/revenue-over-time');
    const points = extractRevenuePoints(response.data);

    return {
      success: true,
      data: points,
      raw: response.data,
    };
  } catch (error) {
    console.error('Failed to fetch revenue-over-time analytics', error);
    throw error;
  }
};

export const getDashboardStats = async (): Promise<DashboardStatsResponse> => {
  try {
    const response = await apiClient.get('/admin/analytics/dashboard-stats');
    const stats = extractStats(response.data);

    return {
      success: true,
      data: stats,
      raw: response.data,
    };
  } catch (error) {
    console.error('Failed to fetch dashboard stats analytics', error);
    throw error;
  }
};
