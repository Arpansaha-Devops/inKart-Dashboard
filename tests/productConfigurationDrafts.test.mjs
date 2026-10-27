import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductConfigurationDraft, productConfigurationDraftReducer as reduce } from '../src/lib/productConfigurationDrafts.ts';
import { appendProductExtensions } from '../src/lib/productConfiguration.ts';

const config = { enabled: true, fields: [{ key: 'printingSides', label: 'Printing side', type: 'select', required: true, isActive: true, options: [
  { label: 'Custom option', value: 'custom', priceModifier: .5, isActive: true },
] }] };

test('category drafts start empty without hardcoded fields or persistence', () => {
  const state = reduce(createProductConfigurationDraft(), { type: 'selectCategory', categoryId: 'any-category' });
  assert.deepEqual(state.configuration, { enabled: true, fields: [] });
  assert.equal(state.dirty, false);
});

test('switching categories separates filters and restores unsaved values when switching back', () => {
  let state = reduce(createProductConfigurationDraft(), { type: 'selectCategory', categoryId: 'first' });
  state = reduce(state, { type: 'update', configuration: config });
  state = reduce(state, { type: 'selectCategory', categoryId: 'second' });
  assert.deepEqual(state.configuration.fields, []); assert.equal(state.dirty, false);
  state = reduce(state, { type: 'update', configuration: { enabled: false, fields: [] } });
  state = reduce(state, { type: 'selectCategory', categoryId: 'first' });
  assert.deepEqual(state.configuration, config); assert.equal(state.dirty, true);
  state.configuration.fields[0].label = 'Changed draft label';
  assert.equal(config.fields[0].label, 'Printing side');
});

test('a decimal modifier is sent unchanged alongside common quantity pricing', () => {
  let state = reduce(createProductConfigurationDraft(), { type: 'selectCategory', categoryId: 'cards' });
  state = reduce(state, { type: 'update', configuration: config });
  const data = new FormData();
  data.set('quantityPricing', JSON.stringify([{ minQty: 100, pricePerUnit: 2 }]));
  appendProductExtensions(data, state.configuration);
  assert.equal(JSON.parse(data.get('configuration')).fields[0].options[0].priceModifier, .5);
  assert.deepEqual(JSON.parse(data.get('quantityPricing')), [{ minQty: 100, pricePerUnit: 2 }]);
});

test('clearing a category hides its filters and resetting the product removes all drafts', () => {
  let state = reduce(createProductConfigurationDraft(), { type: 'selectCategory', categoryId: 'first' });
  state = reduce(state, { type: 'update', configuration: config });
  state = reduce(state, { type: 'selectCategory', categoryId: '' });
  assert.deepEqual(state.configuration.fields, []);
  state = reduce(state, { type: 'reset' });
  assert.equal(state.categories.size, 0); assert.equal(state.dirty, false); assert.equal(state.categoryId, '');
});
