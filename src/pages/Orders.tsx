import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  Box,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  PackageCheck,
  Palette,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  X,
} from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import {
  approveOrder,
  getDeliveryEstimateForPincode,
  getOrderStatus,
  resendConfirmation,
  setDeliveryEstimate,
  type OrderStatusValue,
  type PincodeDeliveryEstimate,
} from '../services/orderService';

type OrderStatus = OrderStatusValue;

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type OrderSource = 'customized' | 'standard';
type OrderStatusFilter = 'all' | OrderStatus;
type PaymentStatusFilter = 'all' | PaymentStatus;

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
  customization?: {
    _id: string;
    previewImageUrl?: string;
    canvasWidth: number;
    canvasHeight: number;
    layers: Layer[];
    backLayers?: Layer[];
  };
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
const PAYMENT_STATUS_OPTIONS: PaymentStatusFilter[] = ['all', 'pending', 'paid', 'failed', 'refunded'];

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

const paymentStatusLabels: Record<PaymentStatusFilter, string> = {
  all: 'All',
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

const orderStatusStyles: Record<OrderStatus, { color: string; background: string }> = {
  placed: { color: 'var(--warning)', background: 'var(--warning-muted)' },
  confirmed: { color: 'var(--warning)', background: 'var(--warning-muted)' },
  processing: { color: 'var(--info)', background: 'var(--info-muted)' },
  shipped: { color: '#a855f7', background: 'rgba(168, 85, 247, 0.15)' },
  delivered: { color: 'var(--success)', background: 'var(--success-muted)' },
  cancelled: { color: 'var(--danger)', background: 'var(--danger-muted)' },
  return_requested: { color: '#d97706', background: 'rgba(217, 119, 6, 0.16)' },
  returned: { color: 'var(--text-secondary)', background: 'var(--bg-input)' },
};

const paymentStatusStyles: Record<PaymentStatus, { color: string; background: string }> = {
  pending: { color: 'var(--warning)', background: 'var(--warning-muted)' },
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

const normalizePaymentStatus = (value: unknown, source: OrderSource): PaymentStatus => {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'pending' || status === 'paid' || status === 'failed' || status === 'refunded') {
    return status;
  }
  return source === 'customized' ? 'paid' : 'pending';
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

  const effectiveSource =
    source === 'customized' || value.isCustomizedOrder === true ? 'customized' : 'standard';
  const customer = getRecord(value, 'customer');
  const user = getRecord(value, 'user');
  const product = getRecord(value, 'product');
  const customization = getRecord(value, 'customization');
  const design = getRecord(value, 'design');
  const address = getRecord(value, 'address');
  const deliveryAddress = getRecord(value, 'deliveryAddress');
  const shippingAddress = getRecord(value, 'shippingAddress');
  const coupon = getRecord(value, 'coupon');
  const appliedCoupon = getRecord(value, 'appliedCoupon');
  const customerSource = Object.keys(customer).length ? customer : user;
  const addressSource = Object.keys(address).length
    ? address
    : Object.keys(deliveryAddress).length
      ? deliveryAddress
      : shippingAddress;
  const customizationSource = Object.keys(customization).length ? customization : design;
  const couponSource = Object.keys(coupon).length ? coupon : appliedCoupon;
  const orderNumber = getString(value, ['orderNumber', 'orderId', 'customOrderId'], id);
  const items = normalizeItems(getArray(value, ['items', 'orderItems', 'products']), product);
  const frontLayers = normalizeLayers(getArray(customizationSource, ['layers', 'frontLayers', 'objects']));
  const backLayers = normalizeLayers(getArray(customizationSource, ['backLayers', 'backObjects']));
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
            _id: getString(customizationSource, ['_id', 'id']),
            previewImageUrl:
              getString(customizationSource, ['previewImageUrl', 'previewUrl', 'imageUrl']) ||
              getString(value, ['previewImageUrl']),
            canvasWidth: getNumber(customizationSource, ['canvasWidth', 'width']),
            canvasHeight: getNumber(customizationSource, ['canvasHeight', 'height']),
            layers: frontLayers,
            backLayers: backLayers.length > 0 ? backLayers : undefined,
          }
        : undefined,
    totalAmount: getNumber(value, ['totalAmount', 'amount', 'total', 'paidAmount']),
    orderStatus: normalizeOrderStatus(value.status ?? value.orderStatus),
    paymentStatus: normalizePaymentStatus(value.paymentStatus, effectiveSource),
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
  };
};

const pickOrdersArray = (payload: unknown): unknown[] => {
  const root = isRecord(payload) ? payload : {};
  const data = root.data;
  const dataRecord = isRecord(data) ? data : {};
  const candidates = [
    dataRecord.orders,
    dataRecord.items,
    dataRecord.docs,
    root.orders,
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

const fetchAllOrders = async (
  params: OrdersQueryParams
): Promise<NormalizedOrdersResponse> => {
  const standardParams: OrdersQueryParams = {
    page: params.page,
    limit: params.limit,
  };
  if (params.status) standardParams.status = params.status;
  if (params.paymentStatus) standardParams.paymentStatus = params.paymentStatus;
  if (params.search?.trim()) standardParams.search = params.search.trim();

  const response = await apiClient.get('/admin/orders', { params: standardParams });
  const normalized = normalizeOrdersResponse(response.data, 'standard', params.limit);

  return {
    ...normalized,
    orders: dedupeAndSortOrders(normalized.orders),
  };
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
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
    if (
      isRecord(error.response) &&
      isRecord(error.response.data) &&
      typeof error.response.data.message === 'string' &&
      error.response.data.message.trim()
    ) {
      return error.response.data.message;
    }
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
        <td colSpan={10}>
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
  paymentStatus: PaymentStatusFilter;
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
  | { type: 'SET_PAYMENT_STATUS'; payload: PaymentStatusFilter }
  | { type: 'SET_FROM_DATE'; payload: string }
  | { type: 'SET_TO_DATE'; payload: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_SELECTED_ORDER'; payload: Order | null | ((previous: Order | null) => Order | null) }
  | { type: 'UPDATE_ORDER'; payload: Order }
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
  paymentStatus: 'all',
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
    case 'SET_PAYMENT_STATUS':
      return { ...state, paymentStatus: action.payload, page: 1 };
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
        paymentStatus: 'all',
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
  const [state, dispatch] = useReducer(ordersReducer, ordersInitialState);
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
    paymentStatus,
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
    async (showRefresh = false) => {
      dispatch({ type: 'START_LOADING', payload: { showRefresh } });

      try {
        const response = await fetchAllOrders({
          page,
          limit: ORDERS_PER_PAGE,
          status: orderStatus === 'all' ? undefined : orderStatus,
          paymentStatus: paymentStatus === 'all' ? undefined : paymentStatus,
          search: debouncedSearch || undefined,
        });
        const dateFiltered = response.orders.filter((order) => matchesDateRange(order, fromDate, toDate));
        dispatch({
          type: 'SET_DATA',
          payload: {
            orders: dateFiltered,
            totalCount: response.total,
            totalPages: response.totalPages,
          },
        });
      } catch (requestError: unknown) {
        console.error('Failed to load orders', requestError);
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
    [debouncedSearch, fromDate, orderStatus, page, paymentStatus, toDate]
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    dispatch({ type: 'SET_PAGE', payload: 1 });
  }, [debouncedSearch, fromDate, orderStatus, paymentStatus, toDate]);

  useEffect(() => {
    if (!selectedOrder) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch({ type: 'SET_SELECTED_ORDER', payload: null });
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [selectedOrder]);

  const stats = useMemo(() => {
    const totalRevenue = orders
      .filter((order) => order.paymentStatus === 'paid')
      .reduce((sum, order) => sum + order.totalAmount, 0);
    const pendingOrders = orders.filter((order) =>
      ['placed', 'confirmed', 'processing'].includes(order.orderStatus)
    ).length;
    const completedOrders = orders.filter((order) => order.orderStatus === 'delivered').length;
    const failedPayments = orders.filter((order) => order.paymentStatus === 'failed').length;

    return [
      {
        label: 'Total Orders',
        value: totalCount,
        icon: ShoppingBag,
        color: 'var(--accent)',
        background: 'var(--accent-muted)',
      },
      {
        label: 'Total Revenue',
        value: formatCurrency(totalRevenue),
        icon: FileText,
        color: 'var(--info)',
        background: 'var(--info-muted)',
      },
      {
        label: 'Pending Orders',
        value: pendingOrders,
        icon: AlertTriangle,
        color: 'var(--warning)',
        background: 'var(--warning-muted)',
      },
      {
        label: 'Completed Orders',
        value: completedOrders,
        icon: CheckCircle2,
        color: 'var(--success)',
        background: 'var(--success-muted)',
      },
      {
        label: 'Failed Payments',
        value: failedPayments,
        icon: ArchiveRestore,
        color: 'var(--danger)',
        background: 'var(--danger-muted)',
      },
    ];
  }, [orders, totalCount]);

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * ORDERS_PER_PAGE + 1;
  const rangeEnd = Math.min(page * ORDERS_PER_PAGE, totalCount);

  const clearFilters = () => {
    dispatch({ type: 'CLEAR_FILTERS' });
  };

  const handleOrderUpdated = useCallback(
    (updatedOrder: Order) => {
      dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });
      void loadOrders(true);
    },
    [loadOrders]
  );

  const handleOrderStatusUpdated = useCallback((orderId: string, status: OrderStatus) => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId, status } });
  }, []);

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
        <div className="toolbar-row" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <h1 className="page-title">Orders</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
              All standard and customized InkArt orders
            </p>
          </div>

          <div className="orders-toolbar-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
        </div>

        <div className="orders-stat-grid">
          {isLoading
            ? Array.from({ length: 5 }).map((_, index) => <StatSkeleton key={index} />)
            : stats.map((stat) => (
                <div
                  key={stat.label}
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
                </div>
              ))}
        </div>

        <div className="card" style={{ display: 'grid', gap: 14 }}>
          <div
            className="orders-filter-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 2fr) repeat(4, minmax(140px, 1fr)) auto',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <div>
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

            <div>
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

            <div>
              <label className="form-label" htmlFor="orders-payment-filter">Payment Status</label>
              <select
                id="orders-payment-filter"
                className="input-field"
                value={paymentStatus}
                onChange={(event) => {
                  dispatch({
                    type: 'SET_PAYMENT_STATUS',
                    payload: event.target.value as PaymentStatusFilter,
                  });
                }}
              >
                {PAYMENT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {paymentStatusLabels[status]}
                  </option>
                ))}
              </select>
            </div>

            <div>
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

            <div>
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

            <button type="button" className="btn-ghost" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>

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
                      <th>Order ID</th>
                      <th>Type</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Design Preview</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Order Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <TableSkeleton />
                    ) : orders.length === 0 ? (
                      <tr>
                        <td colSpan={10}>
                          <EmptyState />
                        </td>
                      </tr>
                    ) : (
                      orders.map((order) => (
                        <tr key={`${order.source}-${order._id}`} className="group">
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span
                                title={order.orderNumber}
                                className="orders-id-text"
                                style={{ fontFamily: "'SFMono-Regular', Consolas, monospace" }}
                              >
                                {shortOrderId(order)}
                              </span>
                              <button
                                type="button"
                                className="action-icon-button opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                                aria-label="Copy order number"
                                onClick={() => void copyText(order.orderNumber)}
                              >
                                <Clipboard size={14} />
                              </button>
                            </div>
                          </td>
                          <td>
                            <OrderTypeBadge source={order.source} />
                          </td>
                          <td>
                            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                              <span style={{ fontWeight: 600 }}>{order.customer.name}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                {order.customer.email || 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{productLabel(order)}</td>
                          <td>
                            {order.source === 'customized' ? (
                              <PreviewImage
                                src={order.customization?.previewImageUrl}
                                alt={`${productLabel(order)} preview`}
                              />
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {formatDateTime(order.createdAt)}
                          </td>
                          <td style={{ fontWeight: 700 }}>{formatCurrency(order.totalAmount)}</td>
                          <td>
                            <PaymentStatusBadge status={order.paymentStatus} />
                          </td>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <OrderStatusBadge status={order.orderStatus} />
                              {order.estimatedDeliveryDate ? (
                                <span title={`Delivery estimate: ${formatDeliveryDate(order.estimatedDeliveryDate)}`}>
                                  <Calendar
                                    size={16}
                                    aria-label="Delivery estimate set"
                                    style={{ color: 'var(--text-muted)' }}
                                  />
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => dispatch({ type: 'SET_SELECTED_ORDER', payload: order })}
                            >
                              <Eye size={15} />
                              View Details
                            </button>
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
                    <div key={`${order.source}-${order._id}`} className="card" style={{ display: 'grid', gap: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span
                          style={{
                            fontFamily: "'SFMono-Regular', Consolas, monospace",
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                          }}
                        >
                          {shortOrderId(order)}
                        </span>
                        <OrderStatusBadge status={order.orderStatus} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <OrderTypeBadge source={order.source} />
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </div>
                      <div>
                        <p style={{ margin: '0 0 2px', fontWeight: 600 }}>{order.customer.name}</p>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                          {order.customer.email || 'N/A'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {order.source === 'customized' ? (
                          <PreviewImage src={order.customization?.previewImageUrl} alt={`${productLabel(order)} preview`} />
                        ) : (
                          <div className="orders-mobile-product-placeholder">
                            <Box size={18} />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>
                            {productLabel(order)}
                          </p>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          color: 'var(--text-secondary)',
                          fontSize: 13,
                        }}
                      >
                        <span>{formatDateTime(order.createdAt)}</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(order.totalAmount)}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => dispatch({ type: 'SET_SELECTED_ORDER', payload: order })}
                      >
                        <Eye size={15} />
                        View Details
                      </button>
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
          {selectedOrder ? (
            <OrderDetailModal
              key={selectedOrder._id}
              order={selectedOrder}
              onOrderUpdated={handleOrderUpdated}
              onOrderStatusUpdated={handleOrderStatusUpdated}
              onClose={() => dispatch({ type: 'SET_SELECTED_ORDER', payload: null })}
              onCopy={() => void copyText(selectedOrder.orderNumber)}
            />
          ) : null}
        </AnimatePresence>
      </LazyMotion>
    </div>
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

type OrderDetailState = {
  deliveryDate: string;
  deliveryNote: string;
  deliveryError: string;
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

const OrderDetailModal: React.FC<{
  order: Order;
  onOrderUpdated: (order: Order) => void;
  onOrderStatusUpdated: (orderId: string, status: OrderStatus) => void;
  onClose: () => void;
  onCopy: () => void;
}> = ({ order, onOrderUpdated, onOrderStatusUpdated, onClose, onCopy }) => {
  const terminalLabel = terminalStatusLabel(order.orderStatus);
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const computedEstimateCacheRef = useRef(new Map<string, ComputedDeliveryEstimateState>());
  const isStatusRequestInFlightRef = useRef(false);
  const [detailState, dispatchDetail] = useReducer(
    orderDetailReducer,
    order,
    getInitialOrderDetailState
  );
  const {
    deliveryDate,
    deliveryNote,
    deliveryError,
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

  useEffect(() => {
    mountedRef.current = true;
    dialogRef.current?.showModal();
    return () => {
      mountedRef.current = false;
      dialogRef.current?.close();
    };
  }, []);

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

    const cacheKey = `${order._id}:${pincode}`;
    const cachedEstimate = computedEstimateCacheRef.current.get(cacheKey);
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
        computedEstimateCacheRef.current.set(cacheKey, nextState);
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
        computedEstimateCacheRef.current.set(cacheKey, nextState);
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
    dispatchDetail({ type: 'setDeliveryError', value: '' });

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
      onCancel={onClose}
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
        style={{ maxWidth: 980 }}
        onMouseDown={(event) => event.stopPropagation()}
        aria-labelledby="order-detail-title"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 22,
          }}
        >
          <h2 id="order-detail-title" style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
            Order details
          </h2>
          <button type="button" className="action-icon-button" onClick={onClose} aria-label="Close order details">
            <X size={20} />
          </button>
        </div>

        <div className="orders-detail-grid">
          <div style={{ display: 'grid', gap: 16 }}>
            {order.source === 'customized' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <PreviewImage
                    src={order.customization?.previewImageUrl}
                    alt={`${productLabel(order)} full preview`}
                    size={300}
                  />
                </div>
                <div className="detail-row">
                  <span className="form-label" style={{ margin: 0 }}>Canvas</span>
                  <span>
                    {order.customization?.canvasWidth || 0} x {order.customization?.canvasHeight || 0}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="form-label" style={{ margin: 0 }}>Layers</span>
                  <span>{(order.customization?.layers.length || 0) + (order.customization?.backLayers?.length || 0)}</span>
                </div>
                <LayerList title="Front layers" layers={order.customization?.layers || []} />
                {order.customization?.backLayers?.length ? (
                  <LayerList title="Back layers" layers={order.customization.backLayers} />
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
            disabled={isAnyRequestInFlight}
          />

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
                disabled={isAnyRequestInFlight}
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
                disabled={isAnyRequestInFlight}
                style={{ resize: 'vertical', minHeight: 88 }}
              />
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12, textAlign: 'right' }}>
                {deliveryNote.length}/200
              </p>
            </div>

            <div className="orders-delivery-submit">
              <button type="submit" className="btn-primary" disabled={isAnyRequestInFlight}>
                {isSavingEstimate ? <Loader2 className="animate-spin" size={16} /> : <Calendar size={16} />}
                {hasEstimate ? 'Update Estimate' : 'Set Delivery Estimate'}
              </button>
            </div>
          </form>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 18,
          }}
        >
          <button type="button" className="btn-ghost" onClick={onClose} disabled={isAnyRequestInFlight}>
            Close
          </button>
        </div>
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

const LayerList: React.FC<{ title: string; layers: Layer[] }> = ({ title, layers }) => (
  <div>
    <p className="form-label">{title}</p>
    <div style={{ display: 'grid', gap: 8 }}>
      {layers.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>No layers available</p>
      ) : (
        layers.map((layer, index) => (
          <div key={layer._id || layer.id || `${layer.type}-${index}`} className="orders-layer-card">
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
