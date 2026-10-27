// Optional real-browser smoke checks against dist, with every external request intercepted.
// Start an isolated Chromium browser with --headless --remote-debugging-port=9229,
// run npm run build, then npm run test:browser. No production API is contacted.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

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
let ignoreProductExtensions = false;
let categoryLookupGate = null;
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
const products = [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Smoke Standee', description: 'Existing product', category: categories[0], basePrice: 100, productType: 'on_demand', stock: 10, gstPercentage: 5,
  quantityPricing: [{ minQty: 1, pricePerUnit: 100 }],
  configuration: { enabled: true, fields: [{ key: 'size', label: 'Standee Size', type: 'select', required: true, isActive: true, options: [{ label: 'Tall', value: 'tall', priceModifier: 0, isActive: true }] }] },
  packageDetails: { weight: .5, length: 20, breadth: 15, height: 5 }, createdAt: '2026-10-26T00:00:00Z' }];
products.push(
  { ...products[0], _id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'Archived product', category: categories[3] },
  { ...products[0], _id: 'ffffffffffffffffffffffff', name: 'Legacy product', category: { _id: '555555555555555555555555', name: 'Legacy category', isActive: false } },
);
const orders = [{ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', orderNumber: 'SMOKE-001', customer: { _id: 'customer', name: 'Test Customer', email: 'test@example.test' },
  items: [{ _id: 'item', product: products[0], quantity: 1, price: 100, options: {}, selectedOptions: [{ key: 'size', value: 'tall' }] }],
  paymentStatus: 'paid', orderStatus: 'placed', totalAmount: 199, shippingCharge: 99, createdAt: '2026-10-26T00:00:00Z' }];
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
async function intercept(event) {
  const { request, requestId } = event;
  const url = new URL(request.url);
  if (url.origin === 'http://127.0.0.1:4175') return send('Fetch.continueRequest', { requestId });
  let data = {}; let status = 200;
  const path = url.pathname.replace(/^\/api\/v1/, '');
  requests.push({ method: request.method, path });
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
  } else if (path.startsWith('/admin/products/') && request.method === 'PATCH') {
    const product = products.find((item) => item._id === path.split('/').at(-1));
    const patch = fields(request);
    if (ignoreProductExtensions) { delete patch.configuration; delete patch.packageDetails; }
    Object.assign(product, patch); data = { success: true, product };
  } else if (path === '/admin/orders') data = { orders, total: orders.length, totalPages: 1 };
  else if (path.endsWith('/approve')) { orders[0].orderStatus = 'confirmed'; data = { success: true }; }
  else if (path.endsWith('/status')) data = { orderStatus: orders[0].orderStatus };
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
const screenshotDir = resolve(tmpdir(), 'inkart-ui-checks');
await mkdir(screenshotDir, { recursive: true });
try {
  await send('Page.enable'); await send('Runtime.enable');
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
  await evaluate(`(() => { const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'smoke.png',{type:'image/png'}));const input=document.querySelector('#create-product-images');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
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
  assert.ok(requests.some((request) => request.method === 'PATCH' && request.path.endsWith(createdProduct._id)));
  await send('Page.navigate', { url: 'http://127.0.0.1:4175/admin/orders' });
  await waitFor(`document.body.textContent.includes('SMOKE-001')`);
  await clickText('View');
  await waitFor(`!!document.querySelector('[aria-label="Order parcel details"]')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Order parcel details"] button').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Order parcel details"] fieldset').disabled`), false);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Order parcel details"] input[type="number"]').length`), 4);
  await fill('[aria-label="Order parcel details"] input[id$="-weight"]', '0');
  await evaluate(`const weight=document.querySelector('[aria-label="Order parcel details"] input[id$="-weight"]');weight.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));`);
  await waitFor(`document.querySelector('[aria-label="Order parcel details"]').textContent.includes('Weight must be a positive')`);
  for (const [key, value] of Object.entries({ weight: '.75', length: '25', breadth: '18', height: '7' })) await fill(`[aria-label="Order parcel details"] input[id$="-${key}"]`, value);
  await waitFor(`!document.querySelector('[aria-label="Order parcel details"] [role="alert"]')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Order parcel details"]').textContent.includes('Measurements have not been saved.')`), true);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Order parcel details"] input[type="radio"]').length`), 0);
  assert.equal(await evaluate(`[...document.querySelectorAll('[aria-label="Order parcel details"] button')].every(button=>button.disabled)`), true);
  assert.equal(requests.some((request) => request.method === 'POST' && /shipments/.test(request.path)), false);
  await evaluate(`document.querySelector('[aria-label="Order parcel details"]').scrollIntoView({block:'start'});`);
  await new Promise((done) => setTimeout(done, 400));
  const orderDesktopShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(screenshotDir, 'order-parcel-desktop.png'), Buffer.from(orderDesktopShot.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[aria-label="Switch to light mode"]')?.click();document.querySelector('[aria-label="Order parcel details"]').scrollIntoView({block:'start'});`);
  await new Promise((done) => setTimeout(done, 400));
  assert.equal(await evaluate(`document.querySelector('.order-parcel-workflow').scrollWidth<=document.querySelector('.order-parcel-workflow').clientWidth+1`), true);
  const orderMobileShot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(screenshotDir, 'order-parcel-mobile.png'), Buffer.from(orderMobileShot.data, 'base64'));
  await evaluate(`document.querySelector('[aria-label="Close order details"]').click()`);
  await waitFor(`!document.querySelector('[aria-label="Order parcel details"]')`);
  await clickText('View');
  await waitFor(`!!document.querySelector('[aria-label="Order parcel details"]')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Order parcel details"] input[id$="-weight"]').value`), '');
  assert.equal(await evaluate(`document.body.textContent.includes('Delivery charge (charged at checkout)')`), true);
  assert.equal(await evaluate(`document.body.textContent.includes('tall')`), true);
  await clickText('Approve Order (existing flow)');
  await waitFor(`!([...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Approve Order (existing flow)'))`);
  assert.equal(orders[0].orderStatus, 'confirmed');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Order parcel details"] fieldset').disabled`), true);
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
  console.log('PASS: product configuration and image uploads without parcel inputs; saved option locks; active category assignments; order-level parcel entry/validation, pending courier quote and approval controls, reset on close and read-only approved orders; existing approval; duplicate categories with omitted slug; dark/light responsive layouts.');
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
