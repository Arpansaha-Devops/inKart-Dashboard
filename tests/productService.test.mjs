import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProduct, updateProduct, verifyProductExtensions } from '../src/services/productService.ts';
import { mockApi, calls } from './mockApiClient.mjs';

const config = { enabled: true, fields: [] };
const data = () => { const result = new FormData(); result.set('configuration', JSON.stringify(config)); return result; };
test('uses existing multipart create and patch routes', async () => {
  mockApi(() => ({ data: { success: true } }));
  const form = data(); await createProduct(form); await updateProduct('product-1', form);
  assert.equal(calls[0].method, 'post'); assert.equal(calls[0].args[0], '/admin/products'); assert.equal(calls[0].args[1], form);
  assert.equal(calls[1].method, 'patch'); assert.equal(calls[1].args[0], '/admin/products/product-1'); assert.equal(calls[1].args[1], form);
});
test('verifies saved fields using a fresh backend read, not a response echo', async () => {
  mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Standee', configuration: config }] } }));
  assert.equal(await verifyProductExtensions({ product: { _id: 'p', name: 'Standee', configuration: config } }, data()), null);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'get');
  mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Standee' }] } }));
  assert.match(await verifyProductExtensions({ product: { _id: 'p', name: 'Standee', configuration: config } }, data()), /did not return.*configuration/);
});
test('unavailable read or missing ID returns a warning without retrying creation', async () => {
  mockApi(() => { throw new Error('Offline'); });
  assert.match(await verifyProductExtensions({}, data(), 'p'), /could not be verified/);
  assert.equal(calls.length, 1);
  mockApi(() => { throw new Error('Should not request'); });
  assert.match(await verifyProductExtensions({}, data()), /could not be verified/); assert.equal(calls.length, 0);
  assert.equal(await verifyProductExtensions({}, new FormData()), null);
});

for (const shape of ['docs', 'data.docs']) {
  const listing = (items) => shape === 'docs' ? { docs: items } : { data: { docs: items } };
  test(`${shape} full listings continue to the saved product on page two`, async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ _id: `other-${index}`, name: 'Other product' }));
    mockApi((method, url, options) => ({ data: listing(options.params.page === 1 ? firstPage : [{ _id: 'p', name: 'Saved product', configuration: config }]) }));
    assert.equal(await verifyProductExtensions({}, data(), 'p'), null);
    assert.deepEqual(calls.map((call) => call.args[1].params.page), [1, 2]);
  });
  test(`${shape} short listings stop verification without unnecessary requests`, async () => {
    mockApi(() => ({ data: listing([{ _id: 'other', name: 'Other product' }]) }));
    assert.match(await verifyProductExtensions({}, data(), 'p'), /could not be verified/);
    assert.equal(calls.length, 1);
  });
}
