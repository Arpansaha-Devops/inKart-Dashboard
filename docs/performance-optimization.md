# Frontend performance investigation — 30 October 2026

The loading delay had several frontend contributors:

- The entry bundle eagerly included most pages: 715.50 KB minified / 209.82 KB gzip.
- Dashboard data rendering waited for six requests together, including two identical paid-orders requests. One slow activity endpoint blocked both charts.
- Chart rendering followed nested dynamic imports that started only after the data was ready.
- All GET requests received unique timestamps, and page remounts fetched identical data again. Development Strict Mode could also start duplicate reads.
- Customers applied its 300 ms search debounce to the initial unfiltered page load.

Two read-only public products requests to the live backend returned 200 in 1,179 ms and 826 ms, with 20,833-byte responses. The authenticated orders route returned 401 without a session. These checks establish real network latency for public products; they do **not** measure authenticated admin database queries or establish a production latency distribution. No login/OTP or live mutations were performed.

## Changes

Pages now load on demand. Sidebar hover, keyboard focus, and touch start prefetch the requested page's code without fetching its data. Chart routes start their renderer downloads alongside their API requests. The shared Chart.js runtime registers only the chart features used here.

Dashboard users, product/category charts, coupons, and activity load independently. Both activity views reuse a single normalized orders response. Existing chart values, matching rules, labels, tooltips, themes, forms, payloads, and business rules are retained. Background dashboard refreshes do not overlap or poll hidden tabs, and completed requests cannot update an unmounted dashboard.

Following the freshness review, the original 15-second response cache has been removed. `src/lib/apiReadCache.ts` retains its filename but now provides **in-flight request sharing only**:

- No completed responses are stored, even briefly. Every read after an earlier read finishes calls the backend again, including immediate page revisits and changes made by another admin.
- Only concurrent identical list/summary reads share transport. Sharing requires the same API URL, sorted query parameters, and authorization session; callers receive independent response data.
- Each actual GET receives a unique `_ts` nonce to bypass browser/CDN URL-cache reuse. Caller-owned parameters remain unchanged, including product verification inputs.
- Writes invalidate pending sharing before dispatch and after settlement, including failed writes. A read requested during a write waits for settlement. A response that crossed a write is refetched rather than passed to the UI. Retries are bounded under repeated edits; exhausted retries report cancellation instead of delivering an outdated response.
- Account/token changes reject old-account responses; 401 responses clear pending sharing. Nothing is saved to localStorage or sessionStorage.
- The existing `readCache: false` option now starts a separate current network request. Verification reads also supersede pending work. Requests with cancellation signals and shipment/detail reads never share transport.
- GETs retain the 20-second timeout. Failed requests never provide a cached fallback through this adapter.

The adapter now generates timestamps at transport time, so regular callers need not add them. Product verification service calls still explicitly request fresh reads. Customer typing remains debounced, while an empty search starts immediately. Customer requests now have sequence guards so a late response for an earlier search/page cannot overwrite the current results or loading state. No dependencies were added. Vite's alias uses an ESM-compatible file URL, allowing its alternate config loader to work within the filesystem sandbox.

## Measurements

Production builds, isolated headless Chrome, HTTP cache disabled, mocked external requests. List/chart APIs were delayed by 200 ms, and the orders feed by 1,800 ms. These are controlled regression measurements, not deployed performance promises. The chart measurement ends when both chart canvases mount; it does not include completion of Chart.js's existing animations.

| Measurement | Before | After |
| --- | ---: | ---: |
| Both dashboard chart canvases mounted | 2,579 ms | 1,020 ms |
| Products revisited, waiting for a fresh API read | 225 ms | 273 ms |
| New product API reads on that revisit | 1 | 1 |
| Dashboard activity API reads | 2 | 1 |
| Main JavaScript, minified | 715.50 KB | 424.85 KB |
| Main JavaScript, gzip | 209.82 KB | 137.50 KB |
| Chart runtime, minified | 208.27 KB | 185.38 KB |

Charts appeared while orders were still pending. Total page JavaScript is split across routes; bundle splitting reduces startup work rather than removing every page's code. The earlier 7 ms revisit result relied on the now-removed response cache and no longer applies. Revisits intentionally wait for the backend to prioritize current data. The browser check changes the server fixture while Products is unmounted and verifies that the next visit renders the changed name without any local mutation or invalidation signal.

Fresh network reads obtain the data the backend returns at request time. They cannot make an already-open page aware of external changes immediately: the backend has no live update subscription here. Dashboard and Orders retain their existing 30-second refresh cycles; other pages update on their existing load/refresh/action triggers. Existing UI error handling may retain prior displayed values if a fresh request fails. Those values are not treated as new responses by this adapter. Backend database consistency, internal server caches, and instant cross-admin updates cannot be guaranteed by the frontend.

## Verification

- `npm test`: 70 tests pass, including immediate external changes, pending request deduplication, unique request URLs, query separation, response isolation, auth changes, forced refresh, failed requests, and read/write races.
- `npm run lint`: passes TypeScript checking.
- `npm run build -- --configLoader runner`: passes the production build. The alternate loader avoids the default config bundler's sandbox access failure; the output is a regular Vite production build.
- `npm run test:performance`: checks independent charts under slow activity/coupon responses, external changes on repeat navigation, unique GET URLs, Analytics rendering, explicit Refresh, and out-of-order customer search results. Requires isolated Chromium exposing DevTools on port 9229, or `BROWSER_DEBUG_URL`.
- `npm run test:browser`: existing product/category, gallery persistence, courier/approval, error handling, and dark/light responsive browser checks pass with mocked APIs.

Changes are local and have not been deployed. Authenticated live API timing and deployed-network performance remain to be measured with an authorized admin session after deployment.
