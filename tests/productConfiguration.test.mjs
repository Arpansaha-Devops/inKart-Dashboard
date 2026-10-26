import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendProductExtensions, emptyPackageDraft, validatePackage, validateConfiguration, extensionPersistenceError } from '../src/lib/productConfiguration.ts';

const config = (key = 'size') => ({ enabled: true, fields: [{ key, label: 'Size', type: 'select', required: true, isActive: true, options: [{ label: 'Custom option', value: 'custom', priceModifier: 0, isActive: true }] }] });
for (const key of ['size', 'menuSize', 'printingSides']) test(`${key}: round trip through multipart preserves stable keys, explicit modifiers and existing fields`, () => {
  const data = new FormData();
  data.set('quantityPricing', '[{"minQty":1,"pricePerUnit":20}]');
  data.set('productImages', new Blob(['image']), 'test.png');
  const value = config(key);
  value.fields[0].options.push({ label: 'Second', value: 'second', priceModifier: 37.25, isActive: false });
  appendProductExtensions(data, value);
  assert.deepEqual(JSON.parse(data.get('configuration')), value);
  assert.equal(extensionPersistenceError({ configuration: value }, data), null);
  assert.equal(data.get('productImages').name, 'test.png');
  assert.equal(data.get('quantityPricing'), '[{"minQty":1,"pricePerUnit":20}]');
});
test('rejects duplicate keys, duplicate options, malformed structures and invalid modifiers', () => {
  let value = config(); value.fields.push(structuredClone(value.fields[0])); assert.match(validateConfiguration(value), /duplicate field/);
  value = config(); value.fields[0].options.push(structuredClone(value.fields[0].options[0])); assert.match(validateConfiguration(value), /duplicate option/);
  for (const invalid of [NaN, Infinity, -Infinity, '', null]) {
    value = config(); value.fields[0].options[0].priceModifier = invalid; assert.match(validateConfiguration(value), /finite/);
  }
  assert.ok(validateConfiguration({ enabled: true, fields: [null] }));
  value = config(); value.fields[0].options[0].isActive = false; assert.match(validateConfiguration(value), /active option/);
  value.enabled = false; assert.equal(validateConfiguration(value), null);
});
test('legacy and untouched nested fields are omitted; explicit disable is serialized', () => {
  const data = new FormData(); appendProductExtensions(data); assert.equal(data.has('configuration'), false); assert.equal(data.has('packageDetails'), false);
  appendProductExtensions(data, { enabled: false, fields: [] }); assert.equal(JSON.parse(data.get('configuration')).enabled, false);
});
test('package measurements reject missing, zero, negative, invalid and infinite values', () => {
  assert.equal(validatePackage(emptyPackageDraft()), null);
  for (const invalid of ['', '0', '-1', 'no', 'Infinity']) {
    assert.ok(validatePackage({ weight: invalid, length: '1', breadth: '1', height: '1' }, true));
  }
  const draft = { weight: '0.125', length: '20.55', breadth: '15', height: '5' };
  const data = new FormData(); appendProductExtensions(data, undefined, draft);
  assert.deepEqual(JSON.parse(data.get('packageDetails')), { weight: .125, length: 20.55, breadth: 15, height: 5 });
  assert.equal(extensionPersistenceError({ packageDetails: JSON.parse(data.get('packageDetails')) }, data), null);
  assert.equal(extensionPersistenceError({}, data), 'packageDetails');
});
test('persistence comparison rejects ignored, reset or changed configuration', () => {
  const data = new FormData(); appendProductExtensions(data, config());
  assert.equal(extensionPersistenceError({}, data), 'configuration');
  const changed = config(); changed.fields[0].options[0].priceModifier = 99;
  assert.equal(extensionPersistenceError({ configuration: changed }, data), 'configuration');
});
