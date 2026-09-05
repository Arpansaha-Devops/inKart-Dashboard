import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Box,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  Eye,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Palette,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import {
  approveOrder,
  cancelShipment,
  deleteOrder,
  getDeliveryEstimateForPincode,
  getOrderStatus,
  getShipmentDetails,
  getShipmentLabel,
  getShipmentManifest,
  getShiprocketTracking,
  resendConfirmation,
  schedulePickup,
  syncShipment,
  setDeliveryEstimate,
  type OrderStatusValue,
  type PincodeDeliveryEstimate,
  type ShiprocketData,
  type ShiprocketTrackingResult,
} from '../services/orderService';

type OrderStatus = OrderStatusValue;

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type OrderSource = 'customized' | 'standard';
type OrderStatusFilter = 'all' | OrderStatus;
type OrderSummaryModal = 'paid' | 'pending' | 'completed' | null;

interface Layer {
  _id?: string;
  id?: string;
  type: string;
  x?: number;
  y?: number;
  left?: number;
  top?: number;
  text?: string;
}

interface OrderCustomization {
  _id: string;
  previewImageUrl?: string;
  backPreviewImageUrl?: string;
  canvasWidth: number;
  canvasHeight: number;
  layers: Layer[];
  backLayers?: Layer[];
}

interface OrderItem {
  _id: string;
  product: {
    _id: string;
    name: string;
    basePrice: number;
    image?: string;
  };
  quantity: number;
  price: number;
  options?: Record<string, string>;
}

interface Order {
  _id: string;
  orderId: string;
  orderNumber: string;
  source: OrderSource;
  customer: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
  };
  items: OrderItem[];
  customization?: OrderCustomization;
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  address: {
    fullName: string;
    phone: string;
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
  };
  coupon?: {
    code: string;
    discountValue: number;
  };
  notes?: string;
  estimatedDeliveryDate?: string;
  deliveryNote?: string;
  timeline: string[];
  createdAt: string;
  updatedAt: string;
  shiprocket?: {
    shiprocketOrderId?: string | null; shipmentId?: string | null; awbCode?: string | null;
    courierName?: string | null; shipmentStatus?: string | null; trackingUrl?: string | null;
    currentLocation?: string | null; etd?: string | null; pickupScheduledDate?: string | null; pickupScheduled?: boolean | null;
    pickupToken?: string | null; lastShiprocketError?: string | null; labelUrl?: string | null; manifestUrl?: string | null; lastSyncedAt?: string | null;
  };
}

interface OrdersQueryParams {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
}

interface NormalizedOrdersResponse {
  orders: Order[];
  total: number;
  totalPages: number;
}

const ORDERS_PER_PAGE = 10;
const SUMMARY_ORDERS_PER_PAGE = 100;
const ORDERS_REFRESH_INTERVAL_MS = 30_000;
const PENDING_FULFILLMENT_STATUSES: OrderStatus[] = [
  'placed',
  'confirmed',
  'processing',
  'shipped',
];
const ORDER_STATUS_OPTIONS: OrderStatusFilter[] = [
  'all',
  'placed',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'return_requested',
  'returned',
];
const orderStatusLabels: Record<OrderStatusFilter, string> = {
  all: 'All',
  placed: 'Placed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  return_requested: 'Return Requested',
  returned: 'Returned',
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

const orderStatusStyles: Record<OrderStatus, { color: string; background: string }> = {
  placed: { color: '#ca8a04', background: 'rgba(234, 179, 8, 0.16)' },
  confirmed: { color: 'var(--info)', background: 'var(--info-muted)' },
  processing: { color: '#9333ea', background: 'rgba(147, 51, 234, 0.15)' },
  shipped: { color: '#0891b2', background: 'rgba(8, 145, 178, 0.15)' },
  delivered: { color: 'var(--success)', background: 'var(--success-muted)' },
  cancelled: { color: 'var(--danger)', background: 'var(--danger-muted)' },
  return_requested: { color: '#d97706', background: 'rgba(217, 119, 6, 0.16)' },
  returned: { color: 'var(--text-secondary)', background: 'var(--bg-input)' },
};

const paymentStatusStyles: Record<PaymentStatus, { color: string; background: string }> = {
  pending: { color: '#ea580c', background: 'rgba(249, 115, 22, 0.16)' },
  paid: { color: 'var(--success)', background: 'var(--success-muted)' },
  failed: { color: 'var(--danger)', background: 'var(--danger-muted)' },
  refunded: { color: '#f97316', background: 'rgba(249, 115, 22, 0.15)' },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getRecord = (source: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = source[key];
  return isRecord(value) ? value : {};
};

const getString = (source: Record<string, unknown>, keys: string[], fallback = ''): string => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
};

const getNumber = (source: Record<string, unknown>, keys: string[], fallback = 0): number => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
};

const getOptionalNumber = (source: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const getArray = (source: Record<string, unknown>, keys: string[]): unknown[] => {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const getImageUrl = (source: Record<string, unknown>): string => {
  const directUrl = getString(source, [
    'image',
    'imageUrl',
    'productImage',
    'productImageUrl',
    'thumbnail',
    'thumbnailUrl',
    'featuredImage',
    'featuredImageUrl',
    'mainImage',
    'mainImageUrl',
    'coverImage',
    'coverImageUrl',
  ]);
  if (directUrl) return directUrl;

  const imageItems = getArray(source, ['images', 'productImages', 'gallery']);
  for (const item of imageItems) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (isRecord(item)) {
      const nestedUrl = getString(item, ['url', 'src', 'imageUrl', 'secure_url', 'path']);
      if (nestedUrl) return nestedUrl;
    }
  }

  return '';
};

const toImageUrl = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = toImageUrl(item);
      if (url) return url;
    }
    return '';
  }

  if (!isRecord(value)) return '';

  return getString(value, ['url', 'secure_url', 'src', 'imageUrl', 'path']);
};

const getCustomizationPreviewUrl = (source: Record<string, unknown>): string => {
  const directUrl = getString(source, [
    'previewImageUrl',
    'previewUrl',
    'thumbnailUrl',
    'imageUrl',
  ]);
  if (directUrl) return directUrl;

  for (const key of ['previewImage', 'preview', 'thumbnail', 'image']) {
    const url = toImageUrl(source[key]);
    if (url) return url;
  }

  return getDesignSidePreviewUrl(source, 'front');
};

const getCustomizationBackPreviewUrl = (source: Record<string, unknown>): string => {
  const directUrl = getString(source, [
    'backPreviewImageUrl',
    'backPreviewUrl',
    'backThumbnailUrl',
  ]);
  if (directUrl) return directUrl;

  for (const key of ['backPreviewImage', 'backPreview', 'backThumbnail']) {
    const url = toImageUrl(source[key]);
    if (url) return url;
  }

  return getDesignSidePreviewUrl(source, 'back');
};

const normalizeOrderStatus = (value: unknown): OrderStatus => {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'pending') return 'placed';
  if (status === 'completed') return 'delivered';
  if (
    status === 'placed' ||
    status === 'confirmed' ||
    status === 'processing' ||
    status === 'shipped' ||
    status === 'delivered' ||
    status === 'cancelled' ||
    status === 'return_requested' ||
    status === 'returned'
  ) {
    return status;
  }
  return 'placed';
};

const normalizePaymentStatus = (value: unknown): PaymentStatus => {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'pending' || status === 'paid' || status === 'failed' || status === 'refunded') {
    return status;
  }
  if (status === 'success' || status === 'successful' || status === 'captured' || status === 'completed') {
    return 'paid';
  }
  if (status === 'cancelled' || status === 'canceled') return 'failed';
  return 'pending';
};

const normalizeLayer = (value: unknown): Layer | null => {
  if (!isRecord(value)) return null;
  return {
    _id: getString(value, ['_id']) || undefined,
    id: getString(value, ['id']) || undefined,
    type: getString(value, ['type', 'kind', 'objectType'], 'layer'),
    x: getOptionalNumber(value, ['x']),
    y: getOptionalNumber(value, ['y']),
    left: getOptionalNumber(value, ['left']),
    top: getOptionalNumber(value, ['top']),
    text: getString(value, ['text', 'label', 'content']) || undefined,
  };
};

const normalizeLayers = (items: unknown[]) =>
  items.map(normalizeLayer).filter((layer): layer is Layer => layer !== null);

const normalizeCustomization = (
  value: Record<string, unknown>,
  fallbackId = ''
): OrderCustomization => ({
  _id: getString(value, ['_id', 'id'], fallbackId),
  previewImageUrl: getCustomizationPreviewUrl(value) || undefined,
  backPreviewImageUrl: getCustomizationBackPreviewUrl(value) || undefined,
  canvasWidth: getNumber(value, ['canvasWidth', 'width']),
  canvasHeight: getNumber(value, ['canvasHeight', 'height']),
  layers: normalizeLayers(getArray(value, ['layers', 'frontLayers', 'objects'])),
  backLayers: (() => {
    const layers = normalizeLayers(getArray(value, ['backLayers', 'backObjects']));
    return layers.length > 0 ? layers : undefined;
  })(),
});

const normalizeCustomizationResponse = (
  payload: unknown,
  fallbackId: string
): OrderCustomization | null => {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : {};
  const candidates = [
    data.customization,
    data.design,
    root.customization,
    root.design,
    root.data,
    payload,
  ];
  const customization = candidates.find(isRecord);

  return customization ? normalizeCustomization(customization, fallbackId) : null;
};

const normalizeItemOptions = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;

  const options = Object.entries(value).reduce<Record<string, string>>((result, [key, optionValue]) => {
    if (typeof optionValue === 'string' && optionValue.trim()) {
      result[key] = optionValue.trim();
    } else if (typeof optionValue === 'number' && Number.isFinite(optionValue)) {
      result[key] = String(optionValue);
    } else if (typeof optionValue === 'boolean') {
      result[key] = optionValue ? 'Yes' : 'No';
    }
    return result;
  }, {});

  return Object.keys(options).length > 0 ? options : undefined;
};

const normalizeItem = (value: unknown): OrderItem | null => {
  if (!isRecord(value)) return null;
  const productValue = value.product;
  const product = isRecord(productValue) ? productValue : {};
  const productId =
    (typeof productValue === 'string' ? productValue : '') ||
    getString(product, ['_id', 'id']) ||
    getString(value, ['productId']);
  const itemId = getString(value, ['_id', 'id'], productId || `item-${Math.random().toString(36).slice(2)}`);
  const name =
    getString(product, ['name', 'title']) ||
    getString(value, ['productName', 'name'], 'Product');
  const price = getNumber(value, ['price', 'unitPrice', 'basePrice'], getNumber(product, ['basePrice', 'price']));
  const image = getImageUrl(product) || getImageUrl(value);

  return {
    _id: itemId,
    product: {
      _id: productId,
      name,
      basePrice: getNumber(product, ['basePrice', 'price'], price),
      image: image || undefined,
    },
    quantity: getNumber(value, ['quantity', 'qty'], 1),
    price,
    options: normalizeItemOptions(value.options ?? value.selectedOptions),
  };
};

const normalizeItems = (items: unknown[], fallbackProduct: Record<string, unknown>): OrderItem[] => {
  const normalized = items.map(normalizeItem).filter((item): item is OrderItem => item !== null);
  if (normalized.length > 0) return normalized;

  const fallbackName = getString(fallbackProduct, ['name', 'title']);
  if (!fallbackName) return [];

  return [
    {
      _id: getString(fallbackProduct, ['_id', 'id'], 'product'),
      product: {
        _id: getString(fallbackProduct, ['_id', 'id']),
        name: fallbackName,
        basePrice: getNumber(fallbackProduct, ['basePrice', 'price']),
        image: getImageUrl(fallbackProduct) || undefined,
      },
      quantity: 1,
      price: getNumber(fallbackProduct, ['basePrice', 'price']),
    },
  ];
};

const normalizeOrder = (value: unknown, source: OrderSource): Order | null => {
  if (!isRecord(value)) return null;

  const id = getString(value, ['_id', 'id']);
  if (!id) return null;

  const hasEmbeddedCustomization = [
    'customization', 'customizationId', 'design', 'designId', 'designs',
    'frontDesign', 'backDesign', 'frontPreviewImageUrl', 'backPreviewImageUrl',
  ].some((key) => value[key] !== undefined && value[key] !== null);
  const effectiveSource =
    source === 'customized' || value.isCustomizedOrder === true || hasEmbeddedCustomization
      ? 'customized'
      : 'standard';
  const customer = getRecord(value, 'customer');
  const user = getRecord(value, 'user');
  const product = getRecord(value, 'product');
  const rawItems = getArray(value, ['items', 'orderItems', 'products']);
  const firstItem = rawItems.find(isRecord) || {};
  const customization = getRecord(value, 'customization');
  const customizationById = getRecord(value, 'customizationId');
  const design = getRecord(value, 'design');
  const itemCustomization = getRecord(firstItem, 'customization');
  const itemCustomizationById = getRecord(firstItem, 'customizationId');
  const itemDesign = getRecord(firstItem, 'design');
  const address = getRecord(value, 'address');
  const deliveryAddress = getRecord(value, 'deliveryAddress');
  const shippingAddress = getRecord(value, 'shippingAddress');
  const coupon = getRecord(value, 'coupon');
  const appliedCoupon = getRecord(value, 'appliedCoupon');
  const payment = getRecord(value, 'payment');
  const customerSource = Object.keys(customer).length ? customer : user;
  const addressSource = Object.keys(address).length
    ? address
    : Object.keys(deliveryAddress).length
      ? deliveryAddress
      : shippingAddress;
  const customizationSource = Object.keys(customization).length
    ? customization
    : Object.keys(customizationById).length
      ? customizationById
      : Object.keys(design).length
        ? design
        : Object.keys(itemCustomization).length
          ? itemCustomization
          : Object.keys(itemCustomizationById).length
            ? itemCustomizationById
            : itemDesign;
  const customizationId =
    getString(customizationSource, ['_id', 'id']) ||
    (typeof value.customization === 'string' ? value.customization : '') ||
    (typeof value.customizationId === 'string' ? value.customizationId : '') ||
    (typeof value.design === 'string' ? value.design : '') ||
    getString(value, ['designId']) ||
    (typeof firstItem.customization === 'string' ? firstItem.customization : '') ||
    (typeof firstItem.customizationId === 'string' ? firstItem.customizationId : '') ||
    (typeof firstItem.design === 'string' ? firstItem.design : '') ||
    getString(firstItem, ['designId']);
  const couponSource = Object.keys(coupon).length ? coupon : appliedCoupon;
  const orderNumber = getString(value, ['orderNumber', 'orderId', 'customOrderId'], id);
  const items = normalizeItems(rawItems, product);
  const frontLayerValues = getArray(customizationSource, ['layers', 'frontLayers', 'objects']);
  const backLayerValues = getArray(customizationSource, ['backLayers', 'backObjects']);
  const frontLayers = normalizeLayers(
    frontLayerValues.length > 0
      ? frontLayerValues
      : getArray(value, ['layers', 'frontLayers', 'objects'])
  );
  const backLayers = normalizeLayers(
    backLayerValues.length > 0
      ? backLayerValues
      : getArray(value, ['backLayers', 'backObjects'])
  );
  const couponCode =
    getString(couponSource, ['code', 'couponCode']) || getString(value, ['couponCode']);
  const timeline = getArray(value, ['timeline', 'statusHistory', 'history'])
    .flatMap((entry) => {
      if (typeof entry === 'string') return entry ? [entry] : [];
      if (isRecord(entry)) {
        const text = [
          getString(entry, ['status', 'title', 'label']),
          getString(entry, ['createdAt', 'date']),
        ]
          .filter(Boolean)
          .join(' - ');
        return text ? [text] : [];
      }
      return [];
    });

  return {
    _id: id,
    orderId: getString(value, ['orderId'], orderNumber),
    orderNumber,
    source: effectiveSource,
    customer: {
      _id: getString(customerSource, ['_id', 'id']),
      name:
        getString(customerSource, ['name', 'fullName']) ||
        getString(value, ['customerName', 'fullName'], 'Unknown Customer'),
      email: getString(customerSource, ['email']) || getString(value, ['customerEmail']),
      phone: getString(customerSource, ['phone', 'mobile']) || getString(value, ['phone']),
    },
    items,
    customization:
      effectiveSource === 'customized'
        ? {
            _id: customizationId,
            previewImageUrl:
              getCustomizationPreviewUrl(customizationSource) ||
              getCustomizationPreviewUrl(value),
            backPreviewImageUrl:
              getCustomizationBackPreviewUrl(customizationSource) ||
              getCustomizationBackPreviewUrl(value),
            canvasWidth: getNumber(
              customizationSource,
              ['canvasWidth', 'width'],
              getNumber(value, ['canvasWidth'])
            ),
            canvasHeight: getNumber(
              customizationSource,
              ['canvasHeight', 'height'],
              getNumber(value, ['canvasHeight'])
            ),
            layers: frontLayers,
            backLayers: backLayers.length > 0 ? backLayers : undefined,
          }
        : undefined,
    totalAmount: getNumber(value, ['totalAmount', 'amount', 'total', 'paidAmount']),
    orderStatus: normalizeOrderStatus(value.status ?? value.orderStatus),
    paymentStatus: normalizePaymentStatus(
      value.paymentStatus ?? value.payment_status ?? payment.status
    ),
    paymentId: getString(value, ['paymentId', 'razorpayPaymentId', 'razorpay_payment_id']) || undefined,
    address: {
      fullName: getString(addressSource, ['fullName', 'name'], getString(customerSource, ['name'])),
      phone: getString(addressSource, ['phone', 'mobile']),
      addressLine1:
        getString(addressSource, ['addressLine1', 'line1', 'street', 'address']) ||
        getString(value, ['addressLine1']),
      city: getString(addressSource, ['city']),
      state: getString(addressSource, ['state']),
      pincode: getString(addressSource, ['pincode', 'postalCode', 'zip']),
    },
    coupon: couponCode
      ? {
          code: couponCode,
          discountValue:
            getNumber(couponSource, ['discountValue', 'discount', 'amount']) ||
            getNumber(value, ['couponDiscount']),
        }
      : undefined,
    notes: getString(value, ['notes', 'customerNotes', 'note']) || undefined,
    estimatedDeliveryDate:
      getString(value, ['estimatedDeliveryDate', 'deliveryEstimateDate', 'expectedDeliveryDate']) || undefined,
    deliveryNote: getString(value, ['deliveryNote', 'estimatedDeliveryNote']) || undefined,
    timeline,
    createdAt: getString(value, ['createdAt', 'placedAt', 'date']),
    updatedAt: getString(value, ['updatedAt']),
    shiprocket: (() => {
      const shiprocket = isRecord(value.shiprocket)
        ? value.shiprocket
        : isRecord(value.shipment) ? value.shipment : null;
      if (!shiprocket) return undefined;
      return {
        shiprocketOrderId: getString(shiprocket, ['shiprocketOrderId', 'order_id', 'sr_order_id']) || null,
        shipmentId: getString(shiprocket, ['shipmentId', 'shipment_id']) || null,
        awbCode: getString(shiprocket, ['awbCode', 'awb_code', 'awb']) || null,
        courierName: getString(shiprocket, ['courierName', 'courier_name', 'courier']) || null,
        shipmentStatus: getString(shiprocket, ['shipmentStatus', 'shipment_status', 'status']) || null,
        trackingUrl: getString(shiprocket, ['trackingUrl', 'tracking_url', 'track_url']) || null,
        currentLocation: getString(shiprocket, ['currentLocation', 'current_location', 'location']) || null,
        etd: getString(shiprocket, ['etd', 'estimatedDeliveryDate', 'edd']) || null,
        pickupScheduledDate: getString(shiprocket, ['pickupScheduledDate', 'pickup_date']) || null,
        pickupScheduled: shiprocket.pickupScheduled === true || shiprocket.pickupScheduled === 'true',
        pickupToken: getString(shiprocket, ['pickupToken', 'pickup_token']) || null,
        lastShiprocketError: getString(shiprocket, ['lastShiprocketError', 'last_error', 'error']) || null,
        labelUrl: getString(shiprocket, ['labelUrl', 'label_url']) || null,
        manifestUrl: getString(shiprocket, ['manifestUrl', 'manifest_url']) || null,
        lastSyncedAt: getString(shiprocket, ['lastSyncedAt', 'lastTrackingUpdate', 'updatedAt']) || null,
      };
    })(),
  };
};

const pickOrdersArray = (payload: unknown): unknown[] => {
  const root = isRecord(payload) ? payload : {};
  const data = root.data;
  const dataRecord = isRecord(data) ? data : {};
  const candidates = [
    dataRecord.orders,
    dataRecord.customizedOrders,
    dataRecord.customOrders,
    dataRecord.items,
    dataRecord.docs,
    root.orders,
    root.customizedOrders,
    root.customOrders,
    root.items,
    data,
    payload,
  ];
  return (candidates.find(Array.isArray) as unknown[] | undefined) || [];
};

const normalizeOrdersResponse = (
  payload: unknown,
  source: OrderSource,
  fallbackLimit = ORDERS_PER_PAGE
): NormalizedOrdersResponse => {
  const root = isRecord(payload) ? payload : {};
  const data = root.data;
  const dataRecord = isRecord(data) ? data : {};
  const paginationRecord = getRecord(root, 'pagination');
  const orders = pickOrdersArray(payload)
    .map((item) => normalizeOrder(item, source))
    .filter((order): order is Order => order !== null);
  const total =
    getNumber(dataRecord, ['total', 'totalCount', 'count'], 0) ||
    getNumber(paginationRecord, ['total', 'totalCount'], 0) ||
    getNumber(root, ['total', 'totalCount', 'results', 'count'], orders.length);
  const totalPages =
    getNumber(dataRecord, ['totalPages', 'pages'], 0) ||
    getNumber(paginationRecord, ['totalPages', 'pages'], 0) ||
    getNumber(root, ['totalPages', 'pages'], 0) ||
    Math.max(1, Math.ceil((total || orders.length) / fallbackLimit));

  return {
    orders,
    total: total || orders.length,
    totalPages,
  };
};

const matchesDateRange = (order: Order, fromDate: string, toDate: string) => {
  const orderTime = new Date(order.createdAt).getTime();
  if (Number.isNaN(orderTime)) return !fromDate && !toDate;
  const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
  const toTime = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
  return (fromTime === null || orderTime >= fromTime) && (toTime === null || orderTime <= toTime);
};

const dedupeAndSortOrders = (orders: Order[]) => {
  const map = new Map<string, Order>();
  orders.forEach((order) => {
    const key = order.orderNumber || order.orderId || order._id;
    const current = map.get(key);
    if (!current || current.source === 'standard') {
      map.set(key, order);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const bTime = new Date(b.createdAt).getTime();
    const aTime = new Date(a.createdAt).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
};

const fetchPaidOrdersPage = async (
  params: OrdersQueryParams
): Promise<NormalizedOrdersResponse> => {
  const standardParams: OrdersQueryParams = {
    page: params.page,
    limit: params.limit,
    paymentStatus: 'paid',
  };
  if (params.status) standardParams.status = params.status;
  if (params.search?.trim()) standardParams.search = params.search.trim();

  const response = await apiClient.get('/admin/orders', { params: standardParams });
  const normalized = normalizeOrdersResponse(response.data, 'standard', params.limit);

  return {
    ...normalized,
    orders: dedupeAndSortOrders(normalized.orders).filter(
      (order) => order.paymentStatus === 'paid'
    ),
  };
};

const fetchAllPaidOrders = async (status?: OrderStatus, search?: string): Promise<Order[]> => {
  const firstPage = await fetchPaidOrdersPage({
    page: 1,
    limit: SUMMARY_ORDERS_PER_PAGE,
    status,
    search,
  });
  const pages = [firstPage.orders];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const response = await fetchPaidOrdersPage({
      page,
      limit: SUMMARY_ORDERS_PER_PAGE,
      status,
      search,
    });
    pages.push(response.orders);
  }

  return dedupeAndSortOrders(pages.flat());
};

const fetchSummaryCounts = async () => {
  const [paid, delivered, ...pending] = await Promise.all([
    fetchPaidOrdersPage({ page: 1, limit: 1 }),
    fetchPaidOrdersPage({ page: 1, limit: 1, status: 'delivered' }),
    ...PENDING_FULFILLMENT_STATUSES.map((status) =>
      fetchPaidOrdersPage({ page: 1, limit: 1, status })
    ),
  ]);

  return {
    paid: paid.total,
    pending: pending.reduce((total, response) => total + response.total, 0),
    completed: delivered.total,
  };
};

const fetchSummaryOrders = async (
  mode: Exclude<OrderSummaryModal, null>
): Promise<Order[]> => {
  if (mode === 'completed') return fetchAllPaidOrders('delivered');
  if (mode === 'pending') {
    const pages = await Promise.all(
      PENDING_FULFILLMENT_STATUSES.map((status) => fetchAllPaidOrders(status))
    );
    return dedupeAndSortOrders(pages.flat());
  }
  return fetchAllPaidOrders();
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const deliveryDateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const formatDateTime = (value: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return dateTimeFormatter
    .format(date)
    .replace(/\bam\b/i, 'AM')
    .replace(/\bpm\b/i, 'PM');
};

const formatDeliveryDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return deliveryDateFormatter.format(date);
};

const toDateInputValue = (value?: string | null) => {
  if (!value) return '';
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const dayMonthYearMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dayMonthYearMatch) {
    return `${dayMonthYearMatch[3]}-${dayMonthYearMatch[2]}-${dayMonthYearMatch[1]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatComputedDeliveryDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const inputValue = toDateInputValue(value);
  return inputValue ? formatDeliveryDate(inputValue) : value;
};

const todayDateInputValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isPastDeliveryDate = (value: string) => {
  if (!value) return false;
  return value < todayDateInputValue();
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (isRecord(error)) {
    if (
      isRecord(error.response) &&
      isRecord(error.response.data) &&
      typeof error.response.data.message === 'string' &&
      error.response.data.message.trim()
    ) {
      return error.response.data.message;
    }
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
  }
  return fallback;
};

const isNetworkError = (error: unknown) =>
  isRecord(error) && !error.response && typeof error.message === 'string';

const productLabel = (order: Order) => {
  const first = order.items[0]?.product.name || 'Product';
  const extra = order.items.length - 1;
  return extra > 0 ? `${first} +${extra} more` : first;
};

const shortOrderId = (order: Order) => (order.orderNumber || order.orderId || order._id).slice(0, 12);

const copyText = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success('Copied');
  } catch {
    toast.error('Unable to copy');
  }
};

const Badge: React.FC<{
  children: React.ReactNode;
  color: string;
  background: string;
}> = ({ children, color, background }) => (
  <span
    className="orders-badge"
    style={{ color, background }}
  >
    {children}
  </span>
);

const OrderStatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => (
  <Badge color={orderStatusStyles[status].color} background={orderStatusStyles[status].background}>
    {orderStatusLabels[status]}
  </Badge>
);

const PaymentStatusBadge: React.FC<{ status: PaymentStatus }> = ({ status }) => (
  <Badge color={paymentStatusStyles[status].color} background={paymentStatusStyles[status].background}>
    {paymentStatusLabels[status]}
  </Badge>
);

const OrderTypeBadge: React.FC<{ source: OrderSource }> = ({ source }) => (
  <Badge
    color={source === 'customized' ? 'var(--info)' : 'var(--text-secondary)'}
    background={source === 'customized' ? 'var(--info-muted)' : 'var(--bg-input)'}
  >
    {source === 'customized' ? <Palette size={12} /> : <Box size={12} />}
    {source === 'customized' ? 'Customized' : 'Standard'}
  </Badge>
);

type IntegrationState = 'live' | 'api-pending' | 'webhook-pending';

const integrationStateLabels: Record<IntegrationState, string> = {
  live: 'Live now',
  'api-pending': 'API pending',
  'webhook-pending': 'Webhook pending',
};

const IntegrationBadge: React.FC<{ state: IntegrationState }> = ({ state }) => (
  <span className={`orders-integration-badge is-${state}`}>
    <span aria-hidden="true" />
    {integrationStateLabels[state]}
  </span>
);
const SHIPROCKET_STATUS_STYLES: Record<string, { color: string; background: string }> = {
  delivered: { color: 'var(--success)', background: 'var(--success-muted)' },
  'out for delivery': { color: '#7c3aed', background: 'rgba(124,58,237,0.12)' },
  'in transit': { color: 'var(--info)', background: 'var(--info-muted)' },
  'picked up': { color: '#0891b2', background: 'rgba(8,145,178,0.12)' },
  'shipment created': { color: '#ca8a04', background: 'rgba(234,179,8,0.14)' },
  cancelled: { color: 'var(--danger)', background: 'var(--danger-muted)' },
};

const ShiprocketStatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>;
  const displayStatus = /^\d+$/.test(status.trim()) ? `Shiprocket code ${status.trim()}` : status;
  const style = SHIPROCKET_STATUS_STYLES[displayStatus.toLowerCase().trim()] ?? { color: '#ca8a04', background: 'rgba(234,179,8,0.12)' };
  return <Badge color={style.color} background={style.background}>{displayStatus}</Badge>;
};

const fulfillmentCapabilities: Array<{
  title: string;
  description: string;
  state: IntegrationState;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  {
    title: 'Order intake',
    description: 'Orders, payments and customer details',
    state: 'live',
    icon: ShoppingBag,
  },
  {
    title: 'Admin approval',
    description: 'Approval and confirmation email actions',
    state: 'live',
    icon: ShieldCheck,
  },
  {
    title: 'Courier & AWB',
    description: 'Courier assignment and shipment booking',
    state: 'live',
    icon: Truck,
  },
  {
    title: 'Live tracking',
    description: 'Polling is available; webhook automation is pending',
    state: 'webhook-pending',
    icon: Radio,
  },
  {
    title: 'Notifications',
    description: 'Admin and customer delivery emails are pending',
    state: 'webhook-pending',
    icon: Bell,
  },
];

const FulfillmentReadiness: React.FC = () => (
  <section className="orders-fulfillment-overview" aria-labelledby="fulfillment-overview-title">
    <div className="orders-section-heading">
      <div>
        <p className="orders-eyebrow">Fulfillment workspace</p>
        <h2 id="fulfillment-overview-title">Order-to-delivery operations</h2>
        <p>Shipment tools are connected. Webhook updates and delivery notifications remain pending.</p>
      </div>
      <IntegrationBadge state="live" />
    </div>

    <div className="orders-capability-grid">
      {fulfillmentCapabilities.map((capability) => (
        <article key={capability.title} className="orders-capability-card">
          <div className={`orders-capability-icon is-${capability.state}`}>
            <capability.icon size={18} />
          </div>
          <div>
            <div className="orders-capability-title-row">
              <h3>{capability.title}</h3>
              <IntegrationBadge state={capability.state} />
            </div>
            <p>{capability.description}</p>
          </div>
        </article>
      ))}
    </div>
  </section>
);

const PreviewImage: React.FC<{ src?: string; alt: string; size?: number }> = ({ src, alt, size = 48 }) => {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return (
      <div
        className="orders-preview-fallback"
        style={{ width: size, height: size }}
      >
        <ImageIcon size={Math.max(18, Math.floor(size / 2.6))} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className="orders-preview-image"
      style={{ width: size, height: size }}
    />
  );
};

const StatSkeleton: React.FC = () => (
  <div className="card" style={{ minHeight: 118 }}>
    <div className="skeleton" style={{ width: '42%', height: 12, marginBottom: 18 }} />
    <div className="skeleton" style={{ width: '64%', height: 28, marginBottom: 16 }} />
    <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 8 }} />
  </div>
);

const TableSkeleton: React.FC = () => (
  <>
    {Array.from({ length: 5 }).map((_, index) => (
      <tr key={index}>
        <td colSpan={5}>
          <div className="skeleton" style={{ height: 54 }}>
            <span className="sr-only">Loading order row</span>
          </div>
        </td>
      </tr>
    ))}
  </>
);

const getLayerPosition = (layer: Layer) => {
  const x = layer.x ?? layer.left;
  const y = layer.y ?? layer.top;
  if (typeof x === 'number' && typeof y === 'number') return `${Math.round(x)}, ${Math.round(y)}`;
  return 'N/A';
};

const terminalStatusLabel = (status: OrderStatus): string | null => {
  if (status === 'delivered') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'returned') return 'Returned';
  return null;
};

const terminalOrderStatuses = new Set<OrderStatus>([
  'delivered',
  'cancelled',
  'return_requested',
  'returned',
]);

type OrdersState = {
  orders: Order[];
  totalCount: number;
  totalPages: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  searchInput: string;
  debouncedSearch: string;
  orderStatus: OrderStatusFilter;
  fromDate: string;
  toDate: string;
  page: number;
  selectedOrder: Order | null;
};

type OrdersAction =
  | { type: 'SET_DEBOUNCED_SEARCH'; payload: string }
  | { type: 'START_LOADING'; payload: { showRefresh: boolean } }
  | { type: 'SET_DATA'; payload: { orders: Order[]; totalCount: number; totalPages: number } }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_PAGE'; payload: number | ((previous: number) => number) }
  | { type: 'SET_SEARCH_INPUT'; payload: string }
  | { type: 'SET_ORDER_STATUS'; payload: OrderStatusFilter }
  | { type: 'SET_FROM_DATE'; payload: string }
  | { type: 'SET_TO_DATE'; payload: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_SELECTED_ORDER'; payload: Order | null | ((previous: Order | null) => Order | null) }
  | { type: 'UPDATE_ORDER'; payload: Order }
  | { type: 'REMOVE_ORDER'; payload: { orderId: string } }
  | { type: 'UPDATE_ORDER_STATUS'; payload: { orderId: string; status: OrderStatus } };

const ordersInitialState: OrdersState = {
  orders: [],
  totalCount: 0,
  totalPages: 1,
  isLoading: true,
  isRefreshing: false,
  error: null,
  searchInput: '',
  debouncedSearch: '',
  orderStatus: 'all',
  fromDate: '',
  toDate: '',
  page: 1,
  selectedOrder: null,
};

function ordersReducer(state: OrdersState, action: OrdersAction): OrdersState {
  switch (action.type) {
    case 'SET_DEBOUNCED_SEARCH':
      return { ...state, debouncedSearch: action.payload };
    case 'START_LOADING':
      return {
        ...state,
        isRefreshing: action.payload.showRefresh ? true : state.isRefreshing,
        isLoading: true,
        error: null,
      };
    case 'SET_DATA':
      return {
        ...state,
        orders: action.payload.orders,
        totalCount: action.payload.totalCount,
        totalPages: action.payload.totalPages,
        isLoading: false,
        isRefreshing: false,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false, isRefreshing: false };
    case 'SET_PAGE':
      return {
        ...state,
        page:
          typeof action.payload === 'function'
            ? action.payload(state.page)
            : action.payload,
      };
    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.payload, page: 1 };
    case 'SET_ORDER_STATUS':
      return { ...state, orderStatus: action.payload, page: 1 };
    case 'SET_FROM_DATE':
      return { ...state, fromDate: action.payload, page: 1 };
    case 'SET_TO_DATE':
      return { ...state, toDate: action.payload, page: 1 };
    case 'CLEAR_FILTERS':
      return {
        ...state,
        searchInput: '',
        debouncedSearch: '',
        orderStatus: 'all',
        fromDate: '',
        toDate: '',
        page: 1,
      };
    case 'SET_SELECTED_ORDER':
      return {
        ...state,
        selectedOrder:
          typeof action.payload === 'function'
            ? action.payload(state.selectedOrder)
            : action.payload,
      };
    case 'UPDATE_ORDER':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order._id === action.payload._id ? { ...order, ...action.payload } : order
        ),
        selectedOrder:
          state.selectedOrder && state.selectedOrder._id === action.payload._id
            ? { ...state.selectedOrder, ...action.payload }
            : state.selectedOrder,
      };
    case 'REMOVE_ORDER': {
      const nextTotalCount = Math.max(0, state.totalCount - 1);
      return {
        ...state,
        orders: state.orders.filter((order) => order._id !== action.payload.orderId),
        totalCount: nextTotalCount,
        totalPages: Math.max(1, Math.ceil(nextTotalCount / ORDERS_PER_PAGE)),
        selectedOrder:
          state.selectedOrder?._id === action.payload.orderId ? null : state.selectedOrder,
      };
    }
    case 'UPDATE_ORDER_STATUS':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order._id === action.payload.orderId
            ? { ...order, orderStatus: action.payload.status }
            : order
        ),
        selectedOrder:
          state.selectedOrder && state.selectedOrder._id === action.payload.orderId
            ? { ...state.selectedOrder, orderStatus: action.payload.status }
            : state.selectedOrder,
      };
    default:
      return state;
  }
}

const Orders: React.FC = () => {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(ordersReducer, ordersInitialState);
  const [summaryModal, setSummaryModal] = useState<OrderSummaryModal>(null);
  const [summaryCounts, setSummaryCounts] = useState({ paid: 0, pending: 0, completed: 0 });
  const [isSummaryCountsLoading, setIsSummaryCountsLoading] = useState(true);
  const [summaryCountsError, setSummaryCountsError] = useState('');
  const [summaryOrders, setSummaryOrders] = useState<Order[]>([]);
  const [isSummaryOrdersLoading, setIsSummaryOrdersLoading] = useState(false);
  const [summaryOrdersError, setSummaryOrdersError] = useState('');
  const summaryRequestIdRef = useRef(0);
  const orderListRequestIdRef = useRef(0);
  const summaryCountsRequestIdRef = useRef(0);
  const hasSuccessfulSummaryCountsRef = useRef(false);
  const [orderPendingDeletion, setOrderPendingDeletion] = useState<Order | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const deleteTriggerElementRef = useRef<HTMLElement | null>(null);
  const orderDetailsTriggerElementRef = useRef<HTMLElement | null>(null);
  const {
    orders,
    totalCount,
    totalPages,
    isLoading,
    isRefreshing,
    error,
    searchInput,
    debouncedSearch,
    orderStatus,
    fromDate,
    toDate,
    page,
    selectedOrder,
  } = state;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dispatch({ type: 'SET_DEBOUNCED_SEARCH', payload: searchInput.trim() });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadOrders = useCallback(
    async (showRefresh = false, background = false) => {
      const requestId = orderListRequestIdRef.current + 1;
      orderListRequestIdRef.current = requestId;

      if (!background) {
        dispatch({ type: 'START_LOADING', payload: { showRefresh } });
      }

      try {
        const status = orderStatus === 'all' ? undefined : orderStatus;
        const search = debouncedSearch || undefined;
        const hasDateFilter = Boolean(fromDate || toDate);
        const response = hasDateFilter
          ? await fetchAllPaidOrders(status, search).then((allOrders) => {
              const filteredOrders = allOrders.filter((order) =>
                matchesDateRange(order, fromDate, toDate)
              );
              const filteredTotalPages = Math.max(
                1,
                Math.ceil(filteredOrders.length / ORDERS_PER_PAGE)
              );
              const start = (page - 1) * ORDERS_PER_PAGE;
              return {
                orders: filteredOrders.slice(start, start + ORDERS_PER_PAGE),
                total: filteredOrders.length,
                totalPages: filteredTotalPages,
              };
            })
          : await fetchPaidOrdersPage({
              page,
              limit: ORDERS_PER_PAGE,
              status,
              search,
            });

        if (orderListRequestIdRef.current !== requestId) return;
        dispatch({
          type: 'SET_DATA',
          payload: {
            orders: response.orders,
            totalCount: response.total,
            totalPages: response.totalPages,
          },
        });
      } catch (requestError: unknown) {
        if (orderListRequestIdRef.current !== requestId) return;
        console.error('Failed to load orders', requestError);
        if (background) return;
        const message =
          isRecord(requestError) &&
          isRecord(requestError.response) &&
          isRecord(requestError.response.data) &&
          typeof requestError.response.data.message === 'string'
            ? requestError.response.data.message
            : 'Failed to load orders.';
        dispatch({ type: 'SET_ERROR', payload: message });
        toast.error(message);
      }
    },
    [debouncedSearch, fromDate, orderStatus, page, toDate]
  );

  const loadSummaryCounts = useCallback(async () => {
    const requestId = summaryCountsRequestIdRef.current + 1;
    summaryCountsRequestIdRef.current = requestId;
    if (!hasSuccessfulSummaryCountsRef.current) {
      setSummaryCountsError('');
      setIsSummaryCountsLoading(true);
    }

    try {
      const counts = await fetchSummaryCounts();
      if (summaryCountsRequestIdRef.current !== requestId) return;
      hasSuccessfulSummaryCountsRef.current = true;
      setSummaryCounts(counts);
      setSummaryCountsError('');
    } catch (requestError: unknown) {
      if (summaryCountsRequestIdRef.current !== requestId) return;
      console.error('Failed to load order summary counts', requestError);
      if (!hasSuccessfulSummaryCountsRef.current) {
        setSummaryCountsError('Order totals are temporarily unavailable.');
      }
    } finally {
      if (summaryCountsRequestIdRef.current === requestId) {
        setIsSummaryCountsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadSummaryCounts();
  }, [loadSummaryCounts]);

  useEffect(() => {
    const refreshVisibleOrders = () => {
      if (document.visibilityState !== 'visible') return;
      void loadOrders(false, true);
      void loadSummaryCounts();
    };
    const intervalId = window.setInterval(refreshVisibleOrders, ORDERS_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshVisibleOrders);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshVisibleOrders);
    };
  }, [loadOrders, loadSummaryCounts]);

  useEffect(() => {
    dispatch({ type: 'SET_PAGE', payload: 1 });
  }, [debouncedSearch, fromDate, orderStatus, toDate]);

  useEffect(() => {
    if (!selectedOrder && !orderPendingDeletion && !summaryModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (summaryModal) {
        setSummaryModal(null);
      } else if (!orderPendingDeletion) {
        dispatch({ type: 'SET_SELECTED_ORDER', payload: null });
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDeletingOrder, orderPendingDeletion, selectedOrder, summaryModal]);

  const stats = useMemo(() => {
    return [
      {
        label: 'Paid Orders',
        value: summaryCounts.paid,
        icon: ShoppingBag,
        kind: 'paid' as const,
        helper: 'View all paid orders',
        color: 'var(--accent)',
        background: 'var(--accent-muted)',
      },
      {
        label: 'Pending Orders',
        value: summaryCounts.pending,
        icon: AlertTriangle,
        kind: 'pending' as const,
        helper: summaryCounts.pending > 0 ? 'Needs shipment attention' : 'Queue is clear',
        color: 'var(--danger)',
        background: 'var(--danger-muted)',
      },
      {
        label: 'Completed Orders',
        value: summaryCounts.completed,
        icon: CheckCircle2,
        kind: 'completed' as const,
        helper: 'View delivered orders',
        color: 'var(--success)',
        background: 'var(--success-muted)',
      },
    ];
  }, [summaryCounts]);

  const handleSummaryCardClick = (kind: Exclude<OrderSummaryModal, null>) => {
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    setSummaryModal(kind);
    setSummaryOrders([]);
    setSummaryOrdersError('');
    setIsSummaryOrdersLoading(true);

    void fetchSummaryOrders(kind)
      .then((nextOrders) => {
        if (summaryRequestIdRef.current === requestId) setSummaryOrders(nextOrders);
      })
      .catch((requestError: unknown) => {
        console.error('Failed to load order summary', requestError);
        if (summaryRequestIdRef.current === requestId) {
          setSummaryOrdersError('Could not load the complete order summary. Please try again.');
        }
      })
      .finally(() => {
        if (summaryRequestIdRef.current === requestId) setIsSummaryOrdersLoading(false);
      });
  };

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * ORDERS_PER_PAGE + 1;
  const rangeEnd = Math.min(page * ORDERS_PER_PAGE, totalCount);

  const clearFilters = () => {
    dispatch({ type: 'CLEAR_FILTERS' });
  };

  const handleOrderUpdated = useCallback(
    (updatedOrder: Order) => {
      dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });
      void loadOrders(true);
      void loadSummaryCounts();
    },
    [loadOrders, loadSummaryCounts]
  );

  const handleOrderStatusUpdated = useCallback((orderId: string, status: OrderStatus) => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId, status } });
    void loadSummaryCounts();
  }, [loadSummaryCounts]);

  const openOrderDetails = useCallback((order: Order) => {
    orderDetailsTriggerElementRef.current = document.activeElement as HTMLElement | null;
    dispatch({ type: 'SET_SELECTED_ORDER', payload: order });
  }, []);

  const requestOrderDeletion = useCallback((order: Order) => {
    deleteTriggerElementRef.current = selectedOrder
      ? orderDetailsTriggerElementRef.current
      : document.activeElement as HTMLElement | null;
    dispatch({ type: 'SET_SELECTED_ORDER', payload: null });
    setOrderPendingDeletion(order);
  }, [selectedOrder]);

  const closeOrderDeletionDialog = useCallback(() => {
    setOrderPendingDeletion(null);
    window.requestAnimationFrame(() => {
      const trigger = deleteTriggerElementRef.current;
      if (trigger?.isConnected) trigger.focus();
      deleteTriggerElementRef.current = null;
    });
  }, []);

  const handleDeleteOrder = useCallback(async () => {
    if (!orderPendingDeletion || isDeletingOrder) return;

    const orderToDelete = orderPendingDeletion;
    setIsDeletingOrder(true);

    try {
      await deleteOrder(orderToDelete._id);
      dispatch({ type: 'REMOVE_ORDER', payload: { orderId: orderToDelete._id } });
      closeOrderDeletionDialog();
      toast.success(`${orderToDelete.orderNumber} deleted successfully`);

      if (orders.length === 1 && page > 1) {
        dispatch({ type: 'SET_PAGE', payload: page - 1 });
      } else {
        await loadOrders(true);
      }
      void loadSummaryCounts();
    } catch (deleteError: unknown) {
      console.error('Failed to delete order', deleteError);
      toast.error(getErrorMessage(deleteError, 'Failed to delete order'));
    } finally {
      setIsDeletingOrder(false);
    }
  }, [closeOrderDeletionDialog, isDeletingOrder, loadOrders, loadSummaryCounts, orderPendingDeletion, orders.length, page]);

  const exportCsv = () => {
    const headers = [
      'Order ID',
      'Type',
      'Customer Name',
      'Email',
      'Product',
      'Date',
      'Amount',
      'Payment',
      'Order Status',
      'Shiprocket AWB',
      'Courier',
    ];
    const rows = orders.map((order) => [
      order.orderNumber,
      order.source,
      order.customer.name,
      order.customer.email,
      productLabel(order),
      formatDateTime(order.createdAt),
      String(order.totalAmount),
      order.paymentStatus,
      order.orderStatus,
      order.shiprocket?.awbCode || '',
      order.shiprocket?.courierName || '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-page-${page}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-wrapper orders-page">
      <div className="orders-page-content" style={{ display: 'grid', gap: 24 }}>
        <header className="orders-page-hero">
          <div className="orders-page-heading">
            <div className="orders-page-heading-icon">
              <Package size={22} />
            </div>
            <div>
              <p className="orders-eyebrow">Operations center</p>
              <h1 className="page-title">Orders & fulfillment</h1>
              <p>Manage every PrintFrint order from payment review through customer delivery.</p>
            </div>
          </div>

          <div className="orders-toolbar-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void loadOrders(true)}
              disabled={isRefreshing || isLoading}
            >
              {isRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Refresh
            </button>
            <button type="button" className="btn-primary" onClick={exportCsv} disabled={orders.length === 0}>
              <Download size={16} />
              <span>Export CSV</span>
            </button>
          </div>
        </header>

        <FulfillmentReadiness />

        <div className="orders-stat-grid">
          {isSummaryCountsLoading
            ? Array.from({ length: 3 }).map((_, index) => <StatSkeleton key={index} />)
            : summaryCountsError
              ? (
                  <div className='card orders-summary-count-error' role='alert'>
                    <span className='orders-summary-count-error-icon' aria-hidden='true'>
                      <AlertTriangle size={20} />
                    </span>
                    <div>
                      <strong>Order totals unavailable</strong>
                      <p>{summaryCountsError} Existing order data has not been replaced.</p>
                    </div>
                    <button type='button' className='btn-ghost' onClick={() => void loadSummaryCounts()}>
                      <RefreshCw size={15} />
                      Retry
                    </button>
                  </div>
                )
            : stats.map((stat) => (
                <div
                  key={stat.label}
                  role='button'
                  aria-label={stat.label + ': ' + stat.value + '. ' + stat.helper}
                  aria-haspopup='dialog'
                  tabIndex={0}
                  data-kind={stat.kind}
                  data-opens-dialog
                  data-alerting={stat.kind === 'pending' ? Number(stat.value) > 0 : false}
                  onClick={() => handleSummaryCardClick(stat.kind)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSummaryCardClick(stat.kind);
                    }
                  }}
                  className="card card-hover"
                  style={{ display: 'flex', alignItems: 'center', gap: 16 }}
                >
                  <div className="icon-box" style={{ background: stat.background }}>
                    <stat.icon size={20} color={stat.color} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                      {stat.label}
                    </p>
                    <p
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        lineHeight: 1.1,
                        margin: 0,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {stat.value}
                    </p>
                  </div>
                  <span className='orders-ticket-stat-helper'>{stat.helper}</span>
                  <ChevronRight className='orders-ticket-stat-chevron' size={17} aria-hidden='true' />
                </div>
              ))}
        </div>

        <section className="card orders-filter-card">
          <div className="orders-section-heading orders-filter-heading">
            <div>
              <p className="orders-eyebrow">Order queue</p>
              <h2>Find and filter orders</h2>
              <p>Only successfully paid purchases appear here. Narrow them by fulfillment state or date.</p>
            </div>
            <span className="orders-result-count">
              {isLoading ? 'Loading orders…' : `${totalCount} order${totalCount === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="orders-filter-grid">
            <div className="orders-filter-field orders-filter-search-field">
              <label className="form-label" htmlFor="orders-search">Search</label>
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  id="orders-search"
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: 40 }}
                  placeholder="Search by order number e.g. ORD-202604-0000, customer name or email"
                  value={searchInput}
                  onChange={(event) => {
                    dispatch({ type: 'SET_SEARCH_INPUT', payload: event.target.value });
                  }}
                />
              </div>
            </div>

            <div className="orders-filter-field">
              <label className="form-label" htmlFor="orders-status-filter">Order Status</label>
              <select
                id="orders-status-filter"
                className="input-field"
                value={orderStatus}
                onChange={(event) => {
                  dispatch({
                    type: 'SET_ORDER_STATUS',
                    payload: event.target.value as OrderStatusFilter,
                  });
                }}
              >
                {ORDER_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {orderStatusLabels[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="orders-filter-date-range" role="group" aria-label="Order date range">
              <div className="orders-filter-field">
                <label className="form-label" htmlFor="orders-from-date">From date</label>
                <input
                  id="orders-from-date"
                  type="date"
                  className="input-field"
                  value={fromDate}
                  onChange={(event) => {
                    dispatch({ type: 'SET_FROM_DATE', payload: event.target.value });
                  }}
                />
              </div>

              <div className="orders-filter-field">
                <label className="form-label" htmlFor="orders-to-date">To date</label>
                <input
                  id="orders-to-date"
                  type="date"
                  className="input-field"
                  value={toDate}
                  onChange={(event) => {
                    dispatch({ type: 'SET_TO_DATE', payload: event.target.value });
                  }}
                />
              </div>
            </div>

            <button type="button" className="btn-ghost orders-filter-clear" onClick={clearFilters}>
              <X size={15} aria-hidden="true" />
              Clear filters
            </button>
          </div>
        </section>

        {error ? (
          <div className="card" style={{ padding: 28, textAlign: 'center' }}>
            <div className="orders-error-icon">
              <AlertTriangle size={22} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>
              Could not load orders
            </h3>
            <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: 14 }}>
              {error}
            </p>
            <button type="button" className="btn-ghost" onClick={() => void loadOrders()}>
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="card orders-table-card" style={{ padding: 0 }}>
              <div className="table-container orders-table-container" style={{ border: 'none', borderRadius: 'inherit' }}>
                <table className="data-table orders-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Order ID</th>
                      <th>Product</th>
                      <th>Order Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton />
                    ) : orders.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState />
                        </td>
                      </tr>
                    ) : (
                      orders.map((order) => (
                        <tr
                          key={`${order.source}-${order._id}`}
                          className="group"
                          data-order-state={order.orderStatus}
                          data-order-source={order.source}
                        >
                          <td>
                            <strong className="orders-compact-customer" title={order.customer.name}>
                              {order.customer.name}
                            </strong>
                          </td>
                          <td>
                            <span className="orders-id-text" title={order.orderNumber}>
                              {order.orderNumber}
                            </span>
                          </td>
                          <td>
                            <div className="orders-compact-product" title={productLabel(order)}>
                              {order.source === 'customized' ? (
                                <span className="orders-customized-mark" aria-label="Customized product" title="Customized">C</span>
                              ) : null}
                              <span>{productLabel(order)}</span>
                            </div>
                          </td>
                          <td>
                            <OrderStatusBadge status={order.orderStatus} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="orders-row-actions">
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={() => openOrderDetails(order)}
                              >
                                <Eye size={15} />
                                View
                              </button>
                              <button
                                type="button"
                                className="orders-delete-icon-button"
                                onClick={() => requestOrderDeletion(order)}
                                aria-label={`Delete ${order.orderNumber} from order history`}
                                title="Delete from order history"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="orders-card-list">
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="card">
                      <div className="skeleton" style={{ height: 180 }} />
                    </div>
                  ))
                : orders.map((order) => (
                    <div
                      key={`${order.source}-${order._id}`}
                      className="card"
                      data-order-state={order.orderStatus}
                      data-order-source={order.source}
                      style={{ display: 'grid', gap: 14 }}
                    >
                      <div className='orders-compact-mobile-summary'>
                        <div className='orders-compact-mobile-heading'>
                          <strong title={order.customer.name}>{order.customer.name}</strong>
                          <OrderStatusBadge status={order.orderStatus} />
                        </div>
                        <div className='orders-compact-mobile-details'>
                          <div>
                            <span>Order ID</span>
                            <strong title={order.orderNumber}>{order.orderNumber}</strong>
                          </div>
                          <div>
                            <span>Product</span>
                            <strong title={productLabel(order)}>
                              {order.source === 'customized' ? (
                                <span className='orders-customized-mark' aria-label='Customized product' title='Customized'>C</span>
                              ) : null}
                              <span>{productLabel(order)}</span>
                            </strong>
                          </div>
                        </div>
                        <div className='orders-compact-mobile-actions'>
                          <button type='button' className='btn-ghost' onClick={() => openOrderDetails(order)}>
                            <Eye size={15} />
                            View
                          </button>
                          <button
                            type='button'
                            className='orders-delete-icon-button'
                            onClick={() => requestOrderDeletion(order)}
                            aria-label={`Delete ${order.orderNumber} from order history`}
                            title='Delete from order history'
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              {!isLoading && orders.length === 0 ? (
                <div className="card">
                  <EmptyState compact />
                </div>
              ) : null}
            </div>

            {!isLoading && totalCount > 0 ? (
              <Pagination
                page={page}
                totalPages={totalPages}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                totalCount={totalCount}
                onPageChange={(nextPage) => dispatch({ type: 'SET_PAGE', payload: nextPage })}
              />
            ) : null}
          </>
        )}
      </div>

      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {summaryModal ? (
            <OrderSummaryDialog
              key={`summary-${summaryModal}`}
              mode={summaryModal}
              orders={summaryOrders}
              isLoading={isSummaryOrdersLoading}
              error={summaryOrdersError}
              onSelectOrder={(order) => {
                setSummaryModal(null);
                navigate(`/shipment-tracking?orderId=${encodeURIComponent(order._id)}`);
              }}
              onClose={() => setSummaryModal(null)}
            />
          ) : null}
          {selectedOrder ? (
            <OrderDetailModal
              key={selectedOrder._id}
              order={selectedOrder}
              onOrderUpdated={handleOrderUpdated}
              onOrderStatusUpdated={handleOrderStatusUpdated}
              onDelete={() => requestOrderDeletion(selectedOrder)}
              onClose={() => dispatch({ type: 'SET_SELECTED_ORDER', payload: null })}
              onCopy={() => void copyText(selectedOrder.orderNumber)}
            />
          ) : null}
          {orderPendingDeletion ? (
            <DeleteOrderDialog
              key={`delete-${orderPendingDeletion._id}`}
              order={orderPendingDeletion}
              isDeleting={isDeletingOrder}
              onCancel={closeOrderDeletionDialog}
              onConfirm={() => void handleDeleteOrder()}
            />
          ) : null}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
};

const getSummaryImage = (order: Order) => order.customization?.previewImageUrl || '';
const getSummaryProductImage = (order: Order) =>
  order.items.find((item) => item.product.image)?.product.image || '';
type SummaryLiveShipment = {
  awbCode: string | null;
  status: string | null;
  loading: boolean;
};

const OrderSummaryDialog: React.FC<{
  mode: Exclude<OrderSummaryModal, null>;
  orders: Order[];
  isLoading: boolean;
  error: string;
  onSelectOrder: (order: Order) => void;
  onClose: () => void;
}> = ({ mode, orders, isLoading, error, onSelectOrder, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const completed = mode === 'completed';
  const pending = mode === 'pending';
  const [liveShipments, setLiveShipments] = useState<Record<string, SummaryLiveShipment>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  useEffect(() => {
    if (!pending) return;

    const trackableOrders = orders.filter((order) =>
      Boolean(
        order.shiprocket?.awbCode ||
        order.shiprocket?.shipmentId ||
        order.shiprocket?.shiprocketOrderId
      )
    );

    if (trackableOrders.length === 0) {
      setLiveShipments({});
      return;
    }

    let active = true;
    setLiveShipments(
      Object.fromEntries(
        trackableOrders.map((order) => [
          order._id,
          {
            awbCode: order.shiprocket?.awbCode || null,
            status: order.shiprocket?.shipmentStatus || null,
            loading: true,
          },
        ])
      )
    );

    const queue = [...trackableOrders];
    const loadNextShipment = (): Promise<void> => {
      if (!active) return Promise.resolve();
      const order = queue.shift();
      if (!order) return Promise.resolve();

      return getShiprocketTracking(order._id)
        .then((tracking) => {
          if (!active) return;
          setLiveShipments((current) => ({
            ...current,
            [order._id]: {
              awbCode: tracking.awbCode || order.shiprocket?.awbCode || null,
              status: tracking.currentStatus || order.shiprocket?.shipmentStatus || null,
              loading: false,
            },
          }));
        })
        .catch(() => {
          if (!active) return;
          setLiveShipments((current) => ({
            ...current,
            [order._id]: {
              awbCode: order.shiprocket?.awbCode || null,
              status: order.shiprocket?.shipmentStatus || null,
              loading: false,
            },
          }));
        })
        .then(loadNextShipment);
    };

    const workerCount = Math.min(4, queue.length);
    for (let worker = 0; worker < workerCount; worker += 1) {
      void loadNextShipment();
    }

    return () => {
      active = false;
    };
  }, [orders, pending]);

  return (
    <dialog
      ref={dialogRef}
      className='modal-backdrop orders-summary-backdrop'
      aria-labelledby='orders-summary-title'
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <button type='button' className='modal-backdrop-dismiss' onClick={onClose} aria-label='Close order summary' />
      <m.section
        className={`orders-summary-dialog is-${mode}`}
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
      >
        <header className='orders-summary-header'>
          <div>
            <p className='orders-eyebrow'>
              {completed ? 'Fulfillment archive' : pending ? 'Shipment queue' : 'Payment register'}
            </p>
            <h2 id='orders-summary-title'>
              {completed ? 'Successfully delivered' : pending ? 'Orders awaiting delivery' : 'Paid orders'}
            </h2>
            <p>
              {completed
                ? 'Orders received by customers.'
                : pending
                  ? 'Active paid shipments. Select an order to track it.'
                  : 'Verified customer payments.'}
            </p>
          </div>
          <span className='orders-summary-count' aria-label={isLoading ? 'Loading order count' : `${orders.length} orders`}>
            {isLoading ? <Loader2 className='animate-spin' size={14} /> : orders.length}
          </span>
          <button type='button' className='action-icon-button' onClick={onClose} aria-label='Close' autoFocus>
            <X size={19} />
          </button>
        </header>

        <div className='orders-summary-table'>
          <div className={`orders-summary-columns is-${mode}`} aria-hidden='true'>
            {completed
              ? <><span>Design</span><span>Customer</span><span>Product</span><span>Received</span></>
              : pending
                ? <><span>Product</span><span>Customer</span><span>AWB ID</span><span>Live status</span></>
                : <><span>Design</span><span>Order ID</span><span>Qty</span><span>Paid</span></>}
          </div>
          <div className='orders-summary-scroll'>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className='skeleton orders-summary-row'>
                  <span className='sr-only'>Loading order summary row</span>
                </div>
              ))
            ) : error ? (
              <div className='orders-summary-empty is-error'>
                <AlertTriangle size={28} />
                <span>{error}</span>
              </div>
            ) : orders.length === 0 ? (
              <div className='orders-summary-empty'>
                <PackageCheck size={28} />
                <span>{pending ? 'No orders are awaiting delivery.' : 'No matching orders.'}</span>
              </div>
            ) : orders.map((order) => {
              const image = pending ? getSummaryProductImage(order) : getSummaryImage(order);
              const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
              const liveShipment = liveShipments[order._id];
              const awbCode = liveShipment?.awbCode || order.shiprocket?.awbCode;
              const shipmentStatus =
                liveShipment?.status ||
                order.shiprocket?.shipmentStatus ||
                orderStatusLabels[order.orderStatus];
              const rowContent = (
                <>
                  <span className='orders-summary-thumb'>
                    {image
                      ? <img src={image} alt={pending ? `${productLabel(order)} product` : ''} referrerPolicy='no-referrer' />
                      : <ImageIcon size={17} />}
                  </span>
                  {completed ? (
                    <>
                      <strong title={order.customer.name}>{order.customer.name}</strong>
                      <span title={productLabel(order)}>{productLabel(order)}</span>
                      <time dateTime={order.updatedAt}>{formatDateTime(order.updatedAt)}</time>
                    </>
                  ) : pending ? (
                    <>
                      <strong title={order.customer.name}>{order.customer.name}</strong>
                      <span className='orders-summary-order-id' title={awbCode || 'AWB not assigned'}>
                        {awbCode || 'Not assigned'}
                      </span>
                      {liveShipment?.loading ? (
                        <span className='orders-summary-live-loading'>
                          <Loader2 className='animate-spin' size={13} />
                          Checking
                        </span>
                      ) : <ShiprocketStatusBadge status={shipmentStatus} />}
                    </>
                  ) : (
                    <>
                      <strong className='orders-summary-order-id' title={order.orderNumber}>
                        {order.orderNumber}
                      </strong>
                      <strong>{quantity}</strong>
                      <strong>{formatCurrency(order.totalAmount)}</strong>
                    </>
                  )}
                </>
              );

              return pending ? (
                <button
                  key={order._id}
                  type='button'
                  className='orders-summary-row is-pending'
                  onClick={() => onSelectOrder(order)}
                  aria-label={`Track order ${order.orderNumber} for ${order.customer.name}`}
                  title={`Open shipment tracking for ${order.orderNumber}`}
                >
                  {rowContent}
                  <ChevronRight className='orders-summary-row-chevron' size={16} aria-hidden='true' />
                </button>
              ) : (
                <article key={order._id} className={`orders-summary-row is-${mode}`}>
                  {rowContent}
                </article>
              );
            })}
          </div>
        </div>
      </m.section>
    </dialog>
  );
};

const EmptyState: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    style={{
      textAlign: 'center',
      padding: compact ? '28px 16px' : '64px 20px',
      color: 'var(--text-muted)',
    }}
  >
    <PackageCheck size={42} style={{ margin: '0 auto 14px', opacity: 0.36 }} />
    <p style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--text-primary)' }}>
      No orders found
    </p>
    <p style={{ margin: 0, fontSize: 13 }}>Checkout orders will appear here after purchase</p>
  </div>
);

const Pagination: React.FC<{
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}> = ({ page, totalPages, rangeStart, rangeEnd, totalCount, onPageChange }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}
  >
    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
      Showing {rangeStart} to {rangeEnd} of {totalCount} orders
    </p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn-ghost" disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
        <ChevronLeft size={15} />
        Previous
      </button>
      {Array.from({ length: totalPages }).map((_, index) => {
        const pageNumber = index + 1;
        const shouldShow = pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 1;
        if (!shouldShow) {
          if (pageNumber === page - 2 || pageNumber === page + 2) {
            return (
              <span key={pageNumber} style={{ padding: '9px 2px', color: 'var(--text-muted)' }}>
                ...
              </span>
            );
          }
          return null;
        }
        return (
          <button
            key={pageNumber}
            type="button"
            className={pageNumber === page ? 'btn-primary' : 'btn-ghost'}
            onClick={() => onPageChange(pageNumber)}
            style={{ minWidth: 40, paddingInline: 12 }}
          >
            {pageNumber}
          </button>
        );
      })}
      <button
        type="button"
        className="btn-ghost"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Next
        <ChevronRight size={15} />
      </button>
    </div>
  </div>
);

const DeleteOrderDialog: React.FC<{
  order: Order;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ order, isDeleting, onCancel, onConfirm }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
  <dialog
    ref={dialogRef}
    className="modal-backdrop orders-delete-modal-backdrop"
    aria-labelledby="delete-order-title"
    aria-describedby="delete-order-description"
    onCancel={(event) => {
      event.preventDefault();
      if (!isDeleting) onCancel();
    }}
  >
    <button
      type="button"
      className="modal-backdrop-dismiss"
      onClick={onCancel}
      disabled={isDeleting}
      aria-label="Cancel deleting order"
    />
    <m.section
      className="modal-box orders-delete-dialog"
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 12 }}
    >
      <div className="orders-delete-dialog-icon">
        <Trash2 size={22} />
      </div>
      <div>
        <p className="orders-eyebrow">Order management</p>
        <h2 id="delete-order-title">Delete this order?</h2>
        <p id="delete-order-description">
          This permanently deletes the order from the PrintFrint server and removes it from every
          admin device.
        </p>
      </div>
      <div className="orders-delete-dialog-order">
        <span>Order</span>
        <strong>{order.orderNumber}</strong>
        <small>{order.customer.name} · {formatCurrency(order.totalAmount)}</small>
      </div>
      <div className="orders-delete-dialog-warning">
        <AlertTriangle size={16} />
        <span>This action cannot be undone from the dashboard.</span>
      </div>
      <div className="orders-delete-dialog-actions">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={isDeleting} autoFocus>
          Keep order
        </button>
        <button
          type="button"
          className="orders-delete-button"
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
          {isDeleting ? 'Deleting…' : 'Delete order'}
        </button>
      </div>
    </m.section>
  </dialog>
  );
};

const PurchasedItemsSummary: React.FC<{ items: OrderItem[] }> = ({ items }) => {
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <section className="card orders-purchased-items" aria-labelledby="purchased-items-title">
      <div className="orders-purchased-items-heading">
        <div>
          <p className="orders-eyebrow">Purchase details</p>
          <h3 id="purchased-items-title" className="section-title">Ordered Quantity</h3>
        </div>
        <span className="orders-quantity-total">
          {totalQuantity} {totalQuantity === 1 ? 'unit' : 'units'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="orders-purchased-items-empty">No purchased items were returned by the API.</div>
      ) : (
        <div className="orders-purchased-items-list">
          {items.map((item) => (
            <article key={item._id} className="orders-purchased-item">
              {item.product.image ? (
                <PreviewImage src={item.product.image} alt={`${item.product.name} image`} size={54} />
              ) : (
                <span className="orders-purchased-item-icon"><Package size={18} /></span>
              )}
              <div className="orders-purchased-item-content">
                <strong>{item.product.name}</strong>
                <span>{formatCurrency(item.price)} per unit</span>
                {item.options ? (
                  <div className="orders-item-options" aria-label="Selected product options">
                    {Object.entries(item.options).map(([key, value]) => (
                      <span key={key}><b>{key}:</b> {value}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="orders-purchased-item-quantity">
                <span>Quantity</span>
                <strong>{item.quantity}</strong>
                <small>{formatCurrency(item.quantity * item.price)}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

type OrderDetailState = {
  deliveryDate: string;
  deliveryNote: string;
  deliveryError: string;
  deliverySuccess: string;
  isApproving: boolean;
  isSavingEstimate: boolean;
  isResending: boolean;
  isRefreshingStatus: boolean;
  statusRefreshError: string;
  isResendConfirmOpen: boolean;
  computedEstimate: ComputedDeliveryEstimateState;
};

type ComputedDeliveryEstimateState = {
  status: 'idle' | 'loading' | 'success' | 'error' | 'skipped';
  pincode: string;
  result: PincodeDeliveryEstimate | null;
  error: string;
};

type OrderDetailAction =
  | { type: 'setDeliveryDate'; value: string }
  | { type: 'setDeliveryNote'; value: string }
  | { type: 'setDeliveryError'; value: string }
  | { type: 'setDeliverySuccess'; value: string }
  | { type: 'setApproving'; value: boolean }
  | { type: 'setSavingEstimate'; value: boolean }
  | { type: 'setResending'; value: boolean }
  | { type: 'setRefreshingStatus'; value: boolean }
  | { type: 'setStatusRefreshError'; value: string }
  | { type: 'setResendConfirmOpen'; value: boolean }
  | { type: 'setComputedEstimate'; value: ComputedDeliveryEstimateState }
  | { type: 'toggleResendConfirm' };

const createComputedEstimateState = (
  status: ComputedDeliveryEstimateState['status'],
  pincode = '',
  result: PincodeDeliveryEstimate | null = null,
  error = ''
): ComputedDeliveryEstimateState => ({
  status,
  pincode,
  result,
  error,
});

const getOrderPincode = (order: Order) => order.address.pincode.trim();

const isValidPincode = (pincode: string) => /^\d{6}$/.test(pincode);

const getInitialOrderDetailState = (order: Order): OrderDetailState => ({
  deliveryDate: order.estimatedDeliveryDate?.slice(0, 10) || '',
  deliveryNote: order.deliveryNote || '',
  deliveryError: '',
  deliverySuccess: '',
  isApproving: false,
  isSavingEstimate: false,
  isResending: false,
  isRefreshingStatus: false,
  statusRefreshError: '',
  isResendConfirmOpen: false,
  computedEstimate: createComputedEstimateState('idle', getOrderPincode(order)),
});

const orderDetailReducer = (
  state: OrderDetailState,
  action: OrderDetailAction
): OrderDetailState => {
  switch (action.type) {
    case 'setDeliveryDate':
      return {
        ...state,
        deliveryDate: action.value,
        deliveryError: state.deliveryError ? '' : state.deliveryError,
      };
    case 'setDeliveryNote':
      return { ...state, deliveryNote: action.value };
    case 'setDeliveryError':
      return { ...state, deliveryError: action.value };
    case 'setDeliverySuccess':
      return { ...state, deliverySuccess: action.value };
    case 'setApproving':
      return { ...state, isApproving: action.value };
    case 'setSavingEstimate':
      return { ...state, isSavingEstimate: action.value };
    case 'setResending':
      return { ...state, isResending: action.value };
    case 'setRefreshingStatus':
      return { ...state, isRefreshingStatus: action.value };
    case 'setStatusRefreshError':
      return { ...state, statusRefreshError: action.value };
    case 'setResendConfirmOpen':
      return { ...state, isResendConfirmOpen: action.value };
    case 'setComputedEstimate':
      return { ...state, computedEstimate: action.value };
    case 'toggleResendConfirm':
      return { ...state, isResendConfirmOpen: !state.isResendConfirmOpen };
    default:
      return state;
  }
};

// Shiprocket workspace state

type SRWorkspaceState = {
  data: ShiprocketData | null;
  tracking: ShiprocketTrackingResult | null;
  loading: boolean;
  error: string | null;
  isSchedulingPickup: boolean;
  isSyncingShipment: boolean;
  isCancellingShipment: boolean;
  isDownloadingLabel: boolean;
  isDownloadingManifest: boolean;
  lastFetchedAt: Date | null;
};

type SRWorkspaceAction =
  | { type: 'start' }
  | { type: 'success'; data: ShiprocketData; tracking: ShiprocketTrackingResult | null; fetchedAt: Date }
  | { type: 'error'; message: string }
  | { type: 'setSchedulingPickup'; value: boolean }
  | { type: 'setSyncingShipment'; value: boolean }
  | { type: 'setCancellingShipment'; value: boolean }
  | { type: 'setDownloadingLabel'; value: boolean }
  | { type: 'setDownloadingManifest'; value: boolean }
  | { type: 'updatePickup'; pickupDate: string | null; pickupScheduled: boolean | null };

function srWorkspaceReducer(state: SRWorkspaceState, action: SRWorkspaceAction): SRWorkspaceState {
  switch (action.type) {
    case 'start': return { ...state, loading: true, error: null };
    case 'success': {
      const trackingUrl = action.tracking?.trackingUrl || action.data.trackingUrl;
      return {
        ...state,
        loading: false,
        error: null,
        data: trackingUrl ? { ...action.data, trackingUrl } : action.data,
        tracking: action.tracking ?? state.tracking,
        lastFetchedAt: action.fetchedAt,
      };
    }
    case 'error': return { ...state, loading: false, error: action.message };
    case 'setSchedulingPickup': return { ...state, isSchedulingPickup: action.value };
    case 'setSyncingShipment': return { ...state, isSyncingShipment: action.value };
    case 'setCancellingShipment': return { ...state, isCancellingShipment: action.value };
    case 'setDownloadingLabel': return { ...state, isDownloadingLabel: action.value };
    case 'setDownloadingManifest': return { ...state, isDownloadingManifest: action.value };
    case 'updatePickup':
      return { ...state, data: state.data ? { ...state.data, pickupScheduledDate: action.pickupDate, pickupScheduled: action.pickupScheduled } : state.data };
    default: return state;
  }
}


const terminalShipStatuses = new Set(['delivered', 'cancelled', 'canceled', 'returned', 'rto_delivered']);

const ShipmentWorkspace: React.FC<{ order: Order }> = ({ order }) => {
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const [ws, dispatch] = useReducer(srWorkspaceReducer, {
    data: null, tracking: null, loading: false, error: null,
    isSchedulingPickup: false, isSyncingShipment: false, isCancellingShipment: false,
    isDownloadingLabel: false, isDownloadingManifest: false, lastFetchedAt: null,
  });

  const isCancelled = order.orderStatus === 'cancelled';
  const isApproved = !['placed', 'cancelled'].includes(order.orderStatus);

  // Merge order-level shiprocket fields (already normalized from the API response)
  // with freshly fetched data. Fresh fetch takes priority.
  const resolvedSource: ShiprocketData | null = ws.data ?? (order.shiprocket ? {
    shiprocketOrderId: order.shiprocket.shiprocketOrderId ?? null,
    shipmentId: order.shiprocket.shipmentId ?? null,
    awbCode: order.shiprocket.awbCode ?? null,
    courierName: order.shiprocket.courierName ?? null,
    courierCompanyId: null,
    shipmentStatus: order.shiprocket.shipmentStatus ?? null,
    trackingUrl: order.shiprocket.trackingUrl ?? null,
    currentLocation: order.shiprocket.currentLocation ?? null,
    lastShiprocketError: order.shiprocket.lastShiprocketError ?? null,
    etd: order.shiprocket.etd ?? null,
    pickupScheduledDate: order.shiprocket.pickupScheduledDate ?? null,
    pickupScheduled: order.shiprocket.pickupScheduled ?? null,
    pickupToken: order.shiprocket.pickupToken ?? null,
    labelUrl: order.shiprocket.labelUrl ?? null,
    manifestUrl: order.shiprocket.manifestUrl ?? null,
    lastSyncedAt: order.shiprocket.lastSyncedAt ?? null,
  } : null);
  const resolved: ShiprocketData | null = resolvedSource;

  const hasBooking = Boolean(resolved?.awbCode || resolved?.shiprocketOrderId);
  const isPickupScheduled = Boolean(resolved?.pickupScheduled || resolved?.pickupScheduledDate || ws.tracking?.activities.some((activity) => {
    const eventStatus = activity.status.toLowerCase().replace(/[\s-]+/g, '_');
    const eventText = `${activity.status} ${activity.activity}`.toLowerCase().replace(/[\s-]+/g, '_');
    return eventStatus === 'picked' || eventStatus === 'on_hold' || eventStatus === 'rts' || eventStatus.startsWith('recd_') || eventText.includes('picked_successfully');
  }));
  const trackingStatus = ws.tracking?.currentStatus?.trim() || null;
  const storedStatus = resolved?.shipmentStatus?.trim() || null;
  const effectiveShipmentStatus = trackingStatus && !/^\d+$/.test(trackingStatus)
    ? trackingStatus
    : storedStatus || trackingStatus;
  const isTerminalShipment = terminalShipStatuses.has(
    (effectiveShipmentStatus || '').toLowerCase().replace(/[\s-]+/g, '_')
  );

  const fetchDetails = useCallback(async () => {
    if (!isApproved || isCancelled) return;
    const requestId = ++requestIdRef.current;
    dispatch({ type: 'start' });
    try {
      // Tracking requires a Shiprocket shipment reference. Fetch the saved shipment
      // first so orders that have not been booked never call the tracking endpoint.
      const shipment = await getShipmentDetails(order._id);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      let tracking: ShiprocketTrackingResult | null = null;
      if (shipment.shipmentId || shipment.awbCode) {
        try {
          tracking = await getShiprocketTracking(order._id);
        } catch {
          // Keep the shipment information available if only live tracking fails.
        }
      }

      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      dispatch({ type: 'success', data: shipment, tracking, fetchedAt: new Date() });
    } catch (err) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        dispatch({ type: 'error', message: getErrorMessage(err, 'Could not load Shiprocket data') });
      }
    }
  }, [isApproved, isCancelled, order._id]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchDetails();
    return () => { mountedRef.current = false; };
  }, [fetchDetails]);

  // Poll every 30 s while order is in-flight and has a Shiprocket booking
  useEffect(() => {
    if (!hasBooking || terminalOrderStatuses.has(order.orderStatus) || isTerminalShipment) return undefined;
    const id = window.setInterval(() => void fetchDetails(), 30_000);
    return () => window.clearInterval(id);
  }, [fetchDetails, hasBooking, isTerminalShipment, order.orderStatus]);

  const handleSchedulePickup = async () => {
    dispatch({ type: 'setSchedulingPickup', value: true });
    try {
      const result = await schedulePickup(order._id);
      if (!mountedRef.current) return;
      dispatch({ type: 'updatePickup', pickupDate: result.pickupDate, pickupScheduled: result.pickupScheduled });
      toast.success(result.status ? `Pickup scheduled: ${result.status}` : 'Pickup scheduled');
      void fetchDetails();
    } catch (err) {
      if (mountedRef.current) toast.error(getErrorMessage(err, 'Failed to schedule pickup'));
    } finally {
      if (mountedRef.current) dispatch({ type: 'setSchedulingPickup', value: false });
    }
  };

  const handleSyncShipment = async () => {
    dispatch({ type: 'setSyncingShipment', value: true });
    try {
      const shipment = await syncShipment(order._id);
      if (!mountedRef.current) return;
      dispatch({ type: 'success', data: shipment, tracking: null, fetchedAt: new Date() });
      toast.success(shipment.awbCode ? `Shipment created — AWB ${shipment.awbCode}` : 'Shipment synced with Shiprocket');
      void fetchDetails();
    } catch (err) {
      if (mountedRef.current) toast.error(getErrorMessage(err, 'Failed to create Shiprocket shipment'));
    } finally {
      if (mountedRef.current) dispatch({ type: 'setSyncingShipment', value: false });
    }
  };

  const handleCancelShipment = async () => {
    if (!window.confirm('Cancel this Shiprocket shipment? This cannot be undone.')) return;
    dispatch({ type: 'setCancellingShipment', value: true });
    try {
      await cancelShipment(order._id);
      if (!mountedRef.current) return;
      toast.success('Shipment cancelled on Shiprocket');
      void fetchDetails();
    } catch (err) {
      if (mountedRef.current) toast.error(getErrorMessage(err, 'Failed to cancel shipment'));
    } finally {
      if (mountedRef.current) dispatch({ type: 'setCancellingShipment', value: false });
    }
  };

  const handleDownloadLabel = async () => {
    dispatch({ type: 'setDownloadingLabel', value: true });
    try {
      const url = resolved?.labelUrl || await getShipmentLabel(order._id);
      if (!mountedRef.current) return;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else toast.error('Label not available yet');
    } catch (err) {
      if (mountedRef.current) toast.error(getErrorMessage(err, 'Failed to get shipping label'));
    } finally {
      if (mountedRef.current) dispatch({ type: 'setDownloadingLabel', value: false });
    }
  };

  const handleDownloadManifest = async () => {
    dispatch({ type: 'setDownloadingManifest', value: true });
    try {
      const url = resolved?.manifestUrl || await getShipmentManifest(order._id);
      if (!mountedRef.current) return;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else toast.error('Manifest not available yet');
    } catch (err) {
      if (mountedRef.current) toast.error(getErrorMessage(err, 'Failed to get manifest'));
    } finally {
      if (mountedRef.current) dispatch({ type: 'setDownloadingManifest', value: false });
    }
  };

  // Build timeline: prefer live Shiprocket activity log, fall back to order status steps
  const timelineSteps: Array<{ key: string; label: string; description: string; date?: string; state: 'complete' | 'current' | 'pending' }> =
    ws.tracking?.activities && ws.tracking.activities.length > 0
      ? ws.tracking.activities.map((a, index) => ({
          key: `${a.date}-${a.activity}-${index}`,
          label: a.activity || a.status || 'Shipment event',
          description: a.location || '',
          date: a.date,
          state: 'complete' as const,
        }))
      : [
          { key: 'order-received', label: 'Order received', description: 'Payment captured in PrintFrint', date: order.createdAt, state: 'complete' },
          {
            key: 'admin-approval',
            label: 'Admin approval',
            description: isCancelled ? 'Order cancelled before fulfillment' : isApproved ? 'Order confirmed in PrintFrint' : 'Waiting for admin approval',
            state: (isApproved ? 'complete' : isCancelled ? 'pending' : 'current') as 'complete' | 'current' | 'pending',
          },
          {
            key: 'courier-awb',
            label: 'Courier & AWB',
            description: resolved?.awbCode ? `AWB: ${resolved.awbCode}${resolved.courierName ? ` — ${resolved.courierName}` : ''}` : 'Awaiting shipment creation',
            state: (resolved?.awbCode ? 'complete' : 'pending') as 'complete' | 'current' | 'pending',
          },
          {
            key: 'pickup-transit',
            label: 'Pickup & transit',
            description: resolved?.pickupScheduledDate ? `Pickup: ${formatDateTime(resolved.pickupScheduledDate)}` : resolved?.currentLocation ? `Currently: ${resolved.currentLocation}` : 'Awaiting pickup and transit events',
            state: (resolved?.pickupScheduledDate || resolved?.currentLocation ? 'complete' : 'pending') as 'complete' | 'current' | 'pending',
          },
          {
            key: 'delivered',
            label: 'Delivered',
            description: order.orderStatus === 'delivered' ? 'Delivered successfully' : resolved?.etd ? `ETA: ${formatComputedDeliveryDate(resolved.etd)}` : 'Awaiting verified delivery event',
            state: (order.orderStatus === 'delivered' ? 'complete' : 'pending') as 'complete' | 'current' | 'pending',
          },
        ];

  return (
    <section className="orders-shipment-workspace" aria-labelledby="shipment-workspace-title">
      <div className="orders-section-heading">
        <div>
          <p className="orders-eyebrow">Shipment workspace</p>
          <h2 id="shipment-workspace-title">Shiprocket fulfillment</h2>
          <p>Live courier details, AWB, pickup scheduling and delivery tracking.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ws.loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
          <IntegrationBadge state={hasBooking ? 'live' : 'api-pending'} />
          <button
            type="button"
            className="action-icon-button"
            onClick={() => void fetchDetails()}
            disabled={ws.loading || !isApproved}
            aria-label="Refresh Shiprocket data"
            title="Refresh from Shiprocket"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {ws.error && !hasBooking && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-muted)', color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
          <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />
          {ws.error}
        </div>
      )}

      {/* 4 live summary cards */}
      <div className="orders-shipment-summary-grid">
        <article>
          <span className="orders-shipment-summary-icon"><Truck size={17} /></span>
          <div>
            <p>Assigned courier</p>
            <strong>{resolved?.courierName || 'Awaiting selection'}</strong>
            <small>{resolved?.courierName ? `Courier ID: ${resolved.courierCompanyId ?? '—'}` : 'Courier and service name'}</small>
          </div>
        </article>
        <article>
          <span className="orders-shipment-summary-icon"><Package size={17} /></span>
          <div>
            <p>Shipment reference</p>
            <strong>{resolved?.shiprocketOrderId ? `SR-${resolved.shiprocketOrderId}` : 'Not created'}</strong>
            <small>{resolved?.shipmentId ? `Shipment ID: ${resolved.shipmentId}` : 'Shiprocket order and shipment IDs'}</small>
          </div>
        </article>
        <article>
          <span className="orders-shipment-summary-icon"><Radio size={17} /></span>
          <div>
            <p>AWB / tracking</p>
            <strong>{resolved?.awbCode || 'Not assigned'}</strong>
            <small>
              {resolved?.trackingUrl
                ? <a href={resolved.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>Track live <ExternalLink size={11} /></a>
                : 'AWB code and tracking URL'}
            </small>
          </div>
        </article>
        <article>
          <span className="orders-shipment-summary-icon"><MapPin size={17} /></span>
          <div>
            <p>Current location</p>
            <strong>{resolved?.currentLocation || ws.tracking?.currentLocation || 'Tracking unavailable'}</strong>
            <small>{resolved?.lastSyncedAt ? `Last sync: ${formatDateTime(resolved.lastSyncedAt)}` : 'Last scan and synchronization time'}</small>
          </div>
        </article>
      </div>

      {/* ETA banner */}
      {resolved?.etd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--info-muted)', marginBottom: 4 }}>
          <Calendar size={15} style={{ color: 'var(--info)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--info)' }}><strong>Estimated delivery:</strong> {formatComputedDeliveryDate(resolved.etd)}</span>
        </div>
      )}

      {/* Error banner */}
      {resolved?.lastShiprocketError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--danger-muted)', marginBottom: 4 }}>
          <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--danger)' }}><strong>Last Shiprocket error:</strong> {resolved.lastShiprocketError}</span>
        </div>
      )}

      <div className="orders-shipment-layout">
        {/* Left — fulfillment timeline */}
        <div className="orders-shipment-panel">
          <div className="orders-subsection-heading">
            <div>
              <h3>Fulfillment progress</h3>
              <p>{ws.tracking?.activities?.length ? `${ws.tracking.activities.length} live events from Shiprocket` : 'Order milestones and shipment events'}</p>
            </div>
            <IntegrationBadge state={hasBooking ? 'live' : 'webhook-pending'} />
          </div>
          <ol className="orders-shipment-timeline">
            {timelineSteps.map((step) => (
              <li key={step.key} className={`is-${step.state}`}>
                <span className="orders-timeline-marker">
                  {step.state === 'complete' ? <CheckCircle2 size={14} /> : null}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.description}</p>
                  {step.date && <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(step.date)}</small>}
                </div>
              </li>
            ))}
          </ol>
        </div>
        {/* Right — communication status + action buttons */}
        <div className="orders-shipment-panel">
          <div className="orders-subsection-heading">
            <div>
              <h3>Communication status</h3>
              <p>Customer and admin fulfillment updates.</p>
            </div>
          </div>
          <div className="orders-communication-list">
            <div>
              <span className="orders-communication-icon is-live"><Mail size={16} /></span>
              <div>
                <strong>Order confirmation</strong>
                <p>Manual resend action is available below.</p>
              </div>
              <IntegrationBadge state="live" />
            </div>
            <div>
              <span className={`orders-communication-icon${hasBooking ? ' is-live' : ''}`}><Bell size={16} /></span>
              <div>
                <strong>Admin shipment alerts</strong>
                <p>{hasBooking ? `AWB ${resolved?.awbCode || 'assigned'} — tracking active` : 'Book shipment to enable alerts'}</p>
              </div>
              <IntegrationBadge state={hasBooking ? 'live' : 'api-pending'} />
            </div>
            <div>
              <span className={`orders-communication-icon${order.orderStatus === 'delivered' || order.orderStatus === 'shipped' ? ' is-live' : ''}`}><Truck size={16} /></span>
              <div>
                <strong>Customer tracking updates</strong>
                <p>Delivery email automation requires the Shiprocket webhook integration.</p>
              </div>
              <IntegrationBadge state='webhook-pending' />
            </div>
          </div>
          {/* Action buttons — only show when order is approved and not cancelled */}
          {isApproved && !isCancelled && (
            <div style={{ marginTop: 16 }}>
              <p className="orders-eyebrow" style={{ marginBottom: 8 }}>Shiprocket actions</p>
              {resolved?.awbCode ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => void handleSchedulePickup()}
                    disabled={ws.isSchedulingPickup || isPickupScheduled}
                  >
                    {ws.isSchedulingPickup ? <Loader2 className="animate-spin" size={14} /> : <Package size={14} />}
                    {isPickupScheduled ? 'Pickup completed' : 'Schedule pickup'}
                  </button>
                  <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => void handleDownloadLabel()} disabled={ws.isDownloadingLabel}>
                    {ws.isDownloadingLabel ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                    Shipping label
                  </button>
                  <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => void handleDownloadManifest()} disabled={ws.isDownloadingManifest}>
                    {ws.isDownloadingManifest ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                    Manifest
                  </button>
                  {resolved.trackingUrl && (
                    <a href={resolved.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ExternalLink size={14} />Live tracking
                    </a>
                  )}
                  <button type="button" className="orders-delete-button" style={{ fontSize: 12 }} onClick={() => void handleCancelShipment()} disabled={ws.isCancellingShipment}>
                    {ws.isCancellingShipment ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                    Cancel shipment
                  </button>
                </div>
              ) : (
                <>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => void handleSyncShipment()}
                  disabled={ws.loading || ws.isSyncingShipment}
                >
                  {ws.isSyncingShipment ? <Loader2 className="animate-spin" size={14} /> : <Truck size={14} />}
                  {ws.isSyncingShipment ? 'Creating shipment…' : 'Create shipment & assign courier'}
                </button>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {ws.loading ? 'Fetching Shiprocket status…' : 'No AWB assigned yet. Use the button above after approving the order.'}
                </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {ws.lastFetchedAt && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
          Last synced: {formatDateTime(ws.lastFetchedAt.toISOString())}
        </p>
      )}
    </section>
  );
};

const OrderDetailModal: React.FC<{
  order: Order;
  onOrderUpdated: (order: Order) => void;
  onOrderStatusUpdated: (orderId: string, status: OrderStatus) => void;
  onDelete: () => void;
  onClose: () => void;
  onCopy: () => void;
}> = ({ order, onOrderUpdated, onOrderStatusUpdated, onDelete, onClose, onCopy }) => {
  const terminalLabel = terminalStatusLabel(order.orderStatus);
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewDialogRef = useRef<HTMLDialogElement>(null);
  const computedEstimateCacheRef = useRef<Map<string, ComputedDeliveryEstimateState> | null>(null);
  if (computedEstimateCacheRef.current === null) {
    computedEstimateCacheRef.current = new Map<string, ComputedDeliveryEstimateState>();
  }
  const computedEstimateCache = computedEstimateCacheRef.current;
  const isStatusRequestInFlightRef = useRef(false);
  const [detailState, dispatchDetail] = useReducer(
    orderDetailReducer,
    order,
    getInitialOrderDetailState
  );
  const [openDesignPreviewSide, setOpenDesignPreviewSide] = useState<'front' | 'back' | null>(null);
  const [designPreviewErrors, setDesignPreviewErrors] = useState({ front: false, back: false });
  const [frontPreviewSize, setFrontPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [fetchedCustomization, setFetchedCustomization] = useState<OrderCustomization | null>(null);
  const [isDesignPreviewLoading, setIsDesignPreviewLoading] = useState(false);
  const {
    deliveryDate,
    deliveryNote,
    deliveryError,
    deliverySuccess,
    isApproving,
    isSavingEstimate,
    isResending,
    isRefreshingStatus,
    statusRefreshError,
    isResendConfirmOpen,
    computedEstimate,
  } = detailState;
  const isAnyRequestInFlight = isApproving || isSavingEstimate || isResending;
  const hasEstimate = Boolean(order.estimatedDeliveryDate);
  const canApprove = order.orderStatus === 'placed';
  const standardPreviewImage = order.items.find((item) => item.product.image)?.product.image;
  const fetchedCustomizationForOrder =
    fetchedCustomization?._id === order.customization?._id ? fetchedCustomization : null;
  const resolvedCustomization = fetchedCustomizationForOrder
    ? {
        ...order.customization,
        ...fetchedCustomizationForOrder,
        previewImageUrl:
          order.customization?.previewImageUrl || fetchedCustomizationForOrder.previewImageUrl,
        backPreviewImageUrl:
          order.customization?.backPreviewImageUrl || fetchedCustomizationForOrder.backPreviewImageUrl,
        canvasWidth:
          order.customization?.canvasWidth || fetchedCustomizationForOrder.canvasWidth,
        canvasHeight:
          order.customization?.canvasHeight || fetchedCustomizationForOrder.canvasHeight,
        layers:
          order.customization?.layers.length
            ? order.customization.layers
            : fetchedCustomizationForOrder.layers,
        backLayers: order.customization?.backLayers?.length
          ? order.customization.backLayers
          : fetchedCustomizationForOrder.backLayers,
      }
    : order.customization;
  const frontDesignPreviewUrl = resolvedCustomization?.previewImageUrl;
  const backDesignPreviewUrl = resolvedCustomization?.backPreviewImageUrl;
  const hasFrontDesignPreview = Boolean(frontDesignPreviewUrl) && !designPreviewErrors.front;
  const hasBackDesignPreview = Boolean(backDesignPreviewUrl) && !designPreviewErrors.back;
  const activeDesignPreviewUrl =
    openDesignPreviewSide === 'front' ? frontDesignPreviewUrl : backDesignPreviewUrl;
  const hasActiveDesignPreview =
    openDesignPreviewSide === 'front' ? hasFrontDesignPreview : hasBackDesignPreview;
  const designWidth = resolvedCustomization?.canvasWidth || frontPreviewSize?.width || 0;
  const designHeight = resolvedCustomization?.canvasHeight || frontPreviewSize?.height || 0;
  const hasDesignDimensions = designWidth > 0 && designHeight > 0;

  const closeDesignPreview = () => {
    previewDialogRef.current?.close();
    setOpenDesignPreviewSide(null);
  };

  const handleDesignPreviewError = (side: 'front' | 'back') => {
    setDesignPreviewErrors((current) => ({ ...current, [side]: true }));
    closeDesignPreview();
  };

  const captureDesignPreviewSize = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setFrontPreviewSize((current) => current || { width: naturalWidth, height: naturalHeight });
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    dialogRef.current?.showModal();
    return () => {
      mountedRef.current = false;
      dialogRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const previewDialog = previewDialogRef.current;
    if (!previewDialog) return;

    if (openDesignPreviewSide && hasActiveDesignPreview && !previewDialog.open) {
      previewDialog.showModal();
    } else if ((!openDesignPreviewSide || !hasActiveDesignPreview) && previewDialog.open) {
      previewDialog.close();
    }
  }, [hasActiveDesignPreview, openDesignPreviewSide]);

  useEffect(() => {
    const customizationId = order.customization?._id;
    if (
      order.source !== 'customized' ||
      order.customization?.previewImageUrl ||
      !customizationId
    ) {
      return;
    }

    const controller = new AbortController();
    setIsDesignPreviewLoading(true);

    void apiClient
      .get(`/customization/${encodeURIComponent(customizationId)}`, {
        signal: controller.signal,
      })
      .then((response) => {
        const customization = normalizeCustomizationResponse(response.data, customizationId);
        if (!customization || controller.signal.aborted) return;

        setFetchedCustomization(customization);
        setDesignPreviewErrors({ front: false, back: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('Failed to load customization preview', error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsDesignPreviewLoading(false);
      });

    return () => controller.abort();
  }, [order.customization?._id, order.customization?.previewImageUrl, order.source]);

  const refreshOrderStatus = useCallback(async () => {
    if (isStatusRequestInFlightRef.current) return;

    isStatusRequestInFlightRef.current = true;
    dispatchDetail({ type: 'setRefreshingStatus', value: true });
    dispatchDetail({ type: 'setStatusRefreshError', value: '' });

    try {
      const result = await getOrderStatus(order._id);
      if (!mountedRef.current) return;

      if (!result.status) {
        dispatchDetail({ type: 'setStatusRefreshError', value: "Couldn't refresh status" });
        return;
      }

      if (result.status !== order.orderStatus) {
        onOrderStatusUpdated(order._id, result.status);
      }
    } catch (error: unknown) {
      console.error('Failed to refresh order status', error);
      if (mountedRef.current) {
        dispatchDetail({ type: 'setStatusRefreshError', value: "Couldn't refresh status" });
      }
    } finally {
      isStatusRequestInFlightRef.current = false;
      if (mountedRef.current) {
        dispatchDetail({ type: 'setRefreshingStatus', value: false });
      }
    }
  }, [onOrderStatusUpdated, order._id, order.orderStatus]);

  useEffect(() => {
    if (terminalOrderStatuses.has(order.orderStatus)) return;

    const intervalId = window.setInterval(() => {
      void refreshOrderStatus();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [order.orderStatus, refreshOrderStatus]);

  useEffect(() => {
    const pincode = getOrderPincode(order);

    if (!isValidPincode(pincode)) {
      dispatchDetail({
        type: 'setComputedEstimate',
        value: createComputedEstimateState('skipped', pincode),
      });
      return;
    }

    if (computedEstimateCacheRef.current === null) {
      computedEstimateCacheRef.current = new Map<string, ComputedDeliveryEstimateState>();
    }
    const computedEstimateCache = computedEstimateCacheRef.current;
    const cacheKey = `${order._id}:${pincode}`;
    const cachedEstimate = computedEstimateCache.get(cacheKey);
    if (cachedEstimate) {
      dispatchDetail({ type: 'setComputedEstimate', value: cachedEstimate });
      return;
    }

    let isCurrentRequest = true;
    dispatchDetail({
      type: 'setComputedEstimate',
      value: createComputedEstimateState('loading', pincode),
    });

    void getDeliveryEstimateForPincode(pincode)
      .then((result) => {
        if (!isCurrentRequest || !mountedRef.current) return;
        const nextState = createComputedEstimateState('success', pincode, result);
        computedEstimateCache.set(cacheKey, nextState);
        dispatchDetail({ type: 'setComputedEstimate', value: nextState });
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || !mountedRef.current) return;
        const nextState = createComputedEstimateState(
          'error',
          pincode,
          null,
          getErrorMessage(error, 'Could not load computed delivery estimate.')
        );
        computedEstimateCache.set(cacheKey, nextState);
        dispatchDetail({ type: 'setComputedEstimate', value: nextState });
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [order]);

  const handleUseComputedDate = () => {
    const computedDate = toDateInputValue(computedEstimate.result?.estimatedDate);
    if (!computedDate) return;
    dispatchDetail({ type: 'setDeliveryDate', value: computedDate });
  };

  const handleApprove = async () => {
    if (order.orderStatus === 'confirmed') {
      toast.error('This order is already confirmed');
      return;
    }

    dispatchDetail({ type: 'setApproving', value: true });
    try {
      if (!mountedRef.current) return;
      await approveOrder(order._id);
      if (mountedRef.current) {
        const updatedOrder = { ...order, orderStatus: 'confirmed' as OrderStatus };
        onOrderUpdated(updatedOrder);
        toast.success('Order approved successfully');
      }
    } catch (error: unknown) {
      if (mountedRef.current) {
        toast.error(getErrorMessage(error, 'Failed to approve order'));
      }
    } finally {
      if (mountedRef.current) dispatchDetail({ type: 'setApproving', value: false });
    }
  };

  const handleSaveEstimate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasEstimate) return;
    dispatchDetail({ type: 'setDeliveryError', value: '' });
    dispatchDetail({ type: 'setDeliverySuccess', value: '' });

    if (!deliveryDate) {
      dispatchDetail({ type: 'setDeliveryError', value: 'Estimated delivery date is required' });
      return;
    }

    if (isPastDeliveryDate(deliveryDate)) {
      dispatchDetail({ type: 'setDeliveryError', value: 'Delivery date must be in the future' });
      return;
    }

    dispatchDetail({ type: 'setSavingEstimate', value: true });
    try {
      const trimmedNote = deliveryNote.trim();
      if (!mountedRef.current) return;
      await setDeliveryEstimate(order._id, {
        estimatedDeliveryDate: deliveryDate,
        ...(trimmedNote ? { deliveryNote: trimmedNote } : {}),
      });
      if (mountedRef.current) {
        onOrderUpdated({
          ...order,
          estimatedDeliveryDate: deliveryDate,
          deliveryNote: trimmedNote || undefined,
        });
        dispatchDetail({ type: 'setDeliverySuccess', value: 'Delivery estimate saved and shared with the customer.' });
        toast.success('Delivery estimate updated');
      }
    } catch (error: unknown) {
      if (mountedRef.current) {
        toast.error(getErrorMessage(error, 'Failed to update delivery estimate'));
      }
    } finally {
      if (mountedRef.current) dispatchDetail({ type: 'setSavingEstimate', value: false });
    }
  };

  const handleResendConfirmation = async () => {
    dispatchDetail({ type: 'setResending', value: true });
    try {
      if (!mountedRef.current) return;
      await resendConfirmation(order._id);
      if (mountedRef.current) {
        dispatchDetail({ type: 'setResendConfirmOpen', value: false });
        toast.success('Confirmation email resent to customer');
      }
    } catch (error: unknown) {
      if (mountedRef.current) {
        toast.error(
          isNetworkError(error)
            ? 'Failed to resend. Check your connection and try again.'
            : getErrorMessage(error, 'Failed to resend confirmation')
        );
      }
    } finally {
      if (mountedRef.current) dispatchDetail({ type: 'setResending', value: false });
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop orders-modal-backdrop"
      aria-labelledby="order-detail-title"
      onCancel={(event) => {
        if (openDesignPreviewSide) {
          event.preventDefault();
          closeDesignPreview();
          return;
        }
        onClose();
      }}
      style={{
        border: 0,
        margin: 0,
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="modal-box modal-box-lg orders-detail-modal"
        style={{ maxWidth: 1180 }}
      >
        <div className="orders-detail-header">
          <div>
            <p className="orders-eyebrow">Order workspace</p>
            <h2 id="order-detail-title">Order details</h2>
            <button type="button" className="orders-detail-order-id" onClick={onCopy}>
              {order.orderNumber}
              <Clipboard size={13} />
            </button>
          </div>
          <div className="orders-detail-header-actions">
            <PaymentStatusBadge status={order.paymentStatus} />
            <OrderStatusBadge status={order.orderStatus} />
            <button type="button" className="action-icon-button" onClick={onClose} aria-label="Close order details">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="orders-detail-grid">
          <div style={{ display: 'grid', gap: 16 }}>
            {order.source === 'customized' ? (
              <>
                <section className="card orders-design-preview-card" aria-labelledby="front-design-preview-title">
                  <div className="orders-design-preview-heading">
                    <div>
                      <p className="orders-eyebrow">Customer artwork</p>
                      <h3 id="front-design-preview-title" className="section-title">Front Design</h3>
                    </div>
                    <span className="orders-design-side-badge">Front</span>
                  </div>

                  {isDesignPreviewLoading ? (
                    <div className="orders-design-preview-placeholder" aria-live="polite">
                      <Loader2 className="animate-spin" size={32} />
                      <span>Loading front preview...</span>
                    </div>
                  ) : hasFrontDesignPreview ? (
                    <button
                      type="button"
                      className="orders-design-preview-trigger"
                      onClick={() => setOpenDesignPreviewSide('front')}
                      aria-haspopup="dialog"
                    >
                      <img
                        src={frontDesignPreviewUrl}
                        onLoad={captureDesignPreviewSize}
                        alt={`${productLabel(order)} front design preview`}
                        referrerPolicy="no-referrer"
                        onError={() => handleDesignPreviewError('front')}
                      />
                      <span>Click image to enlarge</span>
                    </button>
                  ) : (
                    <div className="orders-design-preview-placeholder">
                      <ImageIcon size={36} />
                      <span>Front preview not available</span>
                    </div>
                  )}
                </section>

                <section className="card orders-design-preview-card" aria-labelledby="back-design-preview-title">
                  <div className="orders-design-preview-heading">
                    <div>
                      <p className="orders-eyebrow">Customer artwork</p>
                      <h3 id="back-design-preview-title" className="section-title">Back Design</h3>
                    </div>
                    <span className="orders-design-side-badge is-muted">Back</span>
                  </div>

                  {hasBackDesignPreview ? (
                    <button
                      type="button"
                      className="orders-design-preview-trigger"
                      onClick={() => setOpenDesignPreviewSide('back')}
                      aria-haspopup="dialog"
                    >
                      <img
                        src={backDesignPreviewUrl}
                        onLoad={captureDesignPreviewSize}
                        alt={`${productLabel(order)} back design preview`}
                        referrerPolicy="no-referrer"
                        onError={() => handleDesignPreviewError('back')}
                      />
                      <span>Click image to enlarge</span>
                    </button>
                  ) : (
                    <div className="orders-design-preview-placeholder is-compact">
                      <ImageIcon size={36} />
                      <span>Back preview not available</span>
                      <small>It will appear here when the backend provides a back preview image.</small>
                    </div>
                  )}
                </section>
                <PurchasedItemsSummary items={order.items} />
                <div className="detail-row">
                  <span className="form-label" style={{ margin: 0 }}>Canvas</span>
                  <span>
                    {hasDesignDimensions ? `${designWidth} × ${designHeight} px` : 'Not provided'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="form-label" style={{ margin: 0 }}>Layers</span>
                  <span>
                    {(resolvedCustomization?.layers.length || 0) +
                      (resolvedCustomization?.backLayers?.length || 0)}
                  </span>
                </div>
                <LayerList title="Front layers" layers={resolvedCustomization?.layers || []} />
                {resolvedCustomization?.backLayers?.length ? (
                  <LayerList title="Back layers" layers={resolvedCustomization.backLayers} />
                ) : null}
              </>
            ) : (
              <>
                <div
                  className="card"
                  style={{
                    background: 'var(--bg-surface)',
                    boxShadow: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: standardPreviewImage ? '100%' : undefined,
                  }}
                >
                  <p className="section-title" style={{ marginBottom: 12 }}>Order Items</p>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {order.items.length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>No order items returned.</p>
                    ) : (
                      order.items.map((item) => (
                        <div
                          key={item._id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: item.product.image ? '56px 1fr auto' : '1fr auto',
                            gap: item.product.image ? 12 : 10,
                            alignItems: 'center',
                            padding: '12px 0',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {item.product.image ? (
                            <PreviewImage src={item.product.image} alt={`${item.product.name} image`} size={56} />
                          ) : null}
                          <div>
                            <p style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontWeight: 600 }}>
                              {item.product.name}
                            </p>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>
                              Qty {item.quantity} x {formatCurrency(item.price)}
                            </p>
                          </div>
                          <strong>{formatCurrency(item.quantity * item.price)}</strong>
                        </div>
                      ))
                    )}
                  </div>
                  {standardPreviewImage ? (
                    <div className="orders-standard-preview-frame">
                      <img
                        src={standardPreviewImage}
                        alt={`${productLabel(order)} large preview`}
                        referrerPolicy="no-referrer"
                        style={{
                          width: '100%',
                          maxWidth: 380,
                          maxHeight: 420,
                          objectFit: 'contain',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                {order.timeline.length > 0 ? (
                  <div>
                    <p className="form-label">Order Timeline</p>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {order.timeline.map((entry, index) => (
                        <div
                          key={`${entry}-${index}`}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                            fontSize: 13,
                          }}
                        >
                          {entry}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <div className="detail-row">
              <div>
                <p className="form-label" style={{ marginBottom: 4 }}>Order Number</p>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontFamily: "'SFMono-Regular', Consolas, monospace",
                    overflowWrap: 'anywhere',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {order.orderNumber}
                  <button type="button" className="action-icon-button" onClick={onCopy} aria-label="Copy order number">
                    <Clipboard size={14} />
                  </button>
                </p>
              </div>
            </div>
            <InfoRow label="Placed on" value={formatDateTime(order.createdAt)} />
            <InfoRow label="Customer" value={order.customer.name} />
            <InfoRow label="Email" value={order.customer.email || 'N/A'} />
            <InfoRow label="Phone" value={order.customer.phone || order.address.phone || 'N/A'} />
            <AddressBlock order={order} />
            <InfoRow label="Product" value={productLabel(order)} />
            <DeliveryEstimateRow order={order} />
            <InfoRow
              label="Coupon"
              value={order.coupon ? `${order.coupon.code} - ${formatCurrency(order.coupon.discountValue)}` : 'N/A'}
            />
            <InfoRow label="Total paid" value={formatCurrency(order.totalAmount)} />
            <InfoRow label="Payment ID" value={order.paymentId || 'N/A'} mono={Boolean(order.paymentId)} />
            <div className="detail-row">
              <span className="form-label" style={{ margin: 0 }}>Payment Status</span>
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
            <div className="detail-row">
              <span className="form-label" style={{ margin: 0 }}>Order Status</span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <OrderStatusBadge status={order.orderStatus} />
                <button
                  type="button"
                  className="action-icon-button"
                  onClick={() => void refreshOrderStatus()}
                  disabled={isRefreshingStatus}
                  aria-label="Refresh order status"
                  title="Refresh status"
                >
                  {isRefreshingStatus ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
                {statusRefreshError ? (
                  <span
                    aria-live="polite"
                    style={{ color: 'var(--danger)', fontSize: 12 }}
                  >
                    {statusRefreshError}
                  </span>
                ) : null}
              </div>
            </div>
            <InfoRow label="Notes" value={order.notes || 'N/A'} />
          </div>
        </div>

        <ShipmentWorkspace order={order} />

        <div className="orders-actions-section">
          <div className="orders-actions-heading">
            <h3 className="section-title" style={{ margin: 0 }}>Order Actions</h3>
            {terminalLabel ? (
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                {terminalLabel}
              </span>
            ) : null}
          </div>

          <div className="orders-actions-row">
            {canApprove ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleApprove()}
                disabled={isAnyRequestInFlight}
              >
                {isApproving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Approve Order
              </button>
            ) : null}

            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => dispatchDetail({ type: 'toggleResendConfirm' })}
                disabled={isAnyRequestInFlight}
              >
                {isResending ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
                Resend Confirmation
              </button>

              {isResendConfirmOpen ? (
                <section className="orders-resend-popover" aria-label="Confirm resend confirmation">
                  <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
                    Resend order confirmation email to customer?
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => dispatchDetail({ type: 'setResendConfirmOpen', value: false })}
                      disabled={isAnyRequestInFlight}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void handleResendConfirmation()}
                      disabled={isAnyRequestInFlight}
                    >
                      {isResending ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
                      Yes, Resend
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          <ComputedDeliveryEstimatePanel
            estimate={computedEstimate}
            onUseDate={handleUseComputedDate}
            disabled={isAnyRequestInFlight || hasEstimate}
          />

          {deliverySuccess ? (
            <div className='orders-delivery-success' role='status' aria-live='polite'>
              <CheckCircle2 size={17} />
              <span>{deliverySuccess}</span>
            </div>
          ) : null}

          <form className="orders-delivery-form" onSubmit={(event) => void handleSaveEstimate(event)}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="form-label" htmlFor="estimated-delivery-date">
                Estimated Delivery Date
              </label>
              <input
                id="estimated-delivery-date"
                type="date"
                className="input-field"
                value={deliveryDate}
                onChange={(event) =>
                  dispatchDetail({ type: 'setDeliveryDate', value: event.target.value })
                }
                disabled={isAnyRequestInFlight || hasEstimate}
              />
              {deliveryError ? (
                <p style={{ margin: 0, color: 'var(--danger)', fontSize: 12 }}>
                  {deliveryError}
                </p>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label className="form-label" htmlFor="delivery-note">
                Delivery Note (optional)
              </label>
              <textarea
                id="delivery-note"
                className="input-field"
                maxLength={200}
                rows={3}
                value={deliveryNote}
                onChange={(event) =>
                  dispatchDetail({ type: 'setDeliveryNote', value: event.target.value })
                }
                disabled={isAnyRequestInFlight || hasEstimate}
                style={{ resize: 'vertical', minHeight: 88 }}
              />
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12, textAlign: 'right' }}>
                {deliveryNote.length}/200
              </p>
            </div>

            <div className="orders-delivery-submit">
              <button type="submit" className="btn-primary" disabled={isAnyRequestInFlight || hasEstimate}>
                {isSavingEstimate ? <Loader2 className="animate-spin" size={16} /> : hasEstimate ? <CheckCircle2 size={16} /> : <Calendar size={16} />}
                {hasEstimate ? 'Estimate Set' : 'Set Delivery Estimate'}
              </button>
              {hasEstimate ? <small className='orders-estimate-locked'>Delivery estimate can only be set once.</small> : null}
            </div>
          </form>
        </div>

        <div
          className="orders-detail-footer-actions"
        >
          <button type="button" className="orders-delete-button" onClick={onDelete} disabled={isAnyRequestInFlight}>
            <Trash2 size={16} />
            Delete order
          </button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={isAnyRequestInFlight}>
            Close
          </button>
        </div>

        {openDesignPreviewSide && hasActiveDesignPreview ? (
          <dialog
            ref={previewDialogRef}
            className="orders-preview-lightbox"
            aria-labelledby="design-preview-lightbox-title"
            onCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeDesignPreview();
            }}
            onClose={() => setOpenDesignPreviewSide(null)}
          >
            <button
              type="button"
              className="orders-preview-lightbox-dismiss"
              onClick={closeDesignPreview}
              aria-label="Close enlarged design preview"
            />
            <div
              className="modal-box modal-box-lg orders-preview-lightbox-box"
            >
              <div className="orders-preview-lightbox-header">
                <h3 id="design-preview-lightbox-title" className="section-title">
                  {openDesignPreviewSide === 'front' ? 'Front Design Preview' : 'Back Design Preview'}
                </h3>
                <button
                  type="button"
                  className="action-icon-button"
                  onClick={closeDesignPreview}
                  aria-label="Close enlarged design preview"
                  autoFocus
                >
                  <X size={20} />
                </button>
              </div>

              <img
                className="orders-preview-lightbox-image"
                src={activeDesignPreviewUrl}
                alt={`${productLabel(order)} enlarged ${openDesignPreviewSide} design preview`}
                referrerPolicy="no-referrer"
                onError={() => handleDesignPreviewError(openDesignPreviewSide)}
              />
            </div>
          </dialog>
        ) : null}
      </m.div>
    </dialog>
  );
};

const getServiceableBadge = (value: boolean | null) => {
  if (value === true) {
    return { className: 'badge-active', label: 'Yes' };
  }

  if (value === false) {
    return { className: 'badge-inactive', label: 'No' };
  }

  return { className: 'badge-warning', label: 'Unknown' };
};

const ComputedDeliveryEstimatePanel: React.FC<{
  estimate: ComputedDeliveryEstimateState;
  onUseDate: () => void;
  disabled: boolean;
}> = ({ estimate, onUseDate, disabled }) => {
  const computedDateInputValue = toDateInputValue(estimate.result?.estimatedDate);
  const serviceableBadge = getServiceableBadge(estimate.result?.isServiceable ?? null);

  return (
    <section
      className="card"
      aria-label="Computed delivery estimate by pincode"
      style={{
        padding: 16,
        boxShadow: 'none',
        background: 'var(--bg-surface)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            Computed Delivery Estimate
          </h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>
            By customer pincode
          </p>
        </div>

        {computedDateInputValue ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={onUseDate}
            disabled={disabled}
          >
            Use this date
          </button>
        ) : null}
      </div>

      {estimate.status === 'loading' || estimate.status === 'idle' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
          <Loader2 className="animate-spin" size={16} />
          Checking pincode estimate...
        </div>
      ) : null}

      {estimate.status === 'skipped' ? (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          No pincode available for this order
        </p>
      ) : null}

      {estimate.status === 'error' ? (
        <p style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>
          {estimate.error || 'Could not load computed delivery estimate.'}
        </p>
      ) : null}

      {estimate.status === 'success' && estimate.result ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Pincode" value={estimate.pincode || 'N/A'} />
          <InfoRow
            label="Estimated delivery"
            value={formatComputedDeliveryDate(estimate.result.estimatedDate)}
          />
          <InfoRow
            label="Estimated cost"
            value={estimate.result.cost !== null ? formatCurrency(estimate.result.cost) : 'N/A'}
          />
          <div className="detail-row">
            <span className="form-label" style={{ margin: 0 }}>Serviceable</span>
            <span className={serviceableBadge.className}>{serviceableBadge.label}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
};

const AddressBlock: React.FC<{ order: Order }> = ({ order }) => (
  <div className="detail-row">
    <div>
      <p className="form-label" style={{ marginBottom: 4 }}>Delivery address</p>
      <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.6 }}>
        {order.address.fullName || order.customer.name}
        <br />
        {order.address.addressLine1 || 'N/A'}
        <br />
        {[order.address.city, order.address.state, order.address.pincode].filter(Boolean).join(', ') || 'N/A'}
      </p>
    </div>
  </div>
);

const DeliveryEstimateRow: React.FC<{ order: Order }> = ({ order }) => {
  const formattedDate = formatDeliveryDate(order.estimatedDeliveryDate);

  return (
    <div className="detail-row">
      <div>
        <p
          className="form-label"
          style={{ marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Truck size={14} />
          Estimated Delivery
        </p>
        {formattedDate ? (
          <>
            <p style={{ margin: 0, color: 'var(--text-primary)' }}>{formattedDate}</p>
            {order.deliveryNote ? (
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
                {order.deliveryNote}
              </p>
            ) : null}
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Not set yet</p>
        )}
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="detail-row">
    <div>
      <p className="form-label" style={{ marginBottom: 4 }}>{label}</p>
      <p
        style={{
          margin: 0,
          color: 'var(--text-primary)',
          fontFamily: mono ? "'SFMono-Regular', Consolas, monospace" : undefined,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </p>
    </div>
  </div>
);

const getLayerKey = (layer: Layer) =>
  layer._id ||
  layer.id ||
  [layer.type, layer.text ?? '', layer.x ?? layer.left ?? '', layer.y ?? layer.top ?? ''].join(':');

const LayerList: React.FC<{ title: string; layers: Layer[] }> = ({ title, layers }) => (
  <div>
    <p className="form-label">{title}</p>
    <div style={{ display: 'grid', gap: 8 }}>
      {layers.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>No layers available</p>
      ) : (
        layers.map((layer) => (
          <div key={getLayerKey(layer)} className="orders-layer-card">
            <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
              {layer.type}
              {layer.text ? `: ${layer.text}` : ''}
            </span>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {getLayerPosition(layer)}
            </span>
          </div>
        ))
      )}
    </div>
  </div>
);

export default Orders;
const getDesignSidePreviewUrl = (
  source: Record<string, unknown>,
  side: 'front' | 'back'
): string => {
  const directKeys = side === 'front'
    ? ['frontPreviewImageUrl', 'frontPreviewUrl', 'frontImageUrl', 'frontPreview', 'frontImage']
    : ['backPreviewImageUrl', 'backPreviewUrl', 'backImageUrl', 'backPreview', 'backImage'];
  const directUrl = getString(source, directKeys);
  if (directUrl) return directUrl;

  const previewFromDesign = (design: unknown): string => {
    if (typeof design === 'string') return toImageUrl(design);
    if (!isRecord(design)) return '';

    const designUrl = getString(design, [
      'previewImageUrl',
      'previewUrl',
      'thumbnailUrl',
      'imageUrl',
    ]);
    if (designUrl) return designUrl;

    for (const key of ['previewImage', 'preview', 'thumbnail', 'image']) {
      const url = toImageUrl(design[key]);
      if (url) return url;
    }

    return toImageUrl(design);
  };

  const nestedKeys = side === 'front'
    ? ['front', 'frontDesign', 'frontArtwork', 'frontCustomization', 'frontCanvas', 'frontPreview', 'frontImage']
    : ['back', 'backDesign', 'backArtwork', 'backCustomization', 'backCanvas', 'backPreview', 'backImage'];
  for (const key of nestedKeys) {
    const url = previewFromDesign(source[key]);
    if (url) return url;
  }

  const design = getArray(source, ['designs']).find(
    (item) => isRecord(item) && getString(item, ['side', 'view', 'position']).toLowerCase() === side
  );
  return previewFromDesign(design);
};
