import apiClient from '../lib/apiClient';

export interface DeliveryEstimatePayload {
  estimatedDeliveryDate: string;
  deliveryNote?: string;
}

export interface PincodeDeliveryEstimate {
  estimatedDate: string | null;
  cost: number | null;
  isServiceable: boolean | null;
  raw: unknown;
}

export const ORDER_STATUS_VALUES = [
  'placed',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'return_requested',
  'returned',
] as const;

export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number];

export interface OrderStatusResult {
  status: OrderStatusValue | null;
  raw: unknown;
}

const DATE_KEYS = [
  'estimatedDate',
  'estimatedDeliveryDate',
  'deliveryDate',
  'expectedDeliveryDate',
  'eta',
  'edd',
  'date',
];

const COST_KEYS = [
  'cost',
  'charge',
  'charges',
  'deliveryCharge',
  'shippingCharge',
  'shippingCost',
  'price',
  'amount',
];

const SERVICEABILITY_KEYS = [
  'isServiceable',
  'serviceable',
  'available',
  'isAvailable',
  'deliveryAvailable',
  'canDeliver',
];

const ORDER_STATUS_KEYS = ['status', 'orderStatus', 'currentStatus'];
const ORDER_STATUS_SET = new Set<string>(ORDER_STATUS_VALUES);

let hasLoggedPincodeEstimateResponse = false;
let hasLoggedOrderStatusResponse = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const matchesKey = (key: string, candidates: string[]) => {
  const normalized = normalizeKey(key);
  return candidates.some((candidate) => normalized === normalizeKey(candidate));
};

const collectObjects = (node: unknown, objects: Record<string, unknown>[] = []): Record<string, unknown>[] => {
  if (!isRecord(node)) {
    return objects;
  }

  objects.push(node);
  Object.values(node).forEach((value) => {
    collectObjects(value, objects);
  });
  return objects;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', 'available', 'serviceable', 'success'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', 'unavailable', 'not_serviceable', 'failed'].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const toDateString = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text) || /^\d{2}[/-]\d{2}[/-]\d{4}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : text;
};

const toOrderStatus = (value: unknown): OrderStatusValue | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'pending') return 'placed';
  if (normalized === 'completed') return 'delivered';
  if (normalized === 'canceled') return 'cancelled';
  return ORDER_STATUS_SET.has(normalized) ? (normalized as OrderStatusValue) : null;
};

const pickValueByKeys = <T extends string | number | boolean>(
  payload: unknown,
  keys: string[],
  parser: (value: unknown) => T | null
) => {
  const objects = collectObjects(payload);

  for (const object of objects) {
    for (const [key, value] of Object.entries(object)) {
      if (!matchesKey(key, keys)) {
        continue;
      }

      const parsed = parser(value);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
};

const normalizePincodeEstimateResponse = (payload: unknown): PincodeDeliveryEstimate => ({
  estimatedDate: pickValueByKeys(payload, DATE_KEYS, toDateString),
  cost: pickValueByKeys(payload, COST_KEYS, toNumber),
  isServiceable: pickValueByKeys(payload, SERVICEABILITY_KEYS, toBoolean),
  raw: payload,
});

const normalizeOrderStatusResponse = (payload: unknown): OrderStatusResult => ({
  status:
    toOrderStatus(payload) ||
    pickValueByKeys(payload, ORDER_STATUS_KEYS, toOrderStatus),
  raw: payload,
});

export async function approveOrder(orderId: string): Promise<void> {
  await apiClient.patch(`/admin/orders/${orderId}/approve`);
}

export async function setDeliveryEstimate(
  orderId: string,
  data: DeliveryEstimatePayload
): Promise<void> {
  await apiClient.patch(`/admin/orders/${orderId}/delivery-estimate`, data);
}

export async function resendConfirmation(orderId: string): Promise<void> {
  await apiClient.post(`/admin/orders/${orderId}/resend-confirmation`);
}

export async function getOrderStatus(orderId: string): Promise<OrderStatusResult> {
  const response = await apiClient.get(`/admin/orders/${orderId}/status`);

  if (!hasLoggedOrderStatusResponse) {
    console.log('Raw order status response:', response.data);
    hasLoggedOrderStatusResponse = true;
  }

  return normalizeOrderStatusResponse(response.data);
}

export async function getDeliveryEstimateForPincode(
  pincode: string
): Promise<PincodeDeliveryEstimate> {
  const response = await apiClient.post('/shipments/check-delivery', { pincode });

  if (!hasLoggedPincodeEstimateResponse) {
    console.log('Raw pincode delivery estimate response:', response.data);
    hasLoggedPincodeEstimateResponse = true;
  }

  return normalizePincodeEstimateResponse(response.data);
}
