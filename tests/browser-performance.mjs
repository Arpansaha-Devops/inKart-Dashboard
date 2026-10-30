// Production-build loading checks with controlled API latency; never contacts live APIs.
// Requires isolated Chromium on BROWSER_DEBUG_URL (default port 9229).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('dist');
const origin = 'http://127.0.0.1:4176';
const baseline = process.env.PERFORMANCE_BASELINE === '1';
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname.replace(/^\/admin\/?/, '');
    const file = resolve(root, extname(path) ? path : 'index.html');
    if (!file.startsWith(root + sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(4176, '127.0.0.1', done));
const debugUrl = process.env.BROWSER_DEBUG_URL || 'http://127.0.0.1:9229';
const target = await (await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
let sequence = 0;
const pending = new Map();
const requests = [];
const errors = [];
const send = (method, params = {}) => new Promise((done, fail) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); fail(Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, { done, fail, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const category = { _id: '111111111111111111111111', name: 'Performance category', isActive: true, createdAt: '2026-10-01' };
const products = [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Performance product', category, stock: 5, price: 100, basePrice: 100, images: [], createdAt: '2026-10-01' }];
const delay = ms => new Promise(done => setTimeout(done, ms));
let ordersPending = 0;
let couponDelay = 200;
let couponsPending = 0;
async function intercept({ requestId, request }) {
  const url = new URL(request.url);
  if (url.origin === origin) return send('Fetch.continueRequest', { requestId });
  const path = url.pathname.replace(/^\/api\/v1/, '');
  requests.push({ path, method: request.method, search: url.searchParams.get('search'), nonce: url.searchParams.get('_ts'), at: Date.now() });
  let data = {};
  if (request.method !== 'OPTIONS') {
    if (path === '/admin/orders') {
      ordersPending++;
      await delay(1800);
      ordersPending--;
      data = { orders: [], total: 0, totalPages: 1 };
    } else {
      if (path === '/admin/coupons') couponsPending++;
      await delay(path === '/users/all' && url.searchParams.get('search') === 'older' ? 1400 : path === '/admin/coupons' ? couponDelay : 200);
      if (path === '/admin/coupons') couponsPending--;
      if (path === '/admin/products' || path === '/products') data = { products, total: 1 };
      else if (path === '/admin/categories') data = { categories: [category] };
      else if (path === '/admin/coupons') data = { coupons: [{ _id: 'coupon', code: 'FAST', discountValue: 10 }], total: 1 };
      else if (path === '/users/all') data = { users: [{ _id: 'user', name: url.searchParams.get('search') || 'Performance user', email: 'user@example.test', createdAt: '2026-10-01' }], total: 1 };
      else if (path === '/admin/analytics/dashboard-stats') data = { totalRevenue: 300, totalOrders: 3, averageOrderValue: 100 };
      else if (path === '/admin/analytics/revenue-over-time') data = { data: [{ date: '2026-10-01', revenue: 100 }, { date: '2026-10-02', revenue: 200 }] };
    }
  }
  await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' },
    { name: 'Access-Control-Allow-Methods', value: '*' },
  ], body: Buffer.from(JSON.stringify(data)).toString('base64') });
}
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    message.error ? entry.fail(Error(JSON.stringify(message.error))) : entry.done(message.result);
  } else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => errors.push(String(error)));
  else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async expression => {
  const start = Date.now();
  while (Date.now() - start < 12000) {
    if (await evaluate(expression)) return Date.now() - start;
    await delay(20);
  }
  throw Error(`Timed out: ${expression}`);
};
const navigate = path => evaluate(`document.querySelector('a[href="/admin/${path}"]').click()`);
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Network.setCookie', { url: origin, name: 'user', value: encodeURIComponent(JSON.stringify({ _id: 'admin', name: 'Admin', role: 'admin' })) });
  await send('Network.setCookie', { url: origin, name: 'token', value: `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const started = Date.now();
  await send('Page.navigate', { url: `${origin}/admin/dashboard` });
  await waitFor(`document.querySelectorAll('canvas').length === 2`);
  const chartsMs = Date.now() - started;
  const chartsBeforeOrders = ordersPending > 0;
  await waitFor(`document.querySelector('a[href="/admin/products"]') !== null`);
  await navigate('products');
  await waitFor(`document.querySelector('[aria-label="Edit product"]') !== null`);
  await navigate('categories');
  await waitFor(`document.querySelector('main h1')?.textContent.trim() === 'Categories' && document.querySelector('main').textContent.includes('Performance category')`);
  const productsBefore = requests.filter(r => r.method === 'GET' && r.path === '/admin/products').length;
  if (!baseline) products[0].name = 'Externally updated product';
  const revisited = Date.now();
  await navigate('products');
  await waitFor(`document.querySelector('[aria-label="Edit product"]') !== null`);
  if (!baseline) assert.ok(await evaluate(`document.querySelector('main').textContent.includes('Externally updated product')`), 'Revisiting must render a change made outside this dashboard');
  const revisitMs = Date.now() - revisited;
  const repeatProductRequests = requests.filter(r => r.method === 'GET' && r.path === '/admin/products').length - productsBefore;
  // Let outstanding activity requests settle before counting duplicate orders calls.
  await delay(1900);
  const orderRequests = requests.filter(r => r.method === 'GET' && r.path === '/admin/orders').length;
  const report = { baseline, chartsMs, chartsBeforeOrders, revisitMs, repeatProductRequests, orderRequests };
  console.log(JSON.stringify(report, null, 2));
  if (!baseline) {
    assert.equal(chartsBeforeOrders, true, 'Slow activity must not block charts');
    assert.equal(orderRequests, 1, 'Only one activity request is needed');
    assert.equal(repeatProductRequests, 1, 'Navigation must fetch current server data');
    const reads = requests.filter(r => r.method === 'GET');
    assert.ok(reads.every(r => r.nonce), 'Every GET must bypass cached HTTP responses');
    assert.equal(new Set(reads.map(r => r.nonce)).size, reads.length);

    // A slow coupon endpoint must not hold back the independent product chart.
    couponDelay = 1800;
    await send('Page.navigate', { url: `${origin}/admin/dashboard` });
    await waitFor(`document.querySelectorAll('canvas').length === 1`);
    assert.ok(couponsPending > 0, 'Product chart should appear before slow coupons finish');
    await waitFor(`document.querySelectorAll('canvas').length === 2`);

    // Validate the shared renderer on Analytics and ensure Refresh stays live.
    await navigate('analytics');
    await waitFor(`document.querySelectorAll('canvas').length === 1 && !!document.querySelector('#analytics-chart-heading')`);
    const revenueBefore = requests.filter(r => r.method === 'GET' && r.path === '/admin/analytics/revenue-over-time').length;
    await evaluate(`document.querySelector('#analytics-chart-heading').parentElement.parentElement.querySelector('button').click()`);
    await waitFor(`document.querySelectorAll('canvas').length === 1 && !!document.querySelector('#analytics-chart-heading')`);
    assert.equal(requests.filter(r => r.method === 'GET' && r.path === '/admin/analytics/revenue-over-time').length, revenueBefore + 1);
    await navigate('customers');
    await waitFor(`document.querySelector('[aria-label="View customer"]') !== null`);
    const search = value => evaluate(`(() => { const input = document.querySelector('[aria-label="Search customers by name or email"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await search('older');
    const deadline = Date.now() + 5000;
    while (!requests.some(r => r.path === '/users/all' && r.search === 'older')) {
      assert.ok(Date.now() < deadline, 'Older search must start before the newer search');
      await delay(20);
    }
    await search('newer');
    await waitFor(`document.querySelector('main').textContent.includes('newer')`);
    await delay(1500);
    assert.ok(await evaluate(`document.querySelector('tbody').textContent.includes('newer') && !document.querySelector('tbody').textContent.includes('older')`), 'A late response must not overwrite the current search');
    console.log('PASS: charts load independently; navigation renders external changes; all reads have unique URLs; Refresh fetches afresh; older search responses cannot overwrite newer results.');
  }
  assert.deepEqual(errors, []);
} finally {
  await send('Page.navigate', { url: 'about:blank' }).catch(() => {});
  const disconnected = socket.readyState === WebSocket.CLOSED
    ? Promise.resolve()
    : new Promise(done => socket.addEventListener('close', done, { once: true }));
  socket.close(); await disconnected; server.close();
  await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
}
