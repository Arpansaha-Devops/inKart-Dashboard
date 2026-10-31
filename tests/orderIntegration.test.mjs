import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeOrderItemOptions, normalizeSelectedOptions, reportedPackage, reportedShippingCharge } from '../src/lib/orderPresentation.ts';
import OrderParcelDetails, { CourierQuoteOptions } from '../src/components/OrderParcelDetails.tsx';
import { approveOrder, syncShipment, getShipmentDetails, getShiprocketTracking, getShipmentLabel, getShipmentManifest, schedulePickup, cancelShipment, getCourierQuotes } from '../src/services/orderService.ts';
import { calls, mockApi } from './mockApiClient.mjs';
import { courierQuotesResponse } from './fixtures/courierQuotes.mjs';

test('renders the backend delivery charge including zero without calculating a fee', () => {
  assert.equal(reportedShippingCharge(99), 99); assert.equal(reportedShippingCharge(0), 0);
  for (const invalid of [undefined, null, '', Infinity, -1, {}]) assert.equal(reportedShippingCharge(invalid), undefined);
});
test('selectedOptions arrays display stable keys and values, preserving existing map responses', () => {
  assert.deepEqual(normalizeSelectedOptions([{ key: 'printingSides', value: 'double' }, { key: 'menuSize', value: 'a4' }]), { printingSides: 'double', menuSize: 'a4' });
  assert.deepEqual(normalizeSelectedOptions({ size: '3x6', count: 8, finish: true }), { size: '3x6', count: '8', finish: 'Yes' });
});

test('documented selections take priority over empty legacy options without losing legacy support', () => {
  const selectedOptions = [{ key: 'printingSides', value: 'double' }, { key: 'customFinish', value: 'custom' }];
  assert.deepEqual(normalizeOrderItemOptions({ options: {}, selectedOptions }), { printingSides: 'double', customFinish: 'custom' });
  assert.deepEqual(normalizeOrderItemOptions({ options: { size: 'legacy' }, selectedOptions: [] }), { size: 'legacy' });
});
test('order measurements are editable, persisted values prepopulate, and no API runs before user action', () => {
  const value = { weight: .25, length: 10, breadth: 5, height: 2 };
  assert.deepEqual(reportedPackage(value), value); assert.equal(reportedPackage({ ...value, weight: 0 }), undefined);
  for (const parcel of [undefined, value]) {
    const html = renderToStaticMarkup(React.createElement(OrderParcelDetails, { orderId: 'order-1', value: parcel, paymentStatus: 'paid', orderStatus: 'placed' }));
    assert.doesNotMatch(html, /fieldset[^>]*disabled/); assert.match(html, /button[^>]*disabled/);
    assert.doesNotMatch(html, /Backend integration pending/);
    assert.match(html, parcel ? /Measurements saved/ : /Measurements have not been saved/);
    if (parcel) assert.match(html, /value="0.25"/);
    assert.match(html, /Available courier services/); assert.match(html, /Confirm courier &amp; approve order/);
    assert.doesNotMatch(html, /localStorage/);
  }
  assert.equal(calls.length, 0);
});

test('terminal, already booked and unpaid orders have read-only parcel controls', () => {
  for (const [paymentStatus, orderStatus] of [['paid', 'shipped'], ['paid', 'delivered'], ['paid', 'cancelled'], ['paid', 'return_requested'], ['paid', 'returned'], ['pending', 'placed']]) {
    const html = renderToStaticMarkup(React.createElement(OrderParcelDetails, { orderId: 'old-order', paymentStatus, orderStatus }));
    assert.match(html, /fieldset[^>]*disabled/);
  }
  const booked = renderToStaticMarkup(React.createElement(OrderParcelDetails, { orderId: 'booked', paymentStatus: 'paid', orderStatus: 'confirmed', hasShipment: true }));
  assert.match(booked, /fieldset[^>]*disabled/);
  assert.match(booked, /A shipment is already booked/);
});

test('courier services show returned prices, service names, estimates and selection', () => {
  const returned = [
    { id: 'service-1', courierName: 'Courier fixture A', serviceName: 'Surface', deliveryCharge: 72.5, estimatedDelivery: '3–5 days' },
    { id: 'service-2', courierName: 'Courier fixture B', serviceName: 'Express', deliveryCharge: 119 },
  ];
  const couriers = returned.map((courier) => ({ courierId: courier.id, courierName: courier.courierName, serviceType: courier.serviceName, rate: courier.deliveryCharge, estimatedDays: courier.estimatedDelivery }));
  const html = renderToStaticMarkup(React.createElement(CourierQuoteOptions, { couriers, selectedCourier: couriers[1], onSelect() {} }));
  assert.match(html, /Courier fixture A/); assert.match(html, /Surface/); assert.match(html, /72.50/);
  assert.match(html, /Express/); assert.match(html, /119.00/); assert.match(html, /3–5 days/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.doesNotMatch(html, /type="radio"/);
});
test('legacy approval and shipment services retain their existing routes and payloads', async () => {
  mockApi(() => ({ data: { data: { awbCode: 'test-awb', labelUrl: 'https://example.test/label', manifestUrl: 'https://example.test/manifest' } } }));
  await approveOrder('order-id'); assert.equal(calls[0].method, 'patch'); assert.deepEqual(calls[0].args, ['/admin/orders/order-id/approve']);
  const shipment = await syncShipment('order-id'); assert.equal(shipment.awbCode, 'test-awb');
  assert.deepEqual(calls[1].args, ['/shipments/order-id/sync-shipment', { approveOrder: true }]);
  await getShipmentDetails('order-id'); await getShiprocketTracking('order-id'); await getShipmentLabel('order-id'); await getShipmentManifest('order-id'); await schedulePickup('order-id'); await cancelShipment('order-id');
  assert.deepEqual(calls.slice(2).map((call) => call.args[0]), ['/shipments/order-id/shipmentDetails', '/shipments/order-id/track', '/shipments/order-id/label', '/shipments/order-id/manifest', '/shipments/order-id/pickup', '/shipments/order-id/cancel-shipment']);
});

test('backend serviceability response renders four partner cards, INR prices and logos without inventing delivery dates', async () => {
  mockApi(() => ({ data: courierQuotesResponse }));
  const couriers = await getCourierQuotes('order', { weight: 1.5, length: 20, breadth: 15, height: 10 });
  const html = renderToStaticMarkup(React.createElement(CourierQuoteOptions, { couriers, selectedCourier: couriers[2], onSelect() {} }));
  for (const option of courierQuotesResponse.data.deliveryServiceability.courierOptions) assert.ok(html.includes(option.courierName));
  for (const price of ['175.72', '264.84', '116.72', '140.72']) assert.ok(html.includes(`₹${price}`));
  for (const asset of ['delhivery.png', 'blue-dart.jpg', 'amazon-shipping.svg']) assert.ok(html.includes(`/couriers/${asset}`));
  assert.equal((html.match(/Delivery estimate not provided/g) || []).length, 4);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.doesNotMatch(html, /null days|264\.84000000000003|Service type not provided/);
  const unknown = renderToStaticMarkup(React.createElement(CourierQuoteOptions, { couriers: [{ courierId: 'new', courierName: 'New courier', rate: 99 }], selectedCourier: null, onSelect() {} }));
  assert.match(unknown, /lucide-truck/);
  assert.doesNotMatch(unknown, /<img/);
});
