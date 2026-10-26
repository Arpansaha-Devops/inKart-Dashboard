import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the actual harness blocks without launching a browser or contacting APIs.
const source = readFileSync(new URL('./browser-smoke.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const cleanupStart = source.lastIndexOf('} finally {');
const cleanup = new AsyncFunction('send', 'socket', 'server', 'fetch', 'debugUrl', 'target', 'initScriptId', 'WebSocket',
  source.slice(cleanupStart + '} finally {'.length, source.lastIndexOf('}')));

function fixture(closed = false) {
  const steps = [];
  let onClose;
  const socket = {
    readyState: closed ? WebSocket.CLOSED : WebSocket.OPEN,
    addEventListener(name, listener) { steps.push(name); onClose = listener; },
    close() { steps.push('socket.close'); this.readyState = WebSocket.CLOSED; onClose?.(); },
  };
  const run = () => cleanup(
    async (method) => { steps.push(method); throw new Error('Broken CDP session'); },
    socket,
    { close() { steps.push('server.close'); } },
    async (url) => { steps.push(url); throw new Error('DevTools unavailable'); },
    'http://localhost:9229', { id: 'test-page' }, 'init-script', WebSocket,
  );
  return { steps, run };
}

test('cleanup continues after failed CDP and page-close requests, preserving the original assertion', async () => {
  const { steps, run } = fixture();
  const original = new Error('Original assertion failure');
  await assert.rejects(async () => {
    try { throw original; } finally { await run(); }
  }, (error) => error === original);
  assert.deepEqual(steps, [
    'Page.removeScriptToEvaluateOnNewDocument', 'Page.navigate', 'close',
    'socket.close', 'server.close', 'http://localhost:9229/json/close/test-page',
  ]);
});

test('cleanup resolves immediately for an already-closed socket', { timeout: 1000 }, async () => {
  const { steps, run } = fixture(true);
  await run();
  assert.equal(steps.includes('close'), false);
  assert.ok(steps.includes('server.close'));
  assert.equal(steps.at(-1), 'http://localhost:9229/json/close/test-page');
});

test('failed browser diagnostics do not replace the original test error', async () => {
  const catchStart = source.lastIndexOf('} catch (error) {');
  const diagnose = new AsyncFunction('error', 'console', 'evaluate', source.slice(catchStart + '} catch (error) {'.length, cleanupStart));
  const original = new Error('Original assertion failure');
  const messages = [];
  await assert.rejects(diagnose(original, { error(message) { messages.push(message); } }, async () => { throw new Error('Disconnected'); }), (error) => error === original);
  assert.match(messages[0], /preserving the original test failure/);
});

test('closed or throwing CDP sockets leave no pending request or timeout behind', async () => {
  const sendSource = source.slice(source.indexOf('const send = '), source.indexOf('const categories = '));
  const makeSend = new Function('socket', 'pending', 'setTimeout', 'clearTimeout', 'WebSocket', `let sequence = 0; ${sendSource} return send;`);
  for (const readyState of [WebSocket.CLOSED, WebSocket.OPEN]) {
    const pending = new Map(); const timers = new Set();
    const send = makeSend({ readyState, send() { throw new Error('Socket failed'); } }, pending,
      () => { const timer = Symbol(); timers.add(timer); return timer; },
      (timer) => timers.delete(timer), WebSocket);
    await assert.rejects(send('Page.navigate'));
    assert.equal(pending.size, 0);
    assert.equal(timers.size, 0);
  }
});
