import type { PackageDetails } from '../types';
import { packageKeys, validatePackage, type PackageDraft } from './productConfiguration';
import { reportedPackage } from './orderPresentation';

// Frontend integration models only. No backend route/response contract has been
// supplied for saving parcels, fetching order rates or approving a chosen courier.
export interface OrderCourierQuote {
  id: string;
  courierName: string;
  serviceName: string;
  deliveryCharge: number;
  estimatedDelivery?: string;
}

export interface OrderCourierQuotes {
  orderId: string;
  quoteId: string;
  packageDetails: PackageDetails;
  currency: 'INR';
  expiresAt: string;
  couriers: OrderCourierQuote[];
}

export interface CourierApprovalSelection {
  quoteId: string;
  courierId: string;
  packageDetails: PackageDetails;
}

export interface OrderFulfillmentAdapter {
  // Must resolve only after persistence has been verified by a backend read.
  saveParcel: (orderId: string, parcel: PackageDetails) => Promise<PackageDetails>;
  getCourierQuotes: (orderId: string, parcel: PackageDetails) => Promise<OrderCourierQuotes>;
  // Backend must atomically validate quote, parcel, courier and order state.
  approveWithCourier: (orderId: string, selection: CourierApprovalSelection) => Promise<void>;
}

export const sameParcel = (left: PackageDetails, right: PackageDetails) =>
  packageKeys.every((key) => left[key] === right[key]);

export function parcelFromDraft(draft: PackageDraft): PackageDetails {
  const error = validatePackage(draft, true);
  if (error) throw new Error(error);
  return Object.fromEntries(packageKeys.map((key) => [key, Number(draft[key])])) as unknown as PackageDetails;
}

export const canPrepareOrderShipment = (paymentStatus: string, orderStatus: string) =>
  paymentStatus === 'paid' && orderStatus === 'placed';

export function validateCourierQuotes(value: OrderCourierQuotes, parcel: PackageDetails, now = Date.now(), orderId?: string): string | null {
  if (typeof value?.orderId !== 'string' || !value.orderId.trim() || (orderId && value.orderId !== orderId)) return 'The courier quote does not belong to this order. Request fresh quotes.';
  const savedParcel = reportedPackage(value?.packageDetails);
  if (!savedParcel || !sameParcel(savedParcel, parcel)) return 'The courier quote does not match this parcel. Save the measurements and request new quotes.';
  if (typeof value.quoteId !== 'string' || !value.quoteId.trim() || value.currency !== 'INR') return 'The courier quote response is incomplete.';
  const expiry = typeof value.expiresAt === 'string' ? Date.parse(value.expiresAt) : NaN;
  if (!Number.isFinite(expiry) || expiry <= now) return 'The courier quotes have expired. Request fresh quotes.';
  if (!Array.isArray(value.couriers)) return 'The available courier services could not be read.';
  const ids = new Set<string>();
  for (const courier of value.couriers) {
    if (!courier || typeof courier.id !== 'string' || !courier.id.trim() || ids.has(courier.id) ||
      typeof courier.courierName !== 'string' || !courier.courierName.trim() ||
      typeof courier.serviceName !== 'string' || !courier.serviceName.trim() ||
      typeof courier.deliveryCharge !== 'number' || !Number.isFinite(courier.deliveryCharge) || courier.deliveryCharge < 0 ||
      (courier.estimatedDelivery !== undefined && typeof courier.estimatedDelivery !== 'string')) {
      return 'A courier service is missing valid pricing or identification. Request fresh quotes.';
    }
    ids.add(courier.id);
  }
  return null;
}

export async function saveParcelAndLoadQuotes(adapter: OrderFulfillmentAdapter, orderId: string, parcel: PackageDetails, onSaved?: (value: PackageDetails) => void) {
  const saved = reportedPackage(await adapter.saveParcel(orderId, parcel));
  if (!saved || !sameParcel(saved, parcel)) throw new Error('The saved parcel measurements could not be verified. Courier rates were not requested.');
  onSaved?.(saved);
  const quotes = await adapter.getCourierQuotes(orderId, saved);
  const error = validateCourierQuotes(quotes, saved, Date.now(), orderId);
  if (error) throw new Error(error);
  return quotes;
}

export function courierApprovalSelection(quotes: OrderCourierQuotes, courierId: string, draft: PackageDraft, now = Date.now(), orderId?: string): CourierApprovalSelection {
  const parcel = parcelFromDraft(draft);
  const error = validateCourierQuotes(quotes, parcel, now, orderId);
  if (error) throw new Error(error);
  if (!quotes.couriers.some((courier) => courier.id === courierId)) throw new Error('Select an available courier service before approving.');
  return { quoteId: quotes.quoteId, courierId, packageDetails: parcel };
}
