import type { CourierOption, PackageDetails } from '../types';
import { packageKeys, type PackageDraft } from './productConfiguration';
import { reportedPackage } from './orderPresentation';
import { approveOrder, confirmCourier } from '../services/orderService';

export type ParcelErrors = Partial<Record<keyof PackageDetails, string>>;

export function parcelErrors(draft: PackageDraft): ParcelErrors {
  const errors: ParcelErrors = {};
  for (const key of packageKeys) {
    const label = key[0].toUpperCase() + key.slice(1);
    const value = Number(draft[key]);
    if (!draft[key].trim()) errors[key] = `${label} is required`;
    else if (!Number.isFinite(value) || value <= 0) errors[key] = `${label} must be greater than 0`;
    else if (key === 'weight') {
      if (value < .1) errors.weight = 'Minimum weight is 0.1 kg';
      else if (value > 999.99) errors.weight = 'Maximum weight is 999.99 kg';
      else if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) errors.weight = 'Weight can have at most 2 decimal places';
    }
  }
  return errors;
}

export function parcelFromDraft(draft: PackageDraft): PackageDetails {
  const errors = parcelErrors(draft);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return Object.fromEntries(packageKeys.map((key) => [key, Number(draft[key])])) as unknown as PackageDetails;
}

export const sameParcel = (left: PackageDetails, right: PackageDetails) =>
  packageKeys.every((key) => left[key] === right[key]);

// Orders approved through the existing flow can still need their first shipment.
export const canPrepareOrderShipment = (paymentStatus: string, orderStatus: string, hasShipment = false) =>
  paymentStatus === 'paid' && ['placed', 'confirmed', 'processing'].includes(orderStatus) && !hasShipment;

export function reportedOrderParcel(order: Record<string, unknown>): PackageDetails | undefined {
  const flat = { weight: order.parcelWeight, length: order.parcelLength, breadth: order.parcelBreadth, height: order.parcelHeight };
  for (const value of [order.packageDetails, order.parcel, order.parcelDetails, flat]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const numbers = Object.fromEntries(packageKeys.map((key) => [key,
      typeof record[key] === 'string' && record[key].trim() ? Number(record[key]) : record[key],
    ]));
    const parcel = reportedPackage(numbers);
    if (parcel) return parcel;
  }
  return undefined;
}

export const courierDeliveryEstimate = (courier: CourierOption) => {
  if (courier.estimatedDays === undefined) return 'Delivery estimate not provided';
  const text = String(courier.estimatedDays);
  return /day/i.test(text) ? text : `${text} days`;
};

// A booked shipment must never be repeated because the separate approval failed.
// Already approved orders only need courier confirmation, without another email.
export async function confirmCourierAndApprove(orderId: string, courierId: string | number, approve = true) {
  const shipment = await confirmCourier(orderId, courierId);
  if (!approve) return { shipment, approvalFailed: false };
  try {
    await approveOrder(orderId);
    return { shipment, approvalFailed: false };
  } catch {
    return { shipment, approvalFailed: true };
  }
}
