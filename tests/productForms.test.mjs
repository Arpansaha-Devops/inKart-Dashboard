import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductConfigurationFields from '../src/components/ProductConfigurationFields.tsx';
import PackageDetailsForm from '../src/components/PackageDetailsForm.tsx';
import { emptyPackageDraft } from '../src/lib/productConfiguration.ts';

test('configuration UI locks saved field keys and option values while keeping labels and prices editable', () => {
  const html = renderToStaticMarkup(React.createElement(ProductConfigurationFields, {
    value: { enabled: true, fields: [{ key: 'printingSides', label: 'Printing Sides', type: 'select', required: true, isActive: true, options: [{ label: 'Double sided', value: 'double', priceModifier: 42.5, isActive: true }] }] },
    savedKeys: ['printingSides'], onChange() {},
  }));
  assert.match(html, /Printing Sides/); assert.match(html, /readOnly=""[^>]*value="printingSides"/);
  assert.match(html, /readOnly=""[^>]*value="double"/);
  assert.match(html, /aria-label="Remove option 1 from field 1" disabled=""/);
  assert.match(html, /Mark this option inactive instead/);
  assert.match(html, /type="checkbox" checked=""\/> Active/);
  assert.doesNotMatch(html, /readOnly=""[^>]*value="(?:Double sided|42.5)"/);
  assert.match(html, /value="42.5"/); assert.match(html, /Add option/); assert.match(html, /Add field/);
});

test('new configurations leave option identifiers editable', () => {
  const html = renderToStaticMarkup(React.createElement(ProductConfigurationFields, {
    value: { enabled: true, fields: [{ key: 'size', label: 'Size', type: 'select', required: true, isActive: true, options: [{ label: 'Tall', value: 'tall', priceModifier: 0, isActive: true }] }] },
    onChange() {},
  }));
  assert.doesNotMatch(html, /readOnly=""/);
  assert.doesNotMatch(html, /aria-label="Remove option 1 from field 1" disabled=""/);
});
test('package UI starts blank, labels all units and renders errors accessibly', () => {
  const html = renderToStaticMarkup(React.createElement(PackageDetailsForm, { value: emptyPackageDraft(), error: 'Weight is required', onChange() {} }));
  assert.match(html, /Weight \(kg\)/); assert.match(html, /Breadth \(cm\)/); assert.match(html, /role="alert"/);
  assert.equal((html.match(/value=""/g) || []).length, 4);
});

test('malformed saved configuration stays accessible and is preserved', () => {
  for (const value of [{ enabled: true, fields: null }, { enabled: true, fields: [null] }, { enabled: true, fields: [{ type: 'text', options: [] }] }]) {
    const html = renderToStaticMarkup(React.createElement(ProductConfigurationFields, { value, onChange() { throw new Error('Should not mutate'); } }));
    assert.match(html, /unsupported structure/); assert.match(html, /preserved during unrelated edits/);
  }
});
