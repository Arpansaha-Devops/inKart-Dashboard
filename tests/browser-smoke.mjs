// Optional real-browser smoke checks against dist, with every external request intercepted.
// Start an isolated Chromium browser with --headless --remote-debugging-port=9229,
// run npm run build, then npm run test:browser. No production API is contacted.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { courierQuotesResponse } from './fixtures/courierQuotes.mjs';

const root = resolve('dist');
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname.replace(/^\/admin\/?/, '');
    const file = resolve(root, pathname || 'index.html');
    if (!file.startsWith(root + '\\') && !file.startsWith(root + '/') && file !== root) throw new Error('Invalid path');
    const target = extname(file) ? file : resolve(root, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(target)] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(4175, '127.0.0.1', done));
const debugUrl = process.env.BROWSER_DEBUG_URL || 'http://127.0.0.1:9229';
// A fresh page prevents init scripts and buffered errors leaking across reruns.
const target = await (await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
let sequence = 0;
const pending = new Map(); const browserErrors = []; const requests = [];
const categoryCreateRequests = [];
const galleryRequests = [];
const pngFixture = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let ignoreGalleryUploads = false;
let failSavedImageDownloads = false;
let galleryGeneration = 0;
let ignoreProductExtensions = false;
let categoryLookupGate = null;
let quoteGate = null;
let confirmationGate = null;
let quoteMode = 'success';
let confirmationFails = false;
let approvalFails = false;
let stockUpdateFails = false;
let stockUpdateGate = null;
let initScriptId;
const send = (method, params = {}) => new Promise((done, fail) => {
  if (socket.readyState !== WebSocket.OPEN) { fail(new Error('CDP socket is not open')); return; }
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 20000);
  pending.set(id, { done, fail, timer });
  try { socket.send(JSON.stringify({ id, method, params })); }
  catch (error) { clearTimeout(timer); pending.delete(id); fail(error); }
});
const categories = [
  { _id: '111111111111111111111111', name: 'Standee', slug: 'standee', isActive: true },
  { _id: '222222222222222222222222', name: 'Menu Cards', slug: 'menu-cards', isActive: true },
  { _id: '333333333333333333333333', name: 'Menu Cards', slug: 'menu-cards-1', isActive: true },
  { _id: '444444444444444444444444', name: 'Archived category', slug: 'archived', isActive: false },
];
const products = [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Smoke Standee', description: 'Existing product', category: categories[0], basePrice: 100, productType: 'on_demand', stock: '10', gstPercentage: 5,
  images: Array.from({ length: 5 }, (_, index) => ({ url: `https://images.example.test/old-${index + 1}.png` })), image: 'https://images.example.test/stale-cover.png',
  quantityPricing: [{ minQty: 1, pricePerUnit: 100 }],
  configuration: { enabled: true, fields: [{ key: 'size', label: 'Standee Size', type: 'select', required: true, isActive: true, options: [{ label: 'Tall', value: 'tall', priceModifier: 0, isActive: true }] }] },
  packageDetails: { weight: .5, length: 20, breadth: 15, height: 5 }, createdAt: '2026-10-26T00:00:00Z' }];
products.push(
  { ...products[0], _id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'Archived product', category: categories[3] },
  { ...products[0], _id: 'ffffffffffffffffffffffff', name: 'Legacy product', category: { _id: '555555555555555555555555', name: 'Legacy category', isActive: false } },
);
const orders = [{ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', orderNumber: 'SMOKE-001', customer: { _id: 'customer', name: 'Test Customer', email: 'test@example.test' },
  items: [{ _id: 'item', product: products[0], quantity: 1, price: 100, options: {}, selectedOptions: [{ key: 'size', value: 'tall' }] }],
  address: { fullName: 'Test Customer', addressLine1: 'Test street', city: 'Kolkata', state: 'West Bengal', pincode: '700159' },
  paymentStatus: 'paid', orderStatus: 'placed', totalAmount: 199, shippingCharge: 99, createdAt: '2026-10-26T00:00:00Z' }];
const courierFixtures = [
  { courierId: 42, courierName: 'API Courier A', serviceType: 'Surface', estimatedDays: '3–5', rate: 72.5, currency: 'INR' },
  { courierId: 'express-7', courierName: 'API Courier B', serviceType: 'Express', estimatedDays: 2, rate: 119, currency: 'INR' },
];
const fields = (request) => {
  const body = request.postData || '';
  if (body.startsWith('{')) return JSON.parse(body);
  const result = {};
  for (const match of body.matchAll(/name="([^"]+)"[^\r\n]*\r\n(?:[^\r\n]+\r\n)*\r\n([\s\S]*?)(?=\r\n--)/g)) {
    const [, name, value] = match;
    if (['configuration', 'packageDetails', 'quantityPricing', 'variants'].includes(name)) { try { result[name] = JSON.parse(value); } catch {} }
    else result[name] = value;
  }
  return result;
};
const uploadedGalleryNames = (request) => [...(request.postData || '').matchAll(/name="productImages"[^\r\n]*filename="([^"]+)"/g)].map((match) => match[1]);
async function intercept(event) {
  const { request, requestId } = event;
  const url = new URL(request.url);
  if (url.origin === 'http://127.0.0.1:4175') return send('Fetch.continueRequest', { requestId });
  if (url.hostname === 'images.example.test') {
    return send('Fetch.fulfillRequest', { requestId, responseCode: failSavedImageDownloads && ['Fetch', 'XHR'].includes(event.resourceType) ? 503 : 200,
      responseHeaders: [{ name: 'Content-Type', value: 'image/png' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Cache-Control', value: 'no-store' }], body: pngFixture });
  }
  let data = {}; let status = 200;
  const path = url.pathname.replace(/^\/api\/v1/, '');
  requests.push({ method: request.method, path, fields: request.postData ? fields(request) : undefined });
  const order = orders.find((item) => item._id === path.split('/')[3]);
  if (request.method === 'OPTIONS') data = {};
  else if (path === '/admin/categories' && request.method === 'GET') {
    if (categoryLookupGate) await categoryLookupGate;
    data = { categories };
  }
  else if (path === '/admin/categories' && request.method === 'POST') {
    const submittedFields = fields(request);
    categoryCreateRequests.push(submittedFields);
    const category = { ...submittedFields, _id: 'dddddddddddddddddddddddd', slug: 'menu-cards-2', isActive: true };
    categories.push(category); data = { success: true, category };
  }
  else if (path === '/admin/products' && request.method === 'GET') data = { products, total: products.length };
  else if (path === '/admin/products' && request.method === 'POST') {
    const product = { ...fields(request), _id: 'cccccccccccccccccccccccc', createdAt: '2026-10-26T00:00:00Z' }; products.push(product); data = { success: true, product };
  } else if (path.startsWith('/admin/products/') && path.endsWith('/stock') && request.method === 'PATCH') {
    if (stockUpdateGate) await stockUpdateGate;
    const product = products.find((item) => item._id === path.split('/')[3]);
    if (stockUpdateFails) data = { success: false, message: 'Stock update rejected by backend' };
    else {
      const change = fields(request);
      product.stock = Number(product.stock) + (change.operation === 'subtract' ? -change.quantity : change.quantity);
      data = { success: true, product };
    }
  } else if (path.startsWith('/admin/products/') && request.method === 'PATCH') {
    const product = products.find((item) => item._id === path.split('/').at(-1));
    const patch = fields(request);
    for (const key of ['stock', 'price', 'basePrice', 'gstPercentage']) if (Object.hasOwn(patch, key)) patch[key] = Number(patch[key]);
    for (const key of ['isCustomizable', 'isActive']) if (Object.hasOwn(patch, key)) patch[key] = patch[key] === 'true';
    const galleryNames = uploadedGalleryNames(request);
    delete patch.productImages;
    if (ignoreProductExtensions) { delete patch.configuration; delete patch.packageDetails; }
    Object.assign(product, patch);
    if (galleryNames.length) {
      galleryRequests.push({ productId: product._id, names: galleryNames });
      if (!ignoreGalleryUploads) {
        galleryGeneration += 1;
        product.images = galleryNames.map((name, index) => ({ url: `https://images.example.test/saved-${galleryGeneration}-${index}-${name}` }));
      }
    }
    data = { success: true, product };
  } else if (path === '/admin/orders') data = { orders, total: orders.length, totalPages: 1 };
  else if (path.endsWith('/courier-quotes')) {
    if (quoteGate) await quoteGate;
    if (quoteMode === 'server-error') { status = 500; data = { success: false, message: 'Internal failure fixture' }; }
    else if (quoteMode === 'validation-error') { status = 422; data = { success: false, message: 'Pickup address is missing' }; }
    else {
      order.packageDetails = fields(request);
      data = quoteMode === 'serviceability' ? courierQuotesResponse : { success: true, data: { couriers: quoteMode === 'empty' ? [] : courierFixtures } };
    }
  }
  else if (path.endsWith('/confirm-courier')) {
    if (confirmationGate) await confirmationGate;
    if (confirmationFails) { status = 422; data = { success: false, message: 'Insufficient wallet balance' }; }
    else {
      const courier = [...courierFixtures, ...courierQuotesResponse.data.deliveryServiceability.courierOptions].find((item) => item.courierId === fields(request).courierId);
      order.shiprocket = { awbCode: 'TEST-AWB-123', shipmentId: 987, shiprocketOrderId: 765, courierName: courier.courierName };
      data = { success: true, data: { awb: 'TEST-AWB-123', shipmentId: 987, orderId: order._id, courierName: courier.courierName } };
    }
  }
  else if (path.endsWith('/approve')) {
    if (approvalFails) { status = 500; data = { success: false, message: 'Approval failed' }; }
    else { order.orderStatus = 'confirmed'; data = { success: true }; }
  }
  else if (path.endsWith('/status')) data = { orderStatus: order.orderStatus };
  else if (path.endsWith('/shipmentDetails')) data = { data: { shiprocket: orders.find((item) => item._id === path.split('/')[2])?.shiprocket ?? {} } };
  else if (path.endsWith('/track')) data = { data: { activities: [], awbCode: 'TEST-AWB-123' } };
  else if (path === '/shipments/check-delivery') data = { isServiceable: true };
  else { status = 404; data = { message: 'Not available in smoke fixture' }; }
  await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [
    { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: '*' },
  ], body: Buffer.from(JSON.stringify(data)).toString('base64') });
}
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id) { const promise = pending.get(message.id); if (!promise) return; clearTimeout(promise.timer); pending.delete(message.id); message.error ? promise.fail(new Error(JSON.stringify(message.error))) : promise.done(message.result); }
  else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch((error) => browserErrors.push(String(error)));
  else if (message.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: false }).catch((error) => browserErrors.push(String(error)));
  else if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise((done) => setTimeout(done, 50)); }
  throw new Error(`UI condition timed out: ${expression}`);
};
const clickText = (text) => evaluate(`(() => {const button=[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === ${JSON.stringify(text)}).at(-1); if(!button)throw Error('Missing button: '+${JSON.stringify(text)}); button.click();})()`);
const fill = (selector, value) => evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input)throw Error('Missing input'); const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
const clearToasts = async () => {
  // Use Sonner's dismiss controls and wait for the exit animation/state cleanup.
  await evaluate(`document.querySelectorAll('[data-sonner-toast] [data-close-button]').forEach(button=>button.click())`);
  await waitFor(`document.querySelectorAll('[data-sonner-toast]').length===0`);
};
const chooseGalleryImages = (count, prefix, type = 'image/png', drop = false) => evaluate(`(() => {
  const bytes=Uint8Array.from(atob(${JSON.stringify(pngFixture)}),character=>character.charCodeAt(0));
  const transfer=new DataTransfer();
  for(let index=1;index<=${count};index++)transfer.items.add(new File([bytes],${JSON.stringify(prefix)}+'-'+index+'.png',{type:${JSON.stringify(type)}}));
  if(${drop})document.querySelector('.product-gallery-picker').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  else { const input=document.querySelector('#edit-product-image');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true})); }
})()`);
const screenshotDir = resolve(tmpdir(), 'inkart-ui-checks');
await mkdir(screenshotDir, { recursive: true });
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.bringToFront');
  await send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Network.setCookie', { url: 'http://127.0.0.1:4175', name: 'user', value: encodeURIComponent(JSON.stringify({ _id: 'test-admin', name: 'Test Admin', role: 'admin', email: 'test@example.test' })) });
  await send('Network.setCookie', { url: 'http://127.0.0.1:4175', name: 'token', value: `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.test` });
  const initScript = await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin==='http://127.0.0.1:4175')localStorage.setItem('printfrint-dashboard-theme','dark');` });
  initScriptId = initScript.identifier;
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:4175/admin/products' });
  await waitFor(`!!document.querySelector('[aria-label="Edit product"]')`);
  await evaluate(`document.querySelector('[aria-label="Close notifications panel"]')?.click();document.querySelector('[aria-label="Close notification panel"]')?.click()`);
  await evaluate(`document.querySelector('[aria-label="Edit product"]').click()`);
  await waitFor(`!!document.querySelector('#edit-product-name')`);
  assert.equal(await evaluate(`document.querySelector('#edit-product-image').multiple`), true);
  const patchesBeforeInvalidEditStock = requests.filter((request) => request.method === 'PATCH').length;
  await fill('#edit-product-stock', '1.5');
  assert.equal(await evaluate(`document.querySelector('#edit-product-stock').value`), '1.5');
  await evaluate(`document.querySelector('#edit-product-name').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await waitFor(`document.body.textContent.includes('Stock must be a non-negative whole number')`);
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, patchesBeforeInvalidEditStock);
  await fill('#edit-product-stock', '10');
  const originalGallery = products[0].images.map((image) => image.url);
  const writesBeforeGallery = requests.filter((request) => request.method === 'PATCH').length;
  assert.equal(await evaluate(`document.querySelectorAll('[data-gallery-kind="current"]').length`), 5);
  for (const count of [11, 15]) {
    await chooseGalleryImages(count, 'too-many');
    await waitFor(`document.querySelector('#edit-product-image-error')?.textContent.includes('up to 10')`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-gallery-kind="new"]').length`), 0);
  }
  await chooseGalleryImages(1, 'invalid-type', 'application/pdf');
  await waitFor(`document.querySelector('#edit-product-image-error')?.textContent.includes('JPG, PNG, or WebP')`);
  await chooseGalleryImages(2, 'preview');
  await waitFor(`document.querySelectorAll('[data-gallery-kind="new"]').length===2`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-gallery-kind="current"] img')].map(image=>image.src)`), originalGallery.slice(0, 3));
  await evaluate(`document.querySelector('[aria-label="Remove selected image 2"]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-gallery-kind="current"]').length`), 4);
  await chooseGalleryImages(1, 'dropped', 'image/png', true);
  await waitFor(`document.querySelectorAll('[data-gallery-kind="new"]').length===2`);
  await evaluate(`document.querySelector('.product-gallery-editor').scrollIntoView({block:'start'})`);
  await writeFile(resolve(screenshotDir, 'product-gallery-desktop.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[aria-label="Switch to light mode"]')?.click();document.querySelector('.product-gallery-editor').scrollIntoView({block:'start'})`);
  assert.equal(await evaluate(`document.querySelector('.modal-box').scrollWidth<=document.querySelector('.modal-box').clientWidth+1`), true);
  await writeFile(resolve(screenshotDir, 'product-gallery-mobile.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await clickText('Cancel');
  await waitFor(`!document.querySelector('#edit-product-name')`);
  assert.deepEqual(products[0].images.map((image) => image.url), originalGallery);
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, writesBeforeGallery);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelector('[aria-label="Switch to dark mode"]')?.click()`);

  for (const count of [2, 3, 5, 10]) {
    const currentCount = products[0].images.length;
    const expectedCount = Math.max(currentCount, count);
    const retainedCount = Math.max(0, currentCount - count);
    await evaluate(`document.querySelector('[aria-label="Edit product"]').click()`);
    await waitFor(`!!document.querySelector('#edit-product-name')`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-gallery-kind="new"]').length`), 0);
    await chooseGalleryImages(count, `replace-${count}`);
    await waitFor(`document.querySelectorAll('[data-gallery-kind="new"]').length===${count}`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-gallery-kind="current"]').length`), retainedCount);
    // Full replacement needs no old-image downloads, even if that host is unavailable.
    failSavedImageDownloads = count >= currentCount;
    await clickText('Save Changes');
    await waitFor(`!document.querySelector('#edit-product-name')`);
    failSavedImageDownloads = false;
    const uploaded = galleryRequests.at(-1);
    assert.equal(uploaded.productId, products[0]._id);
    assert.equal(uploaded.names.length, expectedCount);
    assert.deepEqual(uploaded.names.slice(0, retainedCount), Array.from({ length: retainedCount }, (_, index) => `retained-product-image-${index + 1}.png`));
    assert.deepEqual(uploaded.names.slice(retainedCount), Array.from({ length: count }, (_, index) => `replace-${count}-${index + 1}.png`));
    assert.equal(products[0].images.length, expectedCount);
    await waitFor(`document.querySelector('table tbody tr img').src===${JSON.stringify(products[0].images[0].url)}`);
  }
  assert.deepEqual(products[1].images.map((image) => image.url), originalGallery);

  await evaluate(`document.querySelector('[aria-label="Edit product"]').click()`);
  await waitFor(`!!document.querySelector('#edit-product-name')`);
  await chooseGalleryImages(2, 'retry');
  failSavedImageDownloads = true;
  const writesBeforeFailedDownload = requests.filter((request) => request.method === 'PATCH').length;
  await clickText('Save Changes');
  await waitFor(`document.body.textContent.includes('Could not load current image 1')`);
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, writesBeforeFailedDownload);
  assert.equal(await evaluate(`!!document.querySelector('#edit-product-name')`), true);
  failSavedImageDownloads = false;
  await clickText('Save Changes');
  await waitFor(`!document.querySelector('#edit-product-name')`);

  const galleryBeforeIgnoredSave = products[0].images.map((image) => image.url);
  await evaluate(`document.querySelector('[aria-label="Edit product"]').click()`);
  await waitFor(`!!document.querySelector('#edit-product-name')`);
  await chooseGalleryImages(2, 'ignored');
  ignoreGalleryUploads = true;
  await clearToasts();
  await clickText('Save Changes');
  await waitFor(`!document.querySelector('#edit-product-name')`);
  await waitFor(`document.body.textContent.includes('image gallery still contains images from the replaced slots')`);
  assert.deepEqual(products[0].images.map((image) => image.url), galleryBeforeIgnoredSave);
  ignoreGalleryUploads = false;
  await evaluate(`document.querySelector('[aria-label="Edit product"]').click()`);
  await waitFor(`!!document.querySelector('#edit-product-name')`);
  assert.equal(await evaluate(`document.body.textContent.includes('Default Package Details')`), false);
  assert.equal(await evaluate(`[...document.querySelectorAll('#edit-product-name')][0].closest('form').querySelectorAll('input[id$="-weight"]').length`), 0);
  assert.equal(await evaluate(`document.querySelector('[value="size"]').readOnly`), true);
  assert.deepEqual(await evaluate(`[...document.querySelector('#edit-product-category').options].map(option=>option.value)`), categories.filter((category) => category.isActive).map((category) => category._id));
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option label:nth-child(2) input').readOnly`), true);
  await fill('.product-configuration-option label:nth-child(2) input', 'tampered');
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option label:nth-child(2) input').value`), 'tall');
  await clickText('Add option');
  await fill('.product-configuration-option + .product-configuration-option label:nth-child(2) input', 'tall');
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option + .product-configuration-option label:nth-child(2) input').readOnly`), false);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Remove option 1 from field 1"]').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Remove option 2 from field 1"]').disabled`), false);
  await evaluate(`document.querySelector('[aria-label="Remove option 1 from field 1"]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.product-configuration-option').length`), 2);
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option label:nth-child(2) input').value`), 'tall');
  await fill('.product-configuration-option + .product-configuration-option label:nth-child(2) input', 'new-identifier');
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option + .product-configuration-option label:nth-child(2) input').value`), 'new-identifier');
  await evaluate(`document.querySelector('[aria-label="Remove option 2 from field 1"]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.product-configuration-option').length`), 1);
  await evaluate(`document.querySelector('.product-configuration-option input[type="checkbox"]').click()`);
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option input[type="checkbox"]').checked`), false);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Remove option 1 from field 1"]').disabled`), true);
  await clickText('Cancel');
  await waitFor(`!document.querySelector('#edit-product-name')`);
  await evaluate(`document.querySelector('table tbody tr td:nth-child(4) button').click()`);
  await waitFor(`!!document.querySelector('#stock-quantity')`);
  const stockWritesBeforeInvalidQuantity = requests.filter((request) => request.method === 'PATCH' && request.path.endsWith('/stock')).length;
  await fill('#stock-quantity', '1.5');
  assert.equal(await evaluate(`document.querySelector('#stock-quantity').value`), '1.5');
  await evaluate(`document.querySelector('#stock-quantity').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await waitFor(`document.body.textContent.includes('Stock quantity must be a positive whole number')`);
  assert.equal(requests.filter((request) => request.method === 'PATCH' && request.path.endsWith('/stock')).length, stockWritesBeforeInvalidQuantity);
  await fill('#stock-quantity', '3');
  stockUpdateFails = true;
  let releaseStockUpdate;
  stockUpdateGate = new Promise((resolve) => { releaseStockUpdate = resolve; });
  await clickText('Update');
  await evaluate(`document.querySelector('#stock-quantity').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))`);
  const pendingStockWrites = requests.filter((request) => request.method === 'PATCH' && request.path.endsWith('/stock')).length;
  stockUpdateGate = null; releaseStockUpdate();
  assert.equal(pendingStockWrites, stockWritesBeforeInvalidQuantity + 1);
  await waitFor(`document.body.textContent.includes('Stock update rejected by backend')`);
  assert.equal(await evaluate(`!!document.querySelector('#stock-quantity')`), true);
  assert.equal(products[0].stock, 10);
  stockUpdateFails = false;
  await clickText('Update');
  await waitFor(`!document.querySelector('#stock-quantity')`);
  await waitFor(`document.querySelector('table tbody tr td:nth-child(4) button').textContent.trim()==='13'`);
  assert.equal(products[0].stock, 13);
  await evaluate(`document.querySelector('table tbody tr td:nth-child(4) button').click()`);
  await waitFor(`!!document.querySelector('#stock-quantity')`);
  await clickText('Subtract');
  await fill('#stock-quantity', '3');
  await clickText('Update');
  await waitFor(`!document.querySelector('#stock-quantity')`);
  await waitFor(`document.querySelector('table tbody tr td:nth-child(4) button').textContent.trim()==='10'`);
  assert.equal(products[0].stock, 10);
  await evaluate(`document.querySelector('[aria-label="Edit product"]').click()`);
  await waitFor(`!!document.querySelector('#edit-product-name')`);
  assert.equal(await evaluate(`document.querySelector('.product-extension-section input[type="number"]').value`), '0');
  await fill('.product-configuration-option input[type="number"]', '37.5');
  await fill('.product-configuration-field > .product-extension-grid input', 'Updated size');
  await clickText('Add option');
  await waitFor(`document.querySelectorAll('.product-configuration-option').length===2`);
  await evaluate(`document.querySelector('[aria-label="Remove option 2 from field 1"]').click()`);
  await clickText('Add field');
  await waitFor(`document.querySelectorAll('.product-configuration-field').length===2`);
  await fill('.product-configuration-field:nth-of-type(2) > .product-extension-grid label:nth-child(1) input', 'Duplicate size');
  await fill('.product-configuration-field:nth-of-type(2) > .product-extension-grid label:nth-child(2) input', 'size');
  const patchCount = requests.filter((request) => request.method === 'PATCH').length;
  await clickText('Save Changes');
  await waitFor(`document.body.textContent.includes('duplicate field key')`);
  assert.equal(await evaluate(`document.querySelector('.product-configuration-field:nth-of-type(2) > .product-extension-grid label:nth-child(2) input').readOnly`), false);
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, patchCount);
  await evaluate(`document.querySelector('[aria-label="Remove field 2"]').click()`);
  await fill('#edit-product-category', categories[2]._id);
  await waitFor(`document.querySelector('.product-extension-section legend').textContent==='Menu Card Configuration'`);
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option input[type="number"]').value`), '37.5');
  await fill('#edit-product-category', categories[0]._id);
  await evaluate(`document.querySelector('.product-extension-section').scrollIntoView({block:'start'});`);
  await new Promise((done) => setTimeout(done, 500));
  const darkShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(screenshotDir, 'product-dark-desktop.png'), Buffer.from(darkShot.data, 'base64'));
  await clickText('Save Changes');
  await waitFor(`!document.querySelector('#edit-product-name')`);
  assert.equal(products[0].configuration.fields[0].options[0].priceModifier, 37.5);
  assert.equal(products[0].packageDetails.weight, .5);
  await evaluate(`document.querySelector('[aria-label="Edit product"]').click()`);
  await waitFor(`!!document.querySelector('#edit-product-name')`);
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option input[type="number"]').value`), '37.5');
  assert.equal(await evaluate(`document.querySelector('#edit-product-name').closest('form').querySelectorAll('input[id$="-weight"]').length`), 0);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[aria-label="Switch to light mode"]')?.click();document.querySelector('.product-extension-section').scrollIntoView({block:'start'});`);
  await new Promise((done) => setTimeout(done, 500));
  assert.equal(await evaluate(`document.querySelector('.modal-box').scrollWidth <= document.querySelector('.modal-box').clientWidth + 1`), true);
  const lightShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(screenshotDir, 'product-light-mobile.png'), Buffer.from(lightShot.data, 'base64'));
  ignoreProductExtensions = true;
  await fill('.product-configuration-option input[type="number"]', '71');
  await clickText('Save Changes');
  await waitFor(`!document.querySelector('#edit-product-name')`);
  await waitFor(`document.body.textContent.includes('backend did not return the submitted configuration')`);
  assert.equal(products[0].configuration.fields[0].options[0].priceModifier, 37.5);
  ignoreProductExtensions = false;
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelectorAll('[aria-label="Edit product"]')[1].click()`);
  await waitFor(`!!document.querySelector('#edit-product-name')`);
  assert.equal(await evaluate(`document.querySelector('#edit-product-category').value`), categories[3]._id);
  assert.deepEqual(await evaluate(`[...document.querySelector('#edit-product-category').options].map(option=>option.value)`), [categories[3]._id, ...categories.filter((category) => category.isActive).map((category) => category._id)]);
  await fill('#edit-product-name', 'Updated archived product');
  await clickText('Save Changes');
  await waitFor(`!document.querySelector('#edit-product-name')`);
  assert.equal(products[1].category, categories[3]._id);
  let releaseCategoryLookup;
  categoryLookupGate = new Promise((resolve) => { releaseCategoryLookup = resolve; });
  await clickText('Create Product');
  await waitFor(`!!document.querySelector('#create-product-name')`);
  assert.equal(await evaluate(`document.querySelectorAll('.product-create-options .product-extension-section').length`), 0);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.product-create-sections > section')].map(section=>section.getAttribute('aria-label'))`), ['Product information', 'Category and product options', 'Quantity and pricing', 'Product description', 'Product images']);
  assert.equal(await evaluate(`document.querySelector('#create-product-name').closest('form').querySelectorAll('input[id$="-weight"]').length`), 0);
  await fill('#create-product-name', 'Smoke Configured Product');
  await fill('#create-product-price', '150');
  await fill('#create-product-base-price', '150');
  await fill('#create-product-description', 'Product configured after a delayed category lookup');
  await fill('#create-product-category', categories[0].name);
  assert.equal(await evaluate(`document.querySelectorAll('.product-create-options .product-extension-section').length`), 0);
  categoryLookupGate = null;
  releaseCategoryLookup();
  await waitFor(`!!document.querySelector('.product-create-options .product-extension-section')`);
  await fill('[id^="create-tier-price-"]', '150');
  assert.equal(await evaluate(`document.querySelector('.product-extension-section input[type="checkbox"]').checked`), true);
  await clickText('Add field');
  await fill('.product-configuration-field > .product-extension-grid label:nth-child(1) input', 'Finish');
  await fill('.product-configuration-field > .product-extension-grid label:nth-child(2) input', 'finish');
  await clickText('Add option');
  await fill('.product-configuration-option label:nth-child(1) input', 'Matte');
  await fill('.product-configuration-option label:nth-child(2) input', 'matte');
  await fill('.product-configuration-option input[type="number"]', '.5');
  await fill('#create-product-category', categories[2]._id);
  await waitFor(`document.querySelectorAll('.product-create-options .product-configuration-field').length===0`);
  assert.equal(await evaluate(`document.querySelector('[id^="create-tier-price-"]').value`), '150');
  await fill('#create-product-category', categories[0]._id);
  await waitFor(`document.querySelectorAll('.product-create-options .product-configuration-field').length===1`);
  assert.equal(await evaluate(`document.querySelector('.product-configuration-option input[type="number"]').value`), '0.5');
  assert.equal(await evaluate(`document.querySelector('.product-configuration-field > .product-extension-grid label:nth-child(2) input').value`), 'finish');
  assert.equal(await evaluate(`document.querySelector('.product-create-inventory').open`), false);
  await fill('#create-product-stock', '1.5');
  assert.equal(await evaluate(`document.querySelector('#create-product-stock').value`), '1.5');
  const productsBeforeFractionalStock = products.length;
  await evaluate(`document.querySelector('#create-product-name').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await waitFor(`document.body.textContent.includes('Stock must be a non-negative whole number')`);
  assert.equal(products.length, productsBeforeFractionalStock);
  await fill('#create-product-stock', '0');
  await clickText('Add color');
  await fill('[id^="variant-stock-"]', '1.5');
  assert.equal(await evaluate(`document.querySelector('[id^="variant-stock-"]').value`), '1.5');
  assert.equal(await evaluate(`document.querySelector('[id^="variant-stock-"]').validity.stepMismatch`), true);
  await evaluate(`document.querySelector('[aria-label="Remove color 1"]').click()`);
  await fill('#create-product-stock', '-1');
  await evaluate(`document.querySelector('#create-product-stock').reportValidity()`);
  assert.equal(await evaluate(`document.querySelector('.product-create-inventory').open`), true);
  await fill('#create-product-stock', '0');
  await evaluate(`document.querySelector('.product-create-inventory').open=false`);
  await evaluate(`document.querySelector('[aria-label="Switch to dark mode"]')?.click();document.querySelectorAll('[data-sonner-toast] [data-close-button]').forEach(button=>button.click());document.querySelector('.product-create-options').scrollIntoView({block:'start'})`);
  await new Promise((done) => setTimeout(done, 300));
  await writeFile(resolve(screenshotDir, 'product-create-category-options.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[aria-label="Switch to light mode"]')?.click();document.querySelector('.product-create-options').scrollIntoView({block:'start'})`);
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(await evaluate(`document.querySelector('.product-create-modal').scrollWidth<=document.querySelector('.product-create-modal').clientWidth+1`), true);
  await writeFile(resolve(screenshotDir, 'product-create-mobile.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate(`(() => { const bytes=Uint8Array.from(atob(${JSON.stringify(pngFixture)}),c=>c.charCodeAt(0)); const transfer=new DataTransfer(); for(let index=1;index<=6;index++)transfer.items.add(new File([bytes],'create-'+index+'.png',{type:'image/png'})); const input=document.querySelector('#create-product-images');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(`document.querySelectorAll('img[alt^="Preview "]').length===6`);
  await evaluate(`(() => { const bytes=Uint8Array.from(atob(${JSON.stringify(pngFixture)}),c=>c.charCodeAt(0)); const transfer=new DataTransfer(); for(let index=7;index<=10;index++)transfer.items.add(new File([bytes],'create-'+index+'.png',{type:'image/png'})); const input=document.querySelector('#create-product-images');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(`document.querySelectorAll('img[alt^="Preview "]').length===10`);
  await clickText('Create Product');
  await waitFor(`!document.querySelector('#create-product-name')`);
  assert.equal(products.length, 4);
  const createdProduct = products.at(-1);
  assert.equal(createdProduct.category, categories[0]._id);
  assert.equal(createdProduct.configuration.fields[0].key, 'finish');
  assert.equal(createdProduct.configuration.enabled, true);
  assert.equal(createdProduct.configuration.fields[0].options[0].priceModifier, .5);
  assert.deepEqual(createdProduct.quantityPricing, [{ minQty: 1, pricePerUnit: 150 }]);
  assert.equal(Object.hasOwn(createdProduct, 'packageDetails'), false);
  assert.equal(createdProduct.images.length, 10);
  assert.ok(requests.some((request) => request.method === 'PATCH' && request.path.endsWith(createdProduct._id)));
  await send('Page.navigate', { url: 'http://127.0.0.1:4175/admin/orders' });
  await waitFor(`document.body.textContent.includes('SMOKE-001')`);
  await clickText('View');
  await waitFor(`!!document.querySelector('[aria-label="Order parcel details"]')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Order parcel details"] button').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Order parcel details"] fieldset').disabled`), false);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Order parcel details"] input[type="number"]').length`), 4);
  const parcelSelector = '[aria-label="Order parcel details"]';
  const fillParcel = async (values) => {
    for (const [key, value] of Object.entries(values)) await fill(`${parcelSelector} input[id$="-${key}"]`, value);
  };
  const quoteRequests = () => requests.filter((request) => request.method === 'POST' && request.path.endsWith('/courier-quotes'));
  const confirmationRequests = () => requests.filter((request) => request.method === 'POST' && request.path.endsWith('/confirm-courier'));
  const approvalRequests = () => requests.filter((request) => request.method === 'PATCH' && request.path.endsWith('/approve'));
  await fillParcel({ weight: '0' });
  await evaluate(`document.querySelector('${parcelSelector} input[id$="-weight"]').dispatchEvent(new FocusEvent('focusout',{bubbles:true}))`);
  await waitFor(`document.querySelector('${parcelSelector}').textContent.includes('Weight must be greater than 0')`);
  await fillParcel({ weight: '.05' });
  await waitFor(`document.querySelector('${parcelSelector}').textContent.includes('Minimum weight is 0.1 kg')`);
  await fillParcel({ weight: '.123' });
  await waitFor(`document.querySelector('${parcelSelector}').textContent.includes('at most 2 decimal places')`);
  await fillParcel({ weight: '.75', length: '25.5', breadth: '18', height: '7' });
  await waitFor(`!document.querySelector('${parcelSelector} [role="alert"]')`);
  assert.equal(quoteRequests().length, 0);
  assert.equal(await evaluate(`document.querySelector('${parcelSelector} button').disabled`), false);
  await evaluate(`document.querySelector('[aria-label="Close order details"]').click()`);
  await waitFor(`!document.querySelector('${parcelSelector}')`);
  await clickText('View');
  await waitFor(`!!document.querySelector('${parcelSelector}')`);
  assert.equal(await evaluate(`document.querySelector('${parcelSelector} input[id$="-weight"]').value`), '');
  assert.equal(await evaluate(`document.body.textContent.includes('Delivery charge (charged at checkout)')`), true);
  assert.equal(await evaluate(`document.body.textContent.includes('tall')`), true);
  await fillParcel({ weight: '.75', length: '25.5', breadth: '18', height: '7' });

  let releaseQuotes;
  quoteGate = new Promise((resolve) => { releaseQuotes = resolve; });
  quoteMode = 'server-error';
  await clickText('Save parcel & get courier quotes');
  await waitFor(`document.querySelector('${parcelSelector}').textContent.includes('Fetching available couriers...')`);
  await evaluate(`document.querySelector('${parcelSelector} button').click()`);
  assert.equal(quoteRequests().length, 1);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Close order details"]').disabled`), true);
  assert.deepEqual(quoteRequests()[0].fields, { weight: .75, length: 25.5, breadth: 18, height: 7 });
  quoteGate = null; releaseQuotes();
  await waitFor(`document.querySelector('${parcelSelector}').textContent.includes('Server error. Please try again.')`);
  quoteMode = 'validation-error';
  await clickText('Try again');
  await waitFor(`document.querySelector('${parcelSelector}').textContent.includes('Pickup address is missing')`);
  quoteMode = 'empty';
  await clickText('Try again');
  await waitFor(`document.querySelector('${parcelSelector}').textContent.includes('No courier services are available for this delivery address')`);
  assert.equal(await evaluate(`document.querySelector('.order-parcel-approval button').disabled`), true);
  quoteMode = 'success';
  await clickText('Save parcel & get courier quotes');
  await waitFor(`document.querySelectorAll('.order-courier-option').length===2`);
  assert.equal(await evaluate(`document.querySelector('${parcelSelector}').textContent.includes('Measurements saved')`), true);
  assert.equal(await evaluate(`document.querySelector('.order-courier-options').textContent.includes('72.50')`), true);
  assert.equal(await evaluate(`document.querySelector('.order-courier-options').textContent.includes('119.00')`), true);
  assert.equal(await evaluate(`document.querySelectorAll('.order-courier-options input[type="radio"]').length`), 0);

  await evaluate(`document.querySelector('${parcelSelector}').scrollIntoView({block:'start'})`);
  await new Promise((done) => setTimeout(done, 300));
  await writeFile(resolve(screenshotDir, 'order-couriers-desktop.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate(`document.querySelector('.order-courier-option').click()`);
  await waitFor(`[...document.querySelectorAll('dialog[open]')].length===2`);
  assert.equal(await evaluate(`document.querySelector('dialog[open] dialog').textContent.includes('connected wallet')`), true);
  assert.equal(confirmationRequests().length, 0);
  await clickText('Cancel');
  assert.equal(confirmationRequests().length, 0);
  assert.equal(await evaluate(`document.querySelectorAll('.order-courier-option[aria-pressed="true"]').length`), 1);
  await evaluate(`document.querySelectorAll('.order-courier-option')[1].click()`);
  await waitFor(`[...document.querySelectorAll('dialog[open]')].length===2`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor(`document.querySelectorAll('dialog[open]').length===1`);
  assert.equal(await evaluate(`!!document.querySelector('${parcelSelector}')`), true);
  assert.equal(await evaluate(`document.querySelectorAll('.order-courier-option[aria-pressed="true"]').length`), 1);
  await fillParcel({ height: '8' });
  assert.equal(await evaluate(`document.querySelectorAll('.order-courier-option').length`), 0);
  assert.equal(await evaluate(`document.querySelector('.order-parcel-approval button').disabled`), true);
  await clickText('Save parcel & get courier quotes');
  await waitFor(`document.querySelectorAll('.order-courier-option').length===2`);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[aria-label="Switch to light mode"]')?.click();document.querySelector('${parcelSelector}').scrollIntoView({block:'start'})`);
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(await evaluate(`document.querySelector('.order-parcel-workflow').scrollWidth<=document.querySelector('.order-parcel-workflow').clientWidth+1`), true);
  await writeFile(resolve(screenshotDir, 'order-couriers-mobile.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate(`document.querySelectorAll('.order-courier-option')[1].click()`);
  await waitFor(`document.querySelectorAll('dialog[open]').length===2`);
  assert.equal(await evaluate(`[...document.querySelectorAll('dialog[open] .modal-box')].at(-1).scrollWidth<=[...document.querySelectorAll('dialog[open] .modal-box')].at(-1).clientWidth+1`), true);
  await writeFile(resolve(screenshotDir, 'order-confirmation-mobile.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  confirmationFails = true;
  const approvalsBeforeFailure = approvalRequests().length;
  await clearToasts();
  await clickText('Yes, confirm & ship');
  await waitFor(`document.querySelector('dialog[open] dialog').textContent.includes('Insufficient wallet balance')`);
  assert.equal(approvalRequests().length, approvalsBeforeFailure);
  assert.equal(await evaluate(`document.querySelectorAll('dialog[open]').length`), 2);
  confirmationFails = false;
  let releaseConfirmation;
  confirmationGate = new Promise((resolve) => { releaseConfirmation = resolve; });
  const beforeConfirm = confirmationRequests().length;
  const readsBeforeConfirm = requests.filter((request) => request.method === 'GET' && request.path === '/admin/orders').length;
  await clearToasts();
  await clickText('Yes, confirm & ship');
  await waitFor(`document.querySelector('dialog[open] dialog').textContent.includes('Processing...')`);
  await evaluate(`[...document.querySelectorAll('dialog[open] dialog button')].at(-1).click()`);
  assert.equal(confirmationRequests().length, beforeConfirm + 1);
  assert.equal(await evaluate(`[...document.querySelectorAll('dialog[open] dialog button')].every(button=>button.disabled)`), true);
  confirmationGate = null; releaseConfirmation();
  await waitFor(`!document.querySelector('${parcelSelector}')`);
  await waitFor(`document.body.textContent.includes('TEST-AWB-123')`);
  assert.equal(orders[0].orderStatus, 'confirmed');
  assert.deepEqual(confirmationRequests().at(-1).fields, { courierId: 'express-7' });
  assert.equal(approvalRequests().length, approvalsBeforeFailure + 1);
  assert.ok(requests.filter((request) => request.method === 'GET' && request.path === '/admin/orders').length > readsBeforeConfirm);
  const bookingSequence = requests.filter((request) => request.method !== 'OPTIONS' && (request.path.endsWith('/confirm-courier') || request.path.endsWith('/approve')));
  assert.deepEqual(bookingSequence.slice(-2).map((request) => [request.method, request.path.split('/').at(-1)]), [['POST', 'confirm-courier'], ['PATCH', 'approve']]);

  await clickText('View');
  await waitFor(`!!document.querySelector('${parcelSelector}')`);
  assert.equal(await evaluate(`document.querySelector('${parcelSelector} input[id$="-weight"]').value`), '0.75');
  assert.equal(await evaluate(`document.querySelector('${parcelSelector} fieldset').disabled`), true);
  await waitFor(`[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Shipping label')`);
  await evaluate(`document.querySelector('[aria-label="Close order details"]').click()`);
  await waitFor(`!document.querySelector('${parcelSelector}')`);

  // A different order gets its own empty draft. An approval failure must not
  // trigger a second shipment; the existing manual approval remains available.
  orders.push({ ...orders[0], _id: 'abababababababababababab', orderNumber: 'SMOKE-002', orderStatus: 'placed', shiprocket: undefined, packageDetails: undefined });
  await send('Page.navigate', { url: 'http://127.0.0.1:4175/admin/orders' });
  await waitFor(`document.body.textContent.includes('SMOKE-002')`);
  await clickText('View');
  await waitFor(`!!document.querySelector('${parcelSelector}')`);
  assert.equal(await evaluate(`document.querySelector('${parcelSelector} input[id$="-weight"]').value`), '');
  await fillParcel({ weight: '1.25', length: '30', breadth: '20', height: '10.5' });
  await clickText('Save parcel & get courier quotes');
  await waitFor(`document.querySelectorAll('.order-courier-option').length===2`);
  assert.equal(quoteRequests().at(-1).path, '/admin/orders/abababababababababababab/courier-quotes');
  await evaluate(`document.querySelector('.order-courier-option').click()`);
  await waitFor(`document.querySelectorAll('dialog[open]').length===2`);
  approvalFails = true;
  const beforePartial = confirmationRequests().length;
  await clearToasts();
  await clickText('Yes, confirm & ship');
  await waitFor(`!document.querySelector('${parcelSelector}')`);
  await waitFor(`[...document.querySelectorAll('[data-sonner-toast]')].some(node=>node.textContent.includes('Shipment booked (API Courier A assigned. AWB: TEST-AWB-123), but order approval failed. Please approve manually.'))`);
  const partialApprovalToasts = await evaluate(`[...document.querySelectorAll('[data-sonner-toast]')].map(node=>({type:node.dataset.type,text:node.textContent}))`);
  assert.equal(partialApprovalToasts.some((toast) => toast.type === 'warning' && toast.text.includes('Shipment booked (API Courier A assigned. AWB: TEST-AWB-123)')), true);
  assert.equal(partialApprovalToasts.some((toast) => toast.type === 'success' && toast.text.includes('Order confirmed')), false);
  assert.equal(confirmationRequests().length, beforePartial + 1);
  assert.deepEqual(confirmationRequests().at(-1).fields, { courierId: 42 });
  assert.equal(orders[1].orderStatus, 'placed');
  await clickText('View');
  await waitFor(`!!document.querySelector('${parcelSelector}')`);
  assert.equal(await evaluate(`document.querySelector('${parcelSelector} input[id$="-weight"]').value`), '1.25');
  assert.equal(await evaluate(`document.querySelector('${parcelSelector} fieldset').disabled`), true);
  approvalFails = false;
  await clickText('Approve Order (existing flow)');
  await waitFor(`!([...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Approve Order (existing flow)'))`);
  assert.equal(orders[1].orderStatus, 'confirmed');
  assert.equal(confirmationRequests().length, beforePartial + 1);

  // Orders already approved through the existing flow must only book a courier.
  // Reject any approval call in the fixture to catch redundant requests/warnings.
  for (const [index, status] of ['confirmed', 'processing'].entries()) {
    quoteMode = status === 'confirmed' ? 'serviceability' : 'success';
    const existingOrder = { ...orders[0], _id: `already-approved-${status}`, orderNumber: `SMOKE-00${index + 3}`, orderStatus: status, shiprocket: undefined, packageDetails: undefined };
    orders.push(existingOrder);
    await send('Page.navigate', { url: 'http://127.0.0.1:4175/admin/orders' });
    await waitFor(`document.body.textContent.includes('${existingOrder.orderNumber}')`);
    await clickText('View');
    await waitFor(`!!document.querySelector('${parcelSelector}')`);
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Approve Order (existing flow)')`), false);
    await fillParcel({ weight: '.5', length: '20', breadth: '15', height: '5' });
    await clickText('Save parcel & get courier quotes');
    await waitFor(`document.querySelectorAll('.order-courier-option').length===${quoteMode === 'serviceability' ? 4 : 2}`);
    if (quoteMode === 'serviceability') {
      for (const price of ['175.72', '264.84', '116.72', '140.72']) assert.equal(await evaluate(`document.querySelector('.order-courier-options').textContent.includes('${price}')`), true);
      await waitFor(`[...document.querySelectorAll('.order-courier-logo img')].length===4 && [...document.querySelectorAll('.order-courier-logo img')].every(img => img.complete && img.naturalWidth > 0)`);
      await evaluate(`document.querySelector('${parcelSelector}').scrollIntoView({block:'start'})`);
      await writeFile(resolve(screenshotDir, 'order-serviceability-couriers.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      // Broken artwork must leave a usable courier card with a fallback icon.
      await evaluate(`document.querySelector('.order-courier-logo img').dispatchEvent(new Event('error'))`);
      await waitFor(`!!document.querySelector('.order-courier-logo .lucide-truck')`);
    }
    await evaluate(`document.querySelector('.order-courier-option').click()`);
    await waitFor(`document.querySelectorAll('dialog[open]').length===2`);
    const approvalsBeforeBooking = approvalRequests().length;
    const bookingsBefore = confirmationRequests().length;
    approvalFails = true;
    await clearToasts();
    await clickText('Yes, confirm & ship');
    await waitFor(`!document.querySelector('${parcelSelector}')`);
    await waitFor(`[...document.querySelectorAll('[data-sonner-toast][data-type="success"]')].some(node=>node.textContent.includes('Order confirmed'))`);
    assert.equal(approvalRequests().length, approvalsBeforeBooking);
    assert.equal(confirmationRequests().length, bookingsBefore + 1);
    assert.deepEqual(confirmationRequests().at(-1).fields, { courierId: quoteMode === 'serviceability' ? '10' : 42 });
    assert.equal(existingOrder.orderStatus, status);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-sonner-toast]')].some(node=>node.textContent.includes('Please approve manually.'))`), false);
    approvalFails = false;
  }
  await send('Page.navigate', { url: 'http://127.0.0.1:4175/admin/categories' });
  await waitFor(`document.body.textContent.includes('menu-cards-1')`);
  await clickText('Add Category');
  await fill('#create-category-name', 'Menu Cards');
  assert.equal(await evaluate(`document.querySelector('#create-category-slug').value`), '');
  await evaluate(`document.querySelector('#create-category-name').closest('form').requestSubmit()`);
  await waitFor(`!document.querySelector('#create-category-name')`);
  assert.equal(categories.filter((category) => category.name === 'Menu Cards').length, 3);
  assert.equal(categoryCreateRequests.length, 1);
  assert.equal(categoryCreateRequests[0].name, 'Menu Cards');
  assert.equal(Object.hasOwn(categoryCreateRequests[0], 'slug'), false);
  assert.deepEqual(browserErrors, []);
  assert.equal(requests.some((request) => /sync-shipment/.test(request.path)), false);
  console.log('PASS: product/category regressions; order parcel validation; dynamic courier quotes, loading, retry and empty states; confirmation/cancel/Escape; stale selections cleared; duplicate-click protection; courier booking followed by approval and refresh; partial approval recovery; per-order measurements and read-only booked shipments; existing labels; dark/light responsive layouts.');
  console.log(`Screenshots: ${screenshotDir}`);
} catch (error) {
  console.error(await evaluate(`JSON.stringify({alerts:[...document.querySelectorAll('[role="alert"],[data-sonner-toast]')].map(node=>node.textContent),invalid:[...document.querySelectorAll('input:invalid,select:invalid,textarea:invalid')].map(node=>({id:node.id,value:node.value,message:node.validationMessage})),text:document.body.innerText.slice(-1800)})`).catch(() => 'Browser diagnostics unavailable; preserving the original test failure.'));
  throw error;
} finally {
  if (initScriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScriptId }).catch(() => {});
  await send('Page.navigate', { url: 'about:blank' }).catch(() => {});
  const disconnected = socket.readyState === WebSocket.CLOSED
    ? Promise.resolve()
    : new Promise((done) => socket.addEventListener('close', done, { once: true }));
  socket.close();
  await disconnected;
  server.close();
  await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
}
