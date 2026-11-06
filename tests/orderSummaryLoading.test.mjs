import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the actual request callback without mounting the full orders page.
const source = ts.createSourceFile('Orders.tsx', readFileSync(new URL('../src/pages/Orders.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'loadSummaryCounts') {
    assert.ok(node.initializer && ts.isCallExpression(node.initializer));
    callback = node.initializer.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback, 'The summary request callback must exist');
const callbackSource = ts.transpileModule(`(${callback.getText(source)})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const createLoader = new Function('dependencies', `const {
  fetchSummaryCounts, summaryCountsRequestIdRef, hasSuccessfulSummaryCountsRef,
  setSummaryCountsError, setSummaryCountsLoadingRequestId, setSummaryCounts, console,
} = dependencies; return ${callbackSource}`);

function setup(fetchSummaryCounts, counts = null) {
  const state = { loading: !counts, error: '', counts };
  let loadingRequestId = counts ? null : 0;
  const transitions = [];
  const load = createLoader({
    fetchSummaryCounts,
    summaryCountsRequestIdRef: { current: 0 },
    hasSuccessfulSummaryCountsRef: { current: !!counts },
    setSummaryCountsError(error) { state.error = error; },
    setSummaryCountsLoadingRequestId(update) {
      const next = typeof update === 'function' ? update(loadingRequestId) : update;
      if (next === loadingRequestId) return;
      loadingRequestId = next;
      state.loading = next !== null;
      transitions.push(state.loading);
    },
    setSummaryCounts(counts) { state.counts = counts; },
    console: { error() {} },
  });
  return { state, transitions, load };
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('summary loading clears after a successful initial request', async () => {
  const counts = { paid: 2, pending: 1, completed: 3 };
  const fixture = setup(async () => counts);
  await fixture.load();
  assert.deepEqual(fixture.transitions, [true, false]);
  assert.deepEqual(fixture.state, { loading: false, error: '', counts });
});

test('summary loading clears when the initial request rejects or throws synchronously', async () => {
  for (const fetch of [async () => { throw new Error('Offline'); }, () => { throw new Error('Synchronous failure'); }]) {
    const fixture = setup(fetch);
    await fixture.load();
    assert.deepEqual(fixture.transitions, [true, false]);
    assert.equal(fixture.state.loading, false);
    assert.equal(fixture.state.error, 'Order totals are temporarily unavailable.');
    assert.equal(fixture.state.counts, null);
  }
});

test('failed background summary refresh preserves the last successful counts', async () => {
  const counts = { paid: 2, pending: 1, completed: 3 };
  const fixture = setup(async () => { throw new Error('Offline'); }, counts);
  await fixture.load();
  assert.deepEqual(fixture.transitions, []);
  assert.deepEqual(fixture.state, { loading: false, error: '', counts });
});

for (const staleOutcome of ['resolve', 'reject']) {
  test(`an older request that ${staleOutcome}s cannot clear the latest request's loading flag`, async () => {
    const first = deferred();
    const second = deferred();
    let requests = 0;
    const fixture = setup(() => ++requests === 1 ? first.promise : second.promise);
    const oldRequest = fixture.load();
    const currentRequest = fixture.load();
    if (staleOutcome === 'resolve') first.resolve({ paid: 99 });
    else first.reject(new Error('Old request failed'));
    await oldRequest;
    assert.equal(fixture.state.loading, true);
    assert.equal(fixture.state.counts, null);
    assert.equal(fixture.state.error, '');

    const counts = { paid: 2, pending: 1, completed: 3 };
    second.resolve(counts);
    await currentRequest;
    assert.deepEqual(fixture.state, { loading: false, error: '', counts });
    assert.deepEqual(fixture.transitions, [true, true, false]);
  });
}
