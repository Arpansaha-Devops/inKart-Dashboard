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


export interface ShiprocketData {
  shiprocketOrderId: string | null;
  shipmentId: string | null;
  awbCode: string | null;
  courierName: string | null;
  courierCompanyId: number | null;
  shipmentStatus: string | null;
  trackingUrl: string | null;
  currentLocation: string | null;
  lastShiprocketError: string | null;
  etd: string | null;
  pickupScheduledDate: string | null;
  pickupScheduled: boolean | null;
  pickupToken: string | null;
  labelUrl: string | null;
  manifestUrl: string | null;
  lastSyncedAt: string | null;
}

export interface ShiprocketTrackingActivity {
  date: string;
  activity: string;
  location: string;
  status: string;
}

export interface ShiprocketTrackingResult {
  awbCode: string | null;
  courierName: string | null;
  currentStatus: string | null;
  currentLocation: string | null;
  trackingUrl: string | null;
  etd: string | null;
  deliveredDate: string | null;
  activities: ShiprocketTrackingActivity[];
  raw: unknown;
}

export interface ShiprocketScheduleResult {
  pickupDate: string | null;
  pickupScheduled: boolean | null;
  status: string | null;
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

const getStr = (obj: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

export const normalizeShiprocketData = (payload: unknown): ShiprocketData => {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : root;
  const shiprocket = isRecord(data.shiprocket)
    ? data.shiprocket
    : isRecord(root.shiprocket)
      ? root.shiprocket
      : isRecord(data.shipment)
        ? data.shipment
      : data;

  return {
    shiprocketOrderId: getStr(shiprocket, ['shiprocketOrderId', 'order_id', 'sr_order_id']) || null,
    shipmentId: getStr(shiprocket, ['shipmentId', 'shipment_id']) || null,
    awbCode: getStr(shiprocket, ['awbCode', 'awb_code', 'awb']) || null,
    courierName: getStr(shiprocket, ['courierName', 'courier_name', 'courier']) || null,
    courierCompanyId: toNumber(shiprocket.courierCompanyId ?? shiprocket.courier_company_id),
    shipmentStatus: getStr(shiprocket, ['shipmentStatus', 'shipment_status', 'status', 'currentStatus']) || null,
    trackingUrl: getStr(shiprocket, ['trackingUrl', 'tracking_url', 'track_url']) || null,
    currentLocation: getStr(shiprocket, ['currentLocation', 'current_location', 'location']) || null,
    lastShiprocketError: getStr(shiprocket, ['lastShiprocketError', 'last_error', 'error', 'errorMessage']) || null,
    etd: getStr(shiprocket, ['etd', 'estimatedDeliveryDate', 'estimated_delivery_date', 'edd']) || null,
    pickupScheduledDate: getStr(shiprocket, ['pickupScheduledDate', 'pickup_scheduled_date', 'pickupDate']) || null,
    pickupScheduled: toBoolean(shiprocket.pickupScheduled ?? shiprocket.pickup_scheduled),
    pickupToken: getStr(shiprocket, ['pickupToken', 'pickup_token']) || null,
    labelUrl: getStr(shiprocket, ['labelUrl', 'label_url', 'label']) || null,
    manifestUrl: getStr(shiprocket, ['manifestUrl', 'manifest_url', 'manifest']) || null,
    lastSyncedAt: getStr(shiprocket, ['lastSyncedAt', 'lastTrackingUpdate', 'updatedAt', 'updated_at']) || null,
  };
};

const normalizeShiprocketTracking = (payload: unknown): ShiprocketTrackingResult => {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : root;
  const tracking = isRecord(data.tracking)
    ? data.tracking
    : isRecord(data.trackData)
      ? data.trackData
      : data;
  const trackingData = isRecord(tracking.tracking_data)
    ? tracking.tracking_data
    : isRecord(data.tracking_data)
      ? data.tracking_data
      : {};
  const shipmentTrack =
    (Array.isArray(trackingData.shipment_track) && isRecord(trackingData.shipment_track[0])
      ? trackingData.shipment_track[0]
      : null) ||
    (Array.isArray(tracking.shipment_track) && isRecord(tracking.shipment_track[0])
      ? tracking.shipment_track[0]
      : null) ||
    tracking;
  const activitiesRaw =
    (Array.isArray(tracking.activities) ? tracking.activities : null) ||
    (Array.isArray(tracking.shipment_track_activities) ? tracking.shipment_track_activities : null) ||
    (Array.isArray(trackingData.activities) ? trackingData.activities : null) ||
    (Array.isArray(trackingData.shipment_track_activities) ? trackingData.shipment_track_activities : null) ||
    (Array.isArray(data.activities) ? data.activities : null) ||
    (Array.isArray(data.tracking_data) ? data.tracking_data : null) ||
    (Array.isArray(data.shipment_track_activities) ? data.shipment_track_activities : null) ||
    (Array.isArray(root.activities) ? root.activities : null) ||
    [];
  const activities = activitiesRaw.reduce<ShiprocketTrackingActivity[]>((normalized, item) => {
    if (isRecord(item)) {
      normalized.push({
        date: getStr(item, ['date', 'timestamp', 'created_at']),
        activity: getStr(item, ['activity', 'description', 'status', 'event']),
        location: getStr(item, ['location', 'city', 'current_location']),
        status: getStr(item, ['status', 'sr_status', 'sr-status-label']),
      });
    }
    return normalized;
  }, []);

  return {
    awbCode:
      getStr(shipmentTrack, ['awbCode', 'awb_code', 'awb']) ||
      getStr(tracking, ['awbCode', 'awb_code', 'awb']) ||
      null,
    courierName:
      getStr(shipmentTrack, ['courierName', 'courier_name', 'courier']) ||
      getStr(tracking, ['courierName', 'courier_name', 'courier']) ||
      null,
    currentStatus:
      getStr(shipmentTrack, ['currentStatus', 'current_status', 'status', 'shipment_status', 'current_status_id']) ||
      getStr(tracking, ['currentStatus', 'current_status', 'status', 'shipment_status']) ||
      null,
    currentLocation:
      activities[0]?.location ||
      getStr(shipmentTrack, ['currentLocation', 'current_location', 'location', 'destination']) ||
      getStr(tracking, ['currentLocation', 'current_location', 'location']) ||
      null,
    trackingUrl: (
      getStr(trackingData, ['trackingUrl', 'tracking_url', 'track_url']) ||
      getStr(tracking, ['trackingUrl', 'tracking_url', 'track_url'])
    ) || null,
    etd:
      getStr(shipmentTrack, ['etd', 'estimated_delivery_date', 'edd']) ||
      getStr(tracking, ['etd', 'estimated_delivery_date', 'edd']) ||
      null,
    deliveredDate:
      getStr(shipmentTrack, ['deliveredDate', 'delivered_date', 'delivery_date', 'delivered_on']) ||
      getStr(tracking, ['deliveredDate', 'delivered_date', 'delivery_date']) ||
      null,
    activities,
    raw: payload,
  };
};

const normalizeScheduleResult = (payload: unknown): ShiprocketScheduleResult => {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : root;
  return {
    pickupDate: getStr(data, ['pickupDate', 'pickup_date', 'scheduled_date']) || null,
    pickupScheduled: toBoolean(data.pickupScheduled ?? data.pickup_scheduled) ?? true,
    status: getStr(data, ['status', 'message']) || null,
    raw: payload,
  };
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

export async function deleteOrder(orderId: string): Promise<void> {
  await apiClient.delete(`/admin/orders/${encodeURIComponent(orderId)}`);
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
export async function getShipmentDetails(orderId: string): Promise<ShiprocketData> {
  const response = await apiClient.get(`/shipments/${encodeURIComponent(orderId)}/shipmentDetails`);
  return normalizeShiprocketData(response.data);
}

export async function syncShipment(orderId: string): Promise<ShiprocketData> {
  const response = await apiClient.post(`/shipments/${encodeURIComponent(orderId)}/sync-shipment`);
  return normalizeShiprocketData(response.data);
}

export async function getShipmentLabel(orderId: string): Promise<string | null> {
  const response = await apiClient.get(`/shipments/${encodeURIComponent(orderId)}/label`);
  const root = isRecord(response.data) ? response.data : {};
  const data = isRecord(root.data) ? root.data : root;
  return getStr(data, ['labelUrl', 'label_url', 'url', 'label', 'link']) || null;
}

export async function getShipmentManifest(orderId: string): Promise<string | null> {
  const response = await apiClient.get(`/shipments/${encodeURIComponent(orderId)}/manifest`);
  const root = isRecord(response.data) ? response.data : {};
  const data = isRecord(root.data) ? root.data : root;
  return getStr(data, ['manifestUrl', 'manifest_url', 'url', 'manifest', 'link']) || null;
}

export async function schedulePickup(orderId: string): Promise<ShiprocketScheduleResult> {
  const response = await apiClient.post(`/shipments/${encodeURIComponent(orderId)}/pickup`);
  return normalizeScheduleResult(response.data);
}

export async function cancelShipment(orderId: string): Promise<void> {
  await apiClient.post(`/shipments/${encodeURIComponent(orderId)}/cancel-shipment`);
}

export async function getShiprocketTracking(orderId: string): Promise<ShiprocketTrackingResult> {
  const response = await apiClient.get(`/shipments/${encodeURIComponent(orderId)}/track`);
  return normalizeShiprocketTracking(response.data);
}
