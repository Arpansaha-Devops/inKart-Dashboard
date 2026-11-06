import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { PassThrough } from 'node:stream';
import React, { Suspense } from 'react';
import { renderToPipeableStream } from 'react-dom/server';

function renderCharts(components, names = ['Bar', 'Doughnut', 'Line']) {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    let html = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => { html += chunk; });
    output.on('end', () => resolve(html));
    output.on('error', reject);
    const { pipe } = renderToPipeableStream(React.createElement(Suspense, { fallback: 'Loading charts' },
      names.map((name) => React.createElement(components[name], {
        key: name,
        'aria-label': name,
        data: { labels: ['Example'], datasets: [{ data: [1] }] },
      })),
    ), { onAllReady() { pipe(output); }, onError: reject });
  });
}

test('chart prefetch loads no heavy libraries; rendered charts load a shared registered runtime', async (context) => {
  const heavyImports = [];
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'chart.js' || specifier === 'react-chartjs-2') heavyImports.push(specifier);
      return next(specifier, context);
    },
  });
  context.after(() => hooks.deregister());
  const components = await import('../src/lib/chartRuntime.ts');
  assert.deepEqual(heavyImports, []);

  const html = await renderCharts(components);
  assert.equal((html.match(/<canvas/g) || []).length, 3);
  for (const name of ['Bar', 'Doughnut', 'Line']) assert.ok(html.includes(`aria-label="${name}"`));
  assert.ok(heavyImports.includes('chart.js'));
  assert.ok(heavyImports.includes('react-chartjs-2'));

  const { Chart } = await import('chart.js');
  for (const name of ['category', 'linear']) assert.equal(Chart.registry.getScale(name).id, name);
  for (const name of ['bar', 'point', 'arc', 'line']) assert.equal(Chart.registry.getElement(name).id, name);
  const loadedImports = [...heavyImports];
  const register = context.mock.method(Chart, 'register');
  assert.equal(await renderCharts(components), html);
  assert.deepEqual(heavyImports, loadedImports);
  assert.equal(register.mock.callCount(), 0);
});

for (const failedImport of ['chart.js', 'react-chartjs-2']) {
  test(`a failed ${failedImport} import can be retried by another lazy chart factory`, async (context) => {
    // Isolate the wrapper's promise and lazy instances from the successful-load test.
    const moduleUrl = new URL('../src/lib/chartRuntime.ts', import.meta.url);
    moduleUrl.searchParams.set('retry', failedImport);
    let attempts = 0;
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        if (context.parentURL === moduleUrl.href && specifier === failedImport && ++attempts === 1) {
          throw new Error('Transient chart chunk failure');
        }
        return next(specifier, context);
      },
      load(url, context, next) {
        if (url === moduleUrl.href) return next(new URL('../src/lib/chartRuntime.ts', import.meta.url).href, context);
        return next(url, context);
      },
    });
    context.after(() => hooks.deregister());
    const components = await import(moduleUrl.href);
    await assert.rejects(renderCharts(components, ['Bar']), /Transient chart chunk failure/);
    assert.equal(attempts, 1);

    const html = await renderCharts(components, ['Doughnut', 'Line']);
    assert.equal((html.match(/<canvas/g) || []).length, 2);
    assert.equal(attempts, 2);
    // Resetting the shared loader does not reset React.lazy's own rejection cache.
    await assert.rejects(renderCharts(components, ['Bar']), /Transient chart chunk failure/);
    assert.equal(attempts, 2);
  });
}
