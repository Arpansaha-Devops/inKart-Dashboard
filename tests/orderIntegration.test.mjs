import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeSelectedOptions, reportedPackage, reportedShippingCharge } from '../src/lib/orderPresentation.ts';
import OrderParcelDetails, { CourierQuoteOptions } from '../src/components/OrderParcelDetails.tsx';
import { approveOrder, syncShipment, getShipmentDetails, getShiprocketTracking, getShipmentLabel, getShipmentManifest, schedulePickup, cancelShipment } from '../src/services/orderService.ts';
import { calls, mockApi } from './mockApiClient.mjs';

test('renders the backend delivery charge including zero without calculating a fee', () => {
  assert.equal(reportedShippingCharge(99), 99); assert.equal(reportedShippingCharge(0), 0);
  for (const invalid of [undefined, null, '', Infinity, -1, {}]) assert.equal(reportedShippingCharge(invalid), undefined);
});
test('selectedOptions arrays display stable keys and values, preserving existing map responses', () => {
  assert.deepEqual(normalizeSelectedOptions([{ key: 'printingSides', value: 'double' }, { key: 'menuSize', value: 'a4' }]), { printingSides: 'double', menuSize: 'a4' });
  assert.deepEqual(normalizeSelectedOptions({ size: '3x6', count: 8, finish: true }), { size: '3x6', count: '8', finish: 'Yes' });
});
test('pending backend permits order measurements without pretending to save, quote or approve', () => {
  const value = { weight: .25, length: 10, breadth: 5, height: 2 };
  assert.deepEqual(reportedPackage(value), value); assert.equal(reportedPackage({ ...value, weight: 0 }), undefined);
  for (const parcel of [undefined, value]) {
    const html = renderToStaticMarkup(React.createElement(OrderParcelDetails, { orderId: 'order-1', value: parcel, paymentStatus: 'paid', orderStatus: 'placed' }));
    assert.doesNotMatch(html, /fieldset[^>]*disabled/); assert.match(html, /button[^>]*disabled/);
    assert.match(html, /Backend integration pending/); assert.match(html, /Entries remain unsaved/);
    assert.match(html, /Available courier services/); assert.match(html, /Confirm courier &amp; approve order/);
    assert.doesNotMatch(html, /localStorage/);
  }
  assert.equal(calls.length, 0);
});

test('approved, terminal and unpaid orders have read-only parcel controls', () => {
  for (const [paymentStatus, orderStatus] of [['paid', 'confirmed'], ['paid', 'shipped'], ['paid', 'delivered'], ['paid', 'cancelled'], ['paid', 'returned'], ['pending', 'placed']]) {
    const html = renderToStaticMarkup(React.createElement(OrderParcelDetails, { orderId: 'old-order', paymentStatus, orderStatus }));
    assert.match(html, /fieldset[^>]*disabled/);
  }
});

test('courier services show returned prices, service names, estimates and selection', () => {
  const quotes = { orderId: 'order-1', quoteId: 'quote-1', packageDetails: { weight: .5, length: 20, breadth: 15, height: 5 }, currency: 'INR', expiresAt: new Date(Date.now() + 60000).toISOString(), couriers: [
    { id: 'service-1', courierName: 'Courier fixture A', serviceName: 'Surface', deliveryCharge: 72.5, estimatedDelivery: '3–5 days' },
    { id: 'service-2', courierName: 'Courier fixture B', serviceName: 'Express', deliveryCharge: 119 },
  ] };
  const html = renderToStaticMarkup(React.createElement(CourierQuoteOptions, { quotes, selectedId: 'service-2', onSelect() {} }));
  assert.match(html, /Courier fixture A/); assert.match(html, /Surface/); assert.match(html, /72.50/);
  assert.match(html, /Express/); assert.match(html, /119.00/); assert.match(html, /3–5 days/);
  assert.match(html, /checked="" value="service-2"/);
});
test('legacy approval and shipment services retain their existing routes and payloads', async () => {
  mockApi(() => ({ data: { data: { awbCode: 'test-awb', labelUrl: 'https://example.test/label', manifestUrl: 'https://example.test/manifest' } } }));
  await approveOrder('order-id'); assert.equal(calls[0].method, 'patch'); assert.deepEqual(calls[0].args, ['/admin/orders/order-id/approve']);
  const shipment = await syncShipment('order-id'); assert.equal(shipment.awbCode, 'test-awb');
  assert.deepEqual(calls[1].args, ['/shipments/order-id/sync-shipment', { approveOrder: true }]);
  await getShipmentDetails('order-id'); await getShiprocketTracking('order-id'); await getShipmentLabel('order-id'); await getShipmentManifest('order-id'); await schedulePickup('order-id'); await cancelShipment('order-id');
  assert.deepEqual(calls.slice(2).map((call) => call.args[0]), ['/shipments/order-id/shipmentDetails', '/shipments/order-id/track', '/shipments/order-id/label', '/shipments/order-id/manifest', '/shipments/order-id/pickup', '/shipments/order-id/cancel-shipment']);
});
