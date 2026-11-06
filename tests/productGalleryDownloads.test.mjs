import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { prepareProductGalleryUpload } from '../src/lib/productImages.ts';

const urls = Array.from({ length: 5 }, (_, index) => `https://images.example.test/${index}.png`);
const selected = () => [new File(['new'], 'new.png', { type: 'image/png' })];
const response = (url) => new Response(`original:${url}`, { headers: { 'Content-Type': 'image/png' } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('retained downloads overlap at most two requests and preserve order despite reversed completions', async (context) => {
  const requests = [];
  let active = 0;
  let peak = 0;
  context.mock.method(globalThis, 'fetch', (url, options) => {
    const gate = deferred();
    requests.push({ url, options, ...gate });
    peak = Math.max(peak, ++active);
    return gate.promise.finally(() => { active--; });
  });
  const pending = prepareProductGalleryUpload(urls, selected());
  context.after(async () => {
    requests.forEach((request) => request.reject(new Error('Test cleanup')));
    await pending.catch(() => {});
  });
  assert.equal(requests.length, 2);
  requests[1].resolve(response(urls[1]));
  await setImmediate();
  assert.equal(requests.length, 3);
  requests[2].resolve(response(urls[2]));
  await setImmediate();
  assert.equal(requests.length, 4);
  requests[3].resolve(response(urls[3]));
  requests[0].resolve(response(urls[0]));
  const files = await pending;
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.ok(requests.every(({ options }) => options.credentials === 'omit' && options.mode === 'cors' && options.referrerPolicy === 'no-referrer'));
  assert.deepEqual(await Promise.all(files.slice(0, 4).map((file) => file.text())), urls.slice(0, 4).map((url) => `original:${url}`));
  assert.deepEqual(files.map((file) => file.name), [...urls.slice(0, 4).map((_, index) => `retained-product-image-${index + 1}.png`), 'new.png']);
});

test('a failed download stops queued work, aborts siblings and waits for them to settle', async (context) => {
  const requests = [];
  context.mock.method(globalThis, 'fetch', (url, options) => {
    const gate = deferred();
    requests.push({ url, options, ...gate });
    return gate.promise;
  });
  let settled = false;
  const pending = prepareProductGalleryUpload(urls, selected()).then(
    () => { settled = true; return null; },
    (error) => { settled = true; return error; },
  );
  context.after(async () => {
    requests.forEach((request) => request.reject(new Error('Test cleanup')));
    await pending;
  });
  assert.equal(requests.length, 2);
  requests[0].resolve(new Response('Unavailable', { status: 403 }));
  await setImmediate();
  assert.equal(requests[1].options.signal.aborted, true);
  assert.equal(requests.length, 2);
  assert.equal(settled, false);
  requests[1].reject(new DOMException('Aborted', 'AbortError'));
  assert.match((await pending).message, /Could not load current image 1\. No product changes were submitted/);
  assert.equal(requests.length, 2);
});

test('retained downloads keep their 20-second timeout and clear timers after cancellation', async (context) => {
  const timers = new Map();
  const requests = [];
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const timer = Symbol();
    timers.set(timer, { callback, delay });
    return timer;
  });
  context.mock.method(globalThis, 'clearTimeout', (timer) => timers.delete(timer));
  context.mock.method(globalThis, 'fetch', (url, options) => {
    requests.push({ url, options });
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  });
  const rejected = assert.rejects(prepareProductGalleryUpload(urls, selected()), /Could not load current image 1/);
  assert.deepEqual([...timers.values()].map(({ delay }) => delay), [20_000, 20_000]);
  timers.values().next().value.callback();
  await rejected;
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ options }) => options.signal.aborted));
  assert.equal(timers.size, 0);
});
