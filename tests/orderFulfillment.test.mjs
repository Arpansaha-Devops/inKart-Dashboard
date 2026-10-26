import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPrepareOrderShipment, courierApprovalSelection, parcelFromDraft, saveParcelAndLoadQuotes, validateCourierQuotes } from '../src/lib/orderFulfillment.ts';

const parcel = { weight: .5, length: 20, breadth: 15, height: 5 };
const draft = () => ({ weight: '.5', length: '20', breadth: '15', height: '5' });
const quotes = () => ({ orderId: 'order-1', quoteId: 'quote-1', packageDetails: { ...parcel }, currency: 'INR', expiresAt: new Date(Date.now() + 60000).toISOString(), couriers: [
  { id: 'courier-1', courierName: 'Courier fixture', serviceName: 'Surface', deliveryCharge: 72.5 },
] });

test('order parcel drafts validate all actual measurements before conversion', () => {
  assert.deepEqual(parcelFromDraft(draft()), parcel);
  for (const weight of ['', '0', '-1', 'NaN', 'Infinity']) assert.throws(() => parcelFromDraft({ ...draft(), weight }), /positive, finite/);
});

test('only paid pending orders are eligible for parcel/courier preparation', () => {
  assert.equal(canPrepareOrderShipment('paid', 'placed'), true);
  for (const state of ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']) assert.equal(canPrepareOrderShipment('paid', state), false);
  assert.equal(canPrepareOrderShipment('pending', 'placed'), false);
});

test('quotes follow verified order-level save and approval uses that same parcel and chosen courier', async () => {
  const calls = [];
  const adapter = {
    async saveParcel(id, input) { calls.push(['save', id, input]); return { ...input }; },
    async getCourierQuotes(id, input) { calls.push(['quote', id, input]); return quotes(); },
    async approveWithCourier(id, selection) { calls.push(['approve', id, selection]); },
  };
  const result = await saveParcelAndLoadQuotes(adapter, 'order-1', parcel, (saved) => calls.push(['verified', saved]));
  assert.deepEqual(calls.map((call) => call[0]), ['save', 'verified', 'quote']);
  const selected = courierApprovalSelection(result, 'courier-1', draft());
  await adapter.approveWithCourier('order-1', selected);
  assert.deepEqual(calls.at(-1), ['approve', 'order-1', { quoteId: 'quote-1', courierId: 'courier-1', packageDetails: parcel }]);
});

test('failed or mismatched parcel saves never request courier rates', async () => {
  let requested = false;
  for (const saveParcel of [async () => { throw new Error('Save rejected'); }, async () => ({ ...parcel, weight: 9 })]) {
    await assert.rejects(saveParcelAndLoadQuotes({ saveParcel, getCourierQuotes: async () => { requested = true; return quotes(); } }, 'order-1', parcel));
  }
  assert.equal(requested, false);
});

test('rate errors preserve the verified save event and cannot produce approval', async () => {
  let saved = false;
  await assert.rejects(saveParcelAndLoadQuotes({
    saveParcel: async () => parcel,
    getCourierQuotes: async () => { throw new Error('Rates unavailable'); },
  }, 'order-1', parcel, () => { saved = true; }), /Rates unavailable/);
  assert.equal(saved, true);
});

test('changed dimensions, expired quotes and missing selections prevent courier approval', () => {
  assert.throws(() => courierApprovalSelection(quotes(), 'courier-1', { ...draft(), height: '6' }), /does not match/);
  const expired = quotes(); expired.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => courierApprovalSelection(expired, 'courier-1', draft()), /expired/);
  assert.throws(() => courierApprovalSelection(quotes(), '', draft()), /Select an available/);
  assert.throws(() => courierApprovalSelection({ ...quotes(), couriers: [] }, 'courier-1', draft()), /Select an available/);
});

test('malformed rates and duplicate service IDs are rejected without inventing prices', () => {
  for (const charge of [-1, NaN, Infinity, '72']) {
    const value = quotes(); value.couriers[0].deliveryCharge = charge;
    assert.match(validateCourierQuotes(value, parcel), /valid pricing/);
  }
  const duplicate = quotes(); duplicate.couriers.push({ ...duplicate.couriers[0] });
  assert.match(validateCourierQuotes(duplicate, parcel), /valid pricing/);
  const zero = quotes(); zero.couriers[0].deliveryCharge = 0;
  assert.equal(validateCourierQuotes(zero, parcel), null);
});

test('quotes from another order cannot prepare or approve this order', async () => {
  const otherOrder = { ...quotes(), orderId: 'order-2' };
  await assert.rejects(saveParcelAndLoadQuotes({ saveParcel: async () => parcel, getCourierQuotes: async () => otherOrder }, 'order-1', parcel), /does not belong/);
  assert.throws(() => courierApprovalSelection(otherOrder, 'courier-1', draft(), Date.now(), 'order-1'), /does not belong/);
});
