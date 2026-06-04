import apiClient from '../lib/apiClient';

export interface DeliveryEstimatePayload {
  estimatedDeliveryDate: string;
  deliveryNote?: string;
}

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
