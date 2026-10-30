import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPrepareOrderShipment, confirmCourierAndApprove, parcelErrors, parcelFromDraft, reportedOrderParcel } from '../src/lib/orderFulfillment.ts';
import { getCourierQuotes, confirmCourier, approveOrder } from '../src/services/orderService.ts';
import { calls, mockApi } from './mockApiClient.mjs';

const parcel = { weight: .5, length: 20.5, breadth: 15, height: 5 };
const draft = () => ({ weight: '.5', length: '20.5', breadth: '15', height: '5' });
const courier = (courierId = 42) => ({ courierId, courierName: 'API courier', serviceType: 'Surface', estimatedDays: '3–5', rate: 72.5 });

test('parcel validation preserves decimal dimensions and enforces weight boundaries without rounding', () => {
  assert.deepEqual(parcelFromDraft(draft()), parcel);
  for (const weight of ['', '0', '-1', 'NaN', 'Infinity', '.09', '.123', '1000']) assert.throws(() => parcelFromDraft({ ...draft(), weight }));
  for (const weight of ['.1', '1.10', '999.99']) assert.deepEqual(parcelErrors({ ...draft(), weight }), {});
  assert.equal(parcelErrors({ ...draft(), weight: '' }).weight, 'Weight is required');
  assert.equal(parcelErrors({ ...draft(), weight: '0' }).weight, 'Weight must be greater than 0');
  assert.equal(parcelErrors({ ...draft(), weight: '.05' }).weight, 'Minimum weight is 0.1 kg');
  for (const key of ['length', 'breadth', 'height']) assert.ok(parcelErrors({ ...draft(), [key]: '0' })[key]);
});

test('only paid, unbooked, non-terminal orders may request their first shipment', () => {
  for (const status of ['placed', 'confirmed', 'processing']) {
    assert.equal(canPrepareOrderShipment('paid', status), true);
    assert.equal(canPrepareOrderShipment('paid', status, true), false);
  }
  for (const status of ['shipped', 'delivered', 'cancelled', 'return_requested', 'returned']) assert.equal(canPrepareOrderShipment('paid', status), false);
  assert.equal(canPrepareOrderShipment('pending', 'placed'), false);
});

test('existing parcels are read per order without inventing defaults', () => {
  for (const key of ['packageDetails', 'parcel', 'parcelDetails']) assert.deepEqual(reportedOrderParcel({ [key]: parcel }), parcel);
  assert.deepEqual(reportedOrderParcel({ parcelWeight: '.5', parcelLength: 20.5, parcelBreadth: 15, parcelHeight: 5 }), parcel);
  assert.equal(reportedOrderParcel({ parcel: { ...parcel, weight: null } }), undefined);
  assert.equal(reportedOrderParcel({}), undefined);
});

test('quotes save the four numeric measurements once using the order-specific POST route', async () => {
  mockApi(() => ({ data: { success: true, data: { couriers: [courier()] } } }));
  const result = await getCourierQuotes('order/1', parcel);
  assert.equal(result[0].courierId, 42);
  assert.equal(result[0].rate, 72.5);
  assert.deepEqual(calls, [{ method: 'post', args: ['/admin/orders/order%2F1/courier-quotes', parcel] }]);
});

test('quotes accept supported response envelopes and zero rates, but reject missing lists and invalid pricing', async () => {
  for (const payload of [{ couriers: [courier('42')] }, { data: [courier()] }, { data: { couriers: [] } }]) {
    mockApi(() => ({ data: payload }));
    assert.ok(Array.isArray(await getCourierQuotes('order', parcel)));
  }
  mockApi(() => ({ data: { couriers: [{ ...courier(), rate: '0' }] } }));
  assert.equal((await getCourierQuotes('order', parcel))[0].rate, 0);
  for (const invalid of [null, {}, { couriers: {} }, { success: false, message: 'Pickup missing' },
    ...[-1, null, '', 'bad', Infinity].map((rate) => ({ couriers: [{ ...courier(), rate }] })),
    { couriers: [{ ...courier(), courierId: '' }] }, { couriers: [{ ...courier(), currency: 'USD' }] },
    { couriers: [courier(), courier()] }]) {
    mockApi(() => ({ data: invalid }));
    await assert.rejects(getCourierQuotes('order', parcel));
  }
});

test('courier confirmation preserves ID type and sends no client price or address override', async () => {
  for (const id of [42, '42']) {
    mockApi(() => ({ data: { success: true, data: { awb: 'AWB-123', shipmentId: 99 } } }));
    const result = await confirmCourier('order-1', id);
    assert.equal(result.awb, 'AWB-123');
    assert.deepEqual(calls, [{ method: 'post', args: ['/admin/orders/order-1/confirm-courier', { courierId: id }] }]);
  }
});

test('successful confirmation precedes PATCH approval; approval failure never repeats booking', async () => {
  for (const failApproval of [false, true]) {
    mockApi((method) => {
      if (method === 'patch' && failApproval) throw new Error('Approval unavailable');
      return { data: { success: true, data: { awb: 'AWB-123' } } };
    });
    const result = await confirmCourierAndApprove('order-1', 42);
    assert.equal(result.approvalFailed, failApproval);
    assert.deepEqual(calls.map((call) => [call.method, call.args[0]]), [['post', '/admin/orders/order-1/confirm-courier'], ['patch', '/admin/orders/order-1/approve']]);
  }
});

test('confirmed and processing orders book a courier without repeating approval or reporting a false approval failure', async () => {
  for (const status of ['confirmed', 'processing']) {
    mockApi((method) => {
      if (method === 'patch') throw new Error('Already approved');
      return { data: { success: true, data: { awb: 'AWB-123' } } };
    });
    const result = await confirmCourierAndApprove('order-1', 42, status === 'placed');
    assert.equal(result.approvalFailed, false);
    assert.equal(result.shipment.awb, 'AWB-123');
    assert.deepEqual(calls, [{ method: 'post', args: ['/admin/orders/order-1/confirm-courier', { courierId: 42 }] }]);
  }
});

test('failed confirmation never approves the order', async () => {
  for (const failure of [() => { throw new Error('Network unavailable'); }, () => ({ data: { success: false, message: 'Wallet balance insufficient' } })]) {
    mockApi(failure);
    await assert.rejects(confirmCourierAndApprove('order-1', 42));
    assert.deepEqual(calls.map((call) => call.method), ['post']);
  }
});

test('approval rejects an explicit backend failure even when HTTP status is successful', async () => {
  for (const payload of [
    { success: false, message: 'Approval validation failed' },
    { data: { success: false, message: 'Approval validation failed' } },
  ]) {
    mockApi(() => ({ data: payload }));
    await assert.rejects(approveOrder('order-1'), /Approval validation failed/);
  }
});

test('booking remains successful but approval is reported as failed for a success:false response', async () => {
  mockApi((method) => ({ data: method === 'patch'
    ? { success: false, message: 'Approval validation failed' }
    : { success: true, data: { awb: 'AWB-123' } } }));
  const result = await confirmCourierAndApprove('order-1', 42, true);
  assert.equal(result.shipment.awb, 'AWB-123');
  assert.equal(result.approvalFailed, true);
  assert.equal(calls.filter((call) => call.method === 'post').length, 1);
});
