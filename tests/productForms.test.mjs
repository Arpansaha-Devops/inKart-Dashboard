import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductConfigurationFields from '../src/components/ProductConfigurationFields.tsx';
import PackageDetailsForm from '../src/components/PackageDetailsForm.tsx';
import ProductGalleryEditor from '../src/components/ProductGalleryEditor.tsx';
import { emptyPackageDraft } from '../src/lib/productConfiguration.ts';

test('configuration UI locks saved field keys and option values while keeping labels and prices editable', () => {
  const html = renderToStaticMarkup(React.createElement(ProductConfigurationFields, {
    value: { enabled: true, fields: [{ key: 'printingSides', label: 'Printing Sides', type: 'select', required: true, isActive: true, options: [{ label: 'Double sided', value: 'double', priceModifier: 42.5, isActive: true }] }] },
    savedKeys: ['printingSides'], onChange() {},
  }));
  assert.match(html, /Printing Sides/); assert.match(html, /readonly=""[^>]*value="printingSides"/i);
  assert.match(html, /readonly=""[^>]*value="double"/i);
  assert.match(html, /aria-label="Remove option 1 from field 1" disabled=""/);
  assert.match(html, /Mark this option inactive instead/);
  assert.match(html, /type="checkbox" checked=""\/> Active/);
  assert.doesNotMatch(html, /readonly=""[^>]*value="(?:Double sided|42.5)"/i);
  assert.match(html, /value="42.5"/); assert.match(html, /Add option/); assert.match(html, /Add field/);
});

test('new configurations leave option identifiers editable', () => {
  const html = renderToStaticMarkup(React.createElement(ProductConfigurationFields, {
    value: { enabled: true, fields: [{ key: 'size', label: 'Size', type: 'select', required: true, isActive: true, options: [{ label: 'Tall', value: 'tall', priceModifier: 0, isActive: true }] }] },
    onChange() {},
  }));
  assert.doesNotMatch(html, /readonly=""/i);
  assert.doesNotMatch(html, /aria-label="Remove option 1 from field 1" disabled=""/);
});

test('saved-key membership locks only matching fields and their options, including duplicate saved keys', () => {
  const fields = ['size', 'finish'].map((key) => ({
    key, label: key, type: 'select', required: true, isActive: true,
    options: [{ label: key, value: `${key}-choice`, priceModifier: 0, isActive: true }],
  }));
  const html = renderToStaticMarkup(React.createElement(ProductConfigurationFields, {
    value: { enabled: true, fields }, savedKeys: ['size', 'size', 'unused'], onChange() {},
  }));
  assert.match(html, /readonly=""[^>]*value="size"/i);
  assert.match(html, /readonly=""[^>]*value="size-choice"/i);
  const finishKeyInput = html.match(/<label\b[^>]*>Stable key(<input\b[^>]*\bvalue="finish"[^>]*>)<\/label>/)?.[1];
  const finishValueInput = html.match(/<label\b[^>]*>Stable value(<input\b[^>]*\bvalue="finish-choice"[^>]*>)<\/label>/)?.[1];
  for (const [label, input] of [['finish key', finishKeyInput], ['finish option value', finishValueInput]]) {
    assert.ok(input, `${label} input must exist`);
    assert.doesNotMatch(input, /\sdisabled(?:\s|=|\/?>)/i, `${label} input must be enabled`);
    assert.doesNotMatch(input, /\sreadonly(?:\s|=|\/?>)/i, `${label} input must be writable`);
  }
  assert.doesNotMatch(html, /<fieldset\b[^>]*\sdisabled(?:\s|=|\/?>)/i, 'Inputs must not inherit a disabled fieldset');
  assert.match(html, /aria-label="Remove option 1 from field 1" disabled=""/);
  assert.doesNotMatch(html, /aria-label="Remove option 1 from field 2" disabled=""/);
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

test('edit gallery allows multiple files and previews the retained prefix followed by new slots', () => {
  const html = renderToStaticMarkup(React.createElement(ProductGalleryEditor, {
    existingUrls: Array.from({ length: 5 }, (_, index) => `https://images.example.test/old-${index + 1}.png`),
    files: [new File(['new'], 'a.png', { type: 'image/png' }), new File(['new'], 'b.png', { type: 'image/png' })], onChange() {},
  }));
  assert.match(html, /type="file" multiple=""/);
  assert.equal((html.match(/data-gallery-kind="current"/g) || []).length, 3);
  assert.equal((html.match(/data-gallery-kind="new"/g) || []).length, 2);
  assert.doesNotMatch(html, /old-(?:4|5)\.png/);
  assert.match(html, /3 current \+ 2 new = 5 images/);
  assert.match(html, /Use current images/);
});

test('edit gallery supports ten replacement previews without retaining images from a five-image gallery', () => {
  const html = renderToStaticMarkup(React.createElement(ProductGalleryEditor, {
    existingUrls: Array.from({ length: 5 }, (_, index) => `https://example.test/old-${index}.png`),
    files: Array.from({ length: 10 }, (_, index) => new File(['new'], `${index}.png`, { type: 'image/png' })), onChange() {},
  }));
  assert.equal((html.match(/data-gallery-kind="new"/g) || []).length, 10);
  assert.doesNotMatch(html, /data-gallery-kind="current"/);
  assert.match(html, /0 current \+ 10 new = 10 images/);
  assert.match(html, /up to 10/);
});
