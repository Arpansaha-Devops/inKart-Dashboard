import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProduct, updateProduct, verifyProductExtensions } from '../src/services/productService.ts';
import { mockApi, calls } from './mockApiClient.mjs';
import * as gallery from '../src/lib/productImages.ts';

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

test('each read-back page includes a fresh cache-busting timestamp', async (context) => {
  let timestamp = 1000;
  context.mock.method(Date, 'now', () => ++timestamp);
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ _id: `other-${index}`, name: 'Other product' }));
  mockApi((method, url, options) => ({ data: { products: options.params.page === 1 ? firstPage : [{ _id: 'p', name: 'Saved product', configuration: config }] } }));
  assert.equal(await verifyProductExtensions({}, data(), 'p'), null);
  assert.deepEqual(calls.map((call) => call.args[1].params), [
    { page: 1, limit: 100, _ts: 1001 },
    { page: 2, limit: 100, _ts: 1002 },
  ]);
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

test('gallery plans keep the first old images and replace the tail in selection order', () => {
  const current = Array.from({ length: 5 }, (_, index) => `https://images.example.test/old-${index + 1}.png`);
  for (const count of [1, 2, 3, 5]) {
    const files = Array.from({ length: count }, (_, index) => new File(['new'], `new-${index + 1}.png`, { type: 'image/png' }));
    const plan = gallery.planProductGallery(current, files);
    assert.deepEqual(plan.retainedUrls, current.slice(0, 5 - count));
    assert.deepEqual(plan.newFiles, files);
    assert.equal(plan.totalCount, 5);
  }
  assert.deepEqual(gallery.planProductGallery(current, []).retainedUrls, current);
  const files = Array.from({ length: 3 }, (_, index) => new File(['new'], `${index}.png`, { type: 'image/png' }));
  assert.equal(gallery.planProductGallery([], files).totalCount, 3);
});

test('gallery uploads accept six to ten files and reject larger/invalid selections without truncation', () => {
  const png = () => new File(['image'], 'image.png', { type: 'image/png' });
  for (const count of [5, 6, 10]) assert.equal(gallery.validateProductGalleryFiles(Array.from({ length: count }, png)), null);
  for (const count of [11, 20]) assert.match(gallery.validateProductGalleryFiles(Array.from({ length: count }, png)), /10/);
  assert.match(gallery.validateProductGalleryFiles([new File(['pdf'], 'image.pdf', { type: 'application/pdf' })]), /JPG, PNG, or WebP/);
  assert.match(gallery.validateProductGalleryFiles([new File([], 'empty.png', { type: 'image/png' })]), /empty/i);
});

test('gallery planning permits ten new images and an explicit edit can trim an oversized saved gallery', () => {
  const current = Array.from({ length: 15 }, (_, index) => `https://example.test/old-${index}.png`);
  const files = Array.from({ length: 10 }, (_, index) => new File(['new'], `${index}.png`, { type: 'image/png' }));
  assert.deepEqual(gallery.planProductGallery(current, files).retainedUrls, []);
  assert.equal(gallery.planProductGallery(current, files).totalCount, 10);
  assert.deepEqual(gallery.planProductGallery(current, []).retainedUrls, current);
  assert.equal(gallery.planProductGallery(current, files.slice(0, 2)).retainedUrls.length, 8);
});

test('ten medium images are optimized against the combined upload budget', async (context) => {
  const previous = Object.fromEntries(['window', 'document', 'createImageBitmap'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  context.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let encodes = 0;
  globalThis.window = { createImageBitmap: true };
  globalThis.createImageBitmap = async () => ({ width: 1000, height: 1000, close() {} });
  globalThis.document = { createElement: () => ({
    getContext: () => ({ clearRect() {}, drawImage() {} }),
    toBlob(callback) { encodes++; callback(new Blob([new Uint8Array(300 * 1024)], { type: 'image/webp' })); },
  }) };
  const files = Array.from({ length: 10 }, (_, index) => new File([new Uint8Array(500 * 1024)], `${index}.png`, { type: 'image/png' }));
  const optimized = await gallery.optimizeProductImages(files);
  assert.equal(optimized.length, 10);
  assert.equal(encodes, 10);
  assert.ok(optimized.reduce((total, file) => total + file.size, 0) <= 3.5 * 1024 * 1024);
  assert.ok(files.every(file => file.size === 500 * 1024));
});

test('gallery URLs handle saved image objects and prioritize the current gallery over stale single-image data', () => {
  assert.deepEqual(gallery.getProductGalleryUrls({ images: [{ url: 'https://example.test/new.png' }, { secure_url: 'https://example.test/second.png' }], image: 'https://example.test/old.png' }), ['https://example.test/new.png', 'https://example.test/second.png']);
  assert.deepEqual(gallery.getProductGalleryUrls({ image: 'https://example.test/legacy.png' }), ['https://example.test/legacy.png']);
  assert.deepEqual(gallery.getProductGalleryUrls({ images: [], image: 'https://example.test/legacy.png' }), ['https://example.test/legacy.png']);
});

test('complete gallery upload preserves retained bytes and sends the new files last', async (context) => {
  const urls = Array.from({ length: 5 }, (_, index) => `https://images.example.test/old-${index + 1}.png`);
  const requested = [];
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    requested.push([url, options.credentials]);
    return new Response(`original:${url}`, { headers: { 'Content-Type': 'image/png' } });
  });
  const selected = [new File(['new-a'], 'a.png', { type: 'image/png' }), new File(['new-b'], 'b.png', { type: 'image/png' })];
  const files = await gallery.prepareProductGalleryUpload(urls, selected);
  assert.deepEqual(requested, urls.slice(0, 3).map((url) => [url, 'omit']));
  assert.equal(files.length, 5);
  assert.deepEqual(await Promise.all(files.slice(0, 3).map((file) => file.text())), urls.slice(0, 3).map((url) => `original:${url}`));
  assert.deepEqual(files.slice(3).map((file) => file.name), ['a.png', 'b.png']);
  assert.deepEqual(await gallery.prepareProductGalleryUpload(urls, []), []);
  requested.length = 0;
  const allNew = Array.from({ length: 5 }, (_, index) => new File(['new'], `all-${index}.png`, { type: 'image/png' }));
  assert.deepEqual((await gallery.prepareProductGalleryUpload(urls, allNew)).map((file) => file.name), allNew.map((file) => file.name));
  assert.deepEqual(requested, []);
});

test('failed retained-image downloads stop gallery preparation before any update', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 403 }));
  await assert.rejects(gallery.prepareProductGalleryUpload(['https://images.example.test/1.png', 'https://images.example.test/2.png'], [new File(['new'], 'new.png', { type: 'image/png' })]), /current image|existing image/i);
});

test('an image-only edit verifies that the backend replaced the gallery instead of appending or ignoring files', async () => {
  const form = new FormData();
  for (let index = 0; index < 5; index++) form.append('productImages', new File(['new'], `${index}.png`, { type: 'image/png' }));
  for (const count of [1, 10]) {
    mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Saved product', images: Array.from({ length: count }, (_, index) => `https://example.test/${index}.png`) }] } }));
    assert.match(await verifyProductExtensions({}, form, 'p'), /image gallery/);
  }
  mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Saved product', images: Array.from({ length: 5 }, (_, index) => `https://example.test/${index}.png`) }] } }));
  assert.equal(await verifyProductExtensions({}, form, 'p'), null);
  assert.equal(calls.length, 1);
});

test('fresh verification detects a backend that appends ten uploads to five saved images', async () => {
  const form = new FormData();
  for (let index = 0; index < 10; index++) form.append('productImages', new File(['new'], `${index}.png`, { type: 'image/png' }));
  mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Saved product', images: Array.from({ length: 15 }, (_, index) => `https://example.test/${index}.png`) }] } }));
  assert.match(await verifyProductExtensions({}, form, 'p'), /expected 10-image gallery/);
});

test('an unchanged gallery with the right count still warns when the replaced tail was ignored', async () => {
  const previousUrls = Array.from({ length: 5 }, (_, index) => `https://example.test/old-${index}.png`);
  const form = new FormData();
  for (let index = 0; index < 5; index++) form.append('productImages', new File(['image'], `${index}.png`, { type: 'image/png' }));
  mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Saved product', images: previousUrls }] } }));
  assert.match(await verifyProductExtensions({}, form, 'p', { previousUrls, newImageCount: 2 }), /image gallery/);
  mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Saved product', images: [...previousUrls.slice(0, 3), 'https://example.test/new-a.png', 'https://example.test/new-b.png'] }] } }));
  assert.equal(await verifyProductExtensions({}, form, 'p', { previousUrls, newImageCount: 2 }), null);
  const singleImage = new FormData(); singleImage.append('productImages', new File(['new'], 'new.png', { type: 'image/png' }));
  mockApi(() => ({ data: { products: [{ _id: 'p', name: 'Saved product', images: [], image: 'https://example.test/stale-cover.png' }] } }));
  assert.match(await verifyProductExtensions({}, singleImage, 'p', { previousUrls: ['https://example.test/old.png'], newImageCount: 1 }), /image gallery/);
});
