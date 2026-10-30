import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { createApiReadCache } from '../src/lib/apiReadCache.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup() {
  const calls = [];
  let handle = config => ({ data: { items: [{ name: 'original' }] }, status: 200, headers: {}, config });
  const cache = createApiReadCache(async config => { calls.push(config); return handle(config); });
  const client = axios.create({ baseURL: 'https://example.test/api/v1', adapter: cache.adapter });
  return { client, calls, cache, handle: callback => { handle = callback; } };
}

test('parallel reads and parameter ordering share transport; callers receive independent data', async () => {
  const { client, calls } = setup();
  const [first, second] = await Promise.all([
    client.get('/admin/products', { params: { page: 1, limit: 500 } }),
    client.get('/admin/products', { params: { limit: 500, page: 1 } }),
  ]);
  assert.equal(calls.length, 1);
  first.data.items[0].name = 'changed';
  assert.equal(second.data.items[0].name, 'original');
  const fresh = await client.get('/admin/products', { params: { page: 1, limit: 500 } });
  assert.equal(calls.length, 2);
  assert.equal(fresh.data.items[0].name, 'original');
});

test('pagination, filters and API origins remain separate requests', async () => {
  const { client, calls } = setup();
  await client.get('/admin/orders', { params: { page: 1, search: 'a' } });
  await client.get('/admin/orders', { params: { page: 2, search: 'a' } });
  await client.get('/admin/orders', { params: { page: 1, search: 'b' } });
  await client.get('/admin/orders', { baseURL: 'https://other.test/api/v1', params: { page: 1, search: 'a' } });
  assert.equal(calls.length, 4);
});

test('immediate repeat reads receive external changes without any cache window', async () => {
  const fixture = setup(); let version = 1;
  fixture.handle(config => ({ data: { version }, status: 200, headers: {}, config }));
  assert.equal((await fixture.client.get('/admin/products')).data.version, 1);
  version = 2; // Another admin changes the server; no local mutation occurred.
  assert.equal((await fixture.client.get('/admin/products')).data.version, 2);
  assert.equal(fixture.calls.length, 2);
  assert.notEqual(fixture.calls[0].params._ts, fixture.calls[1].params._ts);
});

test('explicit timestamps, refresh actions, tracking and cancellable reads stay live', async () => {
  const { client, calls } = setup();
  for (const config of [
    { params: { _ts: 1 } }, { params: new URLSearchParams('_ts=2') },
    { readCache: false }, { signal: new AbortController().signal },
  ]) {
    await client.get('/admin/products', config); await client.get('/admin/products', config);
  }
  await client.get('/orders/123/track'); await client.get('/orders/123/track');
  assert.equal(calls.length, 10);
});

test('every completed read including navigation and Refresh goes to the server', async () => {
  const { client, calls } = setup();
  await client.get('/admin/products');
  await client.get('/admin/products', { readCache: false });
  await client.get('/admin/products');
  assert.equal(calls.length, 3);
});

test('successful and rejected mutations are followed by new list and summary reads', async () => {
  const fixture = setup();
  for (const fails of [false, true]) {
    await fixture.client.get('/admin/products'); await fixture.client.get('/admin/categories');
    const before = fixture.calls.length;
    fixture.handle(config => {
      if (config.method === 'patch' && fails) throw Error('Server rejected update');
      return { data: {}, status: 200, headers: {}, config };
    });
    await fixture.client.patch('/admin/products/1', {}).catch(() => {});
    await fixture.client.get('/admin/products'); await fixture.client.get('/admin/categories');
    assert.equal(fixture.calls.length - before, 3);
  }
});

test('a read started before mutation retries rather than delivering its older response', async () => {
  const fixture = setup(); const gate = deferred(); let version = 1;
  fixture.handle(async config => {
    const snapshot = version;
    if (config.method === 'get' && snapshot === 1) await gate.promise;
    if (config.method === 'patch') version = 2;
    return { data: { version: snapshot }, status: 200, headers: {}, config };
  });
  const oldRead = fixture.client.get('/admin/products');
  await fixture.client.patch('/admin/products/1', {});
  gate.resolve();
  assert.equal((await oldRead).data.version, 2);
  assert.equal(fixture.calls.length, 3);
});

test('a read made during mutation waits and fetches only after the write settles', async () => {
  const fixture = setup(); const gate = deferred();
  fixture.handle(async config => {
    if (config.method === 'patch') await gate.promise;
    return { data: {}, status: 200, headers: {}, config };
  });
  const mutation = fixture.client.patch('/admin/products/1', {});
  const read = fixture.client.get('/admin/products');
  await new Promise(setImmediate);
  assert.equal(fixture.calls.filter(config => config.method === 'get').length, 0);
  gate.resolve(); await mutation;
  await read;
  assert.equal(fixture.calls.length, 2);
});

test('auth changes reject an old account response and separate in-flight work', async () => {
  const fixture = setup(); const gate = deferred();
  fixture.handle(async config => {
    if (config.headers.get('Authorization') === 'Bearer first') await gate.promise;
    return { data: config.headers.get('Authorization'), status: 200, headers: {}, config };
  });
  const first = fixture.client.get('/admin/products', { headers: { Authorization: 'Bearer first' } });
  const firstRejected = assert.rejects(first, /Account changed/);
  const second = await fixture.client.get('/admin/products', { headers: { Authorization: 'Bearer second' } });
  gate.resolve(); await firstRejected;
  const repeat = await fixture.client.get('/admin/products', { headers: { Authorization: 'Bearer second' } });
  assert.equal(second.data, 'Bearer second'); assert.equal(repeat.data, 'Bearer second');
  assert.equal(fixture.calls.length, 3);
});

test('failed GET requests are not cached and can be retried immediately', async () => {
  const fixture = setup();
  fixture.handle(() => { throw Error('Network failed'); });
  await assert.rejects(fixture.client.get('/admin/products'));
  await assert.rejects(fixture.client.get('/admin/products'));
  assert.equal(fixture.calls.length, 2);
});

test('the local /api proxy also fetches afresh for every completed read', async () => {
  const { client, calls } = setup();
  await client.get('/admin/categories', { baseURL: '/api' });
  await client.get('/admin/categories', { baseURL: '/api' });
  assert.equal(calls.length, 2);
});

test('a forced Refresh supersedes a pending older response', async () => {
  const fixture = setup(); const gate = deferred(); let count = 0;
  fixture.handle(async config => {
    const version = ++count;
    if (version === 1) await gate.promise;
    return { data: { version }, status: 200, headers: {}, config };
  });
  const oldRead = fixture.client.get('/admin/products');
  assert.equal((await fixture.client.get('/admin/products', { readCache: false })).data.version, 2);
  gate.resolve();
  assert.ok((await oldRead).data.version >= 2);
});

test('even shipment/detail reads get unique network URLs without mutating caller params', async () => {
  const { client, calls } = setup();
  const params = new URLSearchParams('page=1&_ts=provided');
  await client.get('/orders/123/track', { params });
  await client.get('/orders/123/track', { params });
  assert.equal(params.get('_ts'), 'provided');
  assert.notEqual(calls[0].params.get('_ts'), calls[1].params.get('_ts'));
});
