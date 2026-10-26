# Product configuration and fulfillment implementation

Date: 26 October 2026.

**BACKEND INTEGRATION NOT LIVE-VERIFIED.** All mutation verification used mocks, including an isolated real browser. No production products, categories, payments, orders, emails or shipments were changed. A passing mock proves frontend behavior, not deployed backend persistence or storefront rendering.

## Architecture reviewed

Reviewed README, both supplied requirement documents, authentication context, shared Axios client, product/category/order services, product name/slug/description/image utilities, shared types, product create/edit flows, category create/edit/delete/list flows, order normalization/details/approval, and the Shiprocket workspace. The working tree was clean before implementation. No AGENTS.md guidance or existing test framework was found.

The shared Axios client owns bearer cookies, token refresh, session expiry and the configured API base. These mechanisms were preserved. Creation already uses a text-only multipart POST followed by a multipart PATCH for gallery images and optional variant mockups. This two-request flow remains intact. Product edits are partial multipart PATCH requests. Shipment synchronization remains an explicit admin action; opening order details does not initiate it.

## Completed steps and verification

1. Added shared types, nested validation, multipart serialization and focused tests. Verified seven tests and TypeScript before integrating forms.
2. Added product configuration and fresh backend read-back verification. Parcel inputs were subsequently moved out of both product forms into the order View modal at the user's request; existing product package data remains untouched.
3. Fixed category selection by ID and removed automatic frontend slug generation. Verified sixteen tests and TypeScript before integrating order presentation.
4. Added the order-scoped Parcel → Courier quotes → Approval UI, backend delivery-charge display and selected-option array support. Actual order measurements can be entered and validated locally; backend save/quote/courier-approval actions remain unavailable until the contract is connected.

The browser checks found a standard-order display gap: selected options were normalized but only displayed for customized orders. Standard and customized order details now share the selected-option presentation.

## Features and status

| Requirement | Result | Status |
| --- | --- | --- |
| Standee options | Product-specific select fields, labels, stable keys, required/active states, options, modifiers and active options | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Menu Card options | Same reusable editor; configurations remain specific to each product | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Visiting Card sides | Admin can create `printingSides` with explicit option values/modifiers; no automatic surcharge or presets | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Configuration create/edit | JSON multipart fields; saved fields prepopulate; existing keys are locked; category changes retain unsaved configuration | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Product package inputs | Removed from create/edit forms as requested; existing backend package values are preserved | IMPLEMENTED AND VERIFIED |
| Duplicate category names | Names unchanged; IDs distinguish assignments; slug generation delegated to backend unless explicitly edited | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Order parcel UI | Editable four-field form for paid pending orders; courier service/charge/estimate selection UI; confirmation stage, validation, pending/error/loading/read-only states | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| New parcel-before-approval gate | New courier-based confirmation remains disabled without backend save/quote/approval integration; existing approval remains separately labelled | PARTIALLY IMPLEMENTED — BACKEND BLOCKER |
| Approval and Shiprocket lifecycle | Existing request sequence/payloads preserved; regression checks use mocks | IMPLEMENTED AND VERIFIED for frontend contract preservation; live fulfillment not verified |
| Customer delivery fee | Show order `shippingCharge` when returned, including zero; never recompute/add fees to paid totals | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Customer checkout/cart | Storefront and backend are outside this admin repository | NOT IMPLEMENTED here; backend/storefront work required |

The configuration editor is available for all products, including products with existing configurations. Contextual Standee/Menu Card/Visiting Card titles use category names, slugs, aliases and parent IDs/metadata when supplied. No category IDs, option sets, measurements or surcharges are hardcoded into application behavior.

Disabling configuration retains its fields. Saved option values are locked along with saved field keys; a different option identifier requires a new option. Saved options cannot be removed: their Remove button is disabled and its handler also rejects removal. Administrators can mark them inactive instead. Unsaved options remain removable. Labels, prices and active states remain editable. Required active fields in enabled configurations need at least one active option. Duplicate keys/option values, missing labels/identifiers, unsupported types, invalid nested shapes and non-finite modifiers fail validation. Malformed saved configurations are shown as unsupported and remain untouched during unrelated edits. New/legacy products do not receive empty nested values unless the admin explicitly configures them. Untouched edit fields are omitted according to partial-PATCH semantics; package removal has no documented contract and is deliberately not submitted as an empty object.

Product edit assignments use active category metadata exclusively. The edited product's existing category remains available as a fallback even when inactive or absent from metadata; product-derived category names are used for display only. Save validation also rejects other unlisted/inactive category IDs.

## API integration

All paths below are relative to the existing `/api/v1` base, authenticated through the unchanged shared client.

| Method and endpoint | Request | Handling and verification |
| --- | --- | --- |
| `POST /admin/products` | Existing multipart scalar/pricing fields plus optional JSON `configuration`; no parcel measurements from the form | Preserve text-first creation; reject explicit `success:false`; obtain returned product ID; upload gallery/variants through existing PATCH |
| `PATCH /admin/products/:id` | Existing multipart fields plus edited JSON configuration; no package updates | Preserve existing backend package values, quantity pricing, partial updates and file uploads; edited gallery uses `productImages`, matching the existing creation PATCH contract |
| `GET /admin/products` | Existing `page` and `limit` parameters | Fresh read after saving new nested fields; locate the saved ID and compare documented fields, ignoring nested server metadata. A missing/mismatched field or unavailable read produces a warning, never full success |
| `POST /admin/categories` | Existing multipart name/description/isActive, optional explicit slug | No hidden name markers or automatic name/slug suffix; backend must generate unique slug; explicit `success:false` is rejected |
| `PATCH /admin/categories/:id` | Existing JSON patch; slug only when explicitly changed | Preserve existing slug during unrelated name edits; ID identifies the selected duplicate; duplicate-key errors remain visible |
| `DELETE /admin/categories/:id` | Existing delete by ID | Reject explicit failure, remove selected ID and refetch categories |
| `GET /admin/orders` | Existing filters | Read only explicitly returned `shippingCharge` and valid order-level `packageDetails`; display selected options from maps or documented `{key,value}[]` arrays |
| `PATCH /admin/orders/:id/approve` | Existing request without a parcel payload | Unchanged; no unsupported fields or new gate |
| `POST /shipments/:id/sync-shipment` | Existing `{approveOrder:true}` | Unchanged explicit action; no new automatic creation/retries |
| Existing shipment details/track/pickup/label/manifest/cancel routes | Existing request fields | Preserved; existing service route and AWB handling covered by focused mocked checks |

Nested multipart encoding follows the existing `quantityPricing` JSON convention. The new PRD supplies JSON object shapes but does not explicitly confirm the deployed multipart parser supports them. Runtime read-back verification exposes that distinction. If read-back fails after a mutation, the UI reports that the product save occurred but nested persistence remains unconfirmed and refreshes/closes rather than inviting duplicate product creation.

Read-back uses the documented listing route rather than inventing a detail route. It searches bounded pages, stopping on a short/unknown list shape. Products absent from those pages yield an unverified warning. Comparison currently expects documented numeric/boolean/object response types; other backend shapes require a confirmed normalization contract.

Each read-back request explicitly includes `_ts: Date.now()`, matching product-list requests. The shared Axios request interceptor already adds `_ts` to all GET requests and preserves an explicitly supplied value; the service parameter makes this behavior explicit and testable even with a mocked client.

A read-only, unauthenticated probe of deployed `GET /admin/products?page=1&limit=1` on 26 October 2026 returned `401 Unauthorized`, `Cache-Control: public, max-age=0, must-revalidate`, `Age: 0`, and `X-Vercel-Cache: MISS`. These headers describe that error response: they do not confirm that authenticated product listings return cached or stale data. The cache policy and cache-hit behavior of successful authenticated listings remain unverified. No authentication or production mutation was performed for this probe.

## UI

`ProductConfigurationFields` extends existing product modals using the dashboard's CSS variables, form controls and buttons. Parcel inputs are absent from both create/edit product forms. Product edit disables its form while saving/verifying, and create/edit have synchronous submission guards. Saved field removal asks for confirmation because customer selections may reference its key.

`OrderParcelDetails` appears full-width inside Orders → View, before the existing Shiprocket workspace and approval actions. It contains three steps: actual packed parcel measurements; available courier providers/services with backend-returned delivery charges and estimates; and selected-courier confirmation/approval. The four labeled kg/cm numeric controls are editable for paid, pending (`placed`) orders and validate positive finite measurements. Inputs start blank unless actual order-level values are returned. Approved, shipped, cancelled and unpaid orders are read-only. The layout uses two columns on desktop and stacks on mobile.

The production page does not supply a fulfillment adapter because no backend contract is documented. Save, quote and courier-based approval buttons remain disabled, no courier/rate data is fabricated, and entered values are explicitly unsaved. Drafts belong to the open order modal and reset on close; no localStorage or product updates are used. Existing approval remains separately available as `Approve Order (existing flow)` with text explaining that it does not save measurements or select a courier. Existing delivery-estimate and shipment actions are retained.

The optional `OrderFulfillmentAdapter` boundary and courier types in `src/lib/orderFulfillment.ts` are frontend integration models, not assertions about an existing backend API. Once an actual service implementation is supplied, the UI handles loading, save verification, rates, no available services, selection, failed requests, quote expiry and confirmation. Changed measurements invalidate saved/quoted UI state and clear the selected courier. Quotes must match the order and parcel. Approval submits the quote identifier, courier identifier and same parcel values; no frontend price is submitted. Backend enforcement remains required.

## Changed files

| File | Purpose |
| --- | --- |
| `src/types.ts` | Product configuration/option/field and package interfaces; optional product/payload fields |
| `src/lib/productConfiguration.ts` | Nested validation, canonical payloads, package drafts, response lookup and persistence comparison |
| `src/lib/categoryOptions.ts` | ID-based duplicate-name resolution, contextual titles and actionable backend errors |
| `src/lib/orderPresentation.ts` | Safe display normalization for returned parcels, shipping charges and selected options |
| `src/lib/orderFulfillment.ts` | Frontend adapter/view models; parcel/save/quote validation; matching order and parcel; expiry and courier-selection guards |
| `src/components/ProductConfigurationFields.tsx` | Reusable per-product select configuration editor |
| `src/components/PackageDetailsForm.tsx` | Reusable actual-order measurement controls with labels, units and blur validation |
| `src/components/OrderParcelDetails.tsx` | Full order parcel/courier/approval UI with explicit backend-pending behavior |
| `src/components/CreateProductModal.tsx` | New form sections, nested POST serialization, read-back verification and submission guard |
| `src/pages/Products.tsx` | Edit prepopulation, dirty-field serialization, ID category selector, pending state and verified-save messaging |
| `src/services/productService.ts` | Fresh nested persistence verification using existing GET route |
| `src/components/CreateCategoryModal.tsx` | Delegate slug generation to server; expose duplicate-key errors |
| `src/components/EditCategoryModal.tsx` | Preserve slug until explicitly edited; expose duplicate-key errors |
| `src/services/categoryService.ts` | Omit undefined fields and reject explicit backend failures |
| `src/pages/Categories.tsx` | Show slug/ID and refresh after deletion |
| `src/pages/Orders.tsx` | Parcel section, backend delivery charge and selected options in standard/customized details |
| `src/index.css` | Responsive theme-aware styles for new sections |
| `package.json` | Dependency-free Node test commands and optional browser command |
| `tests/register.mjs` | Load TS/TSX through installed compiler; isolate shared client with mocks |
| `tests/mockApiClient.mjs` | In-memory request stubs, only in tests |
| `tests/productConfiguration.test.mjs` | Validation, serialization, field preservation and persistence mismatches |
| `tests/productService.test.mjs` | Multipart methods/paths and read-back success/failure |
| `tests/productForms.test.mjs` | Rendered saved fields, stable keys, unit labels and accessible errors |
| `tests/categoryManagement.test.mjs` | Duplicate names, ID CRUD/assignment, slug omission and backend rejection |
| `tests/orderIntegration.test.mjs` | Order presentation, unavailable parcel save and unchanged shipment service contracts |
| `tests/orderFulfillment.test.mjs` | Mocked verified-save/quote sequencing, order/parcel matching, expiry, service pricing and final approval selection |
| `tests/browser-smoke.mjs` | Real Chromium checks against built app with every external request intercepted |
| `tests/browserCleanup.test.mjs` | Exercises the harness cleanup and diagnostics with failed CDP/DevTools calls and closed sockets; checks original errors and pending timer cleanup |
| `README.md` | Feature and verification notes with link to this report |
| `docs/product-fulfillment-implementation.md` | This implementation report and exact backend gaps |

## Checks and limits

- Baseline: `npm run lint` passed. Initial sandbox build could not read parent directories; the approved build outside the sandbox passed.
- `npm test`: 41 focused automated tests passed. Tests use Node 24 and the installed TypeScript compiler, with no added dependencies. Includes parcel validation; paid-pending eligibility; save-before-quote sequencing; failed/mismatched saves; quote failures; same-order and same-parcel enforcement; expired quotes; missing selection; invalid or duplicate courier rates; backend-pending UI; read-only orders; courier name/service/charge/estimate rendering; configuration persistence and cache-busting regressions; and four browser-harness cleanup/error-preservation cases. `node --check tests/browser-smoke.mjs` also passed after the cleanup change; the UI browser suite was not rerun for that test-only change.
- `npm run lint`: TypeScript passed.
- `npm run build`: production build passed. The existing >500 kB main-chunk advisory remains; it was present before these changes.
- `npm run test:browser`: checks product configuration/image flows without parcel inputs or package writes; preservation of existing product package data; saved-option protections; category restrictions and slug omission; order-only parcel entry and numeric validation; no invented courier rows; save/quote/courier-approval buttons disabled while backend is pending; no parcel write or shipment creation on local entry; draft reset after closing/reopening the order; approved-order read-only controls; existing approval; and dark/light responsive layouts. PASS is printed only after the final browser-error and shipment assertions. Courier response/selection rendering and adapter sequencing use focused mocked tests; live provider integration is not verified.
- Dark desktop (1440px) and light mobile (390px) screenshots were visually inspected; mobile modal overflow assertion passed. Screenshots are generated in the OS temporary directory `inkart-ui-checks`.
- Authentication/session code, dashboard, analytics, coupons and customer CRUD were not changed. Their source compiled in the production build; their live workflows were not exercised. Login itself was not live-tested; browser tests inject an isolated fake admin cookie that only reaches intercepted mock responses.
- Real Shiprocket booking, duplicate-shipment guarantees, delayed AWB assignment, pickup, label/manifest downloads, cancellation, Razorpay checkout and storefront rendering were not live-verified. Existing UI/service behavior was retained; mocked route checks do not establish provider side effects.

To rerun browser checks, build the app, start an isolated headless Chromium browser with a temporary profile and `--remote-debugging-port=9229`, then run `npm run test:browser`. Override `BROWSER_DEBUG_URL` if needed. The script serves `dist` on localhost:4175, intercepts all external browser requests, and returns the page to `about:blank` before disconnecting.

## Backend developer actions

### Order-specific parcel persistence and approval gate

- Feature: Save actual packed order measurements before approval/shipment.
- Endpoint: **Unknown; no order-parcel save method/path is documented.** Existing approval and shipment routes do not document measurement fields.
- Missing capability: authenticated order-scoped save/read contract; how measurements become locked/consumed; backend validation and atomic enforcement before shipment; treatment of legacy/already-approved/shipped/cancelled orders; idempotent shipment handling.
- Expected request: **Proposal only**, `{packageDetails:{weight,length,breadth,height}}`, weight in kg, dimensions in cm. All four values positive and finite. Backend must specify the actual route, method, content type and authorization.
- Expected response: **Proposal only**, return the saved measurements on an identified order and expose them in an existing order/shipment read response; backend must define actual response properties and whether saving/approval starts any shipment work.
- Current observed behavior: repository integrations send no measurements to approval/sync; there is no documented save contract. No live request was made to probe unsupported fields.
- Frontend status: order View form, validation, courier quote/selection presentation and confirmation UI complete. Pending backend state disables new save/quote/approval actions while permitting local entry for eligible orders. Existing approval is kept separately. No actual service implementation is bound to the optional adapter.
- Recommended change: publish/deploy the contract and enforce valid persisted measurements server-side before initiating Shiprocket. Frontend can then save, refetch and verify before enabling the new flow. Product defaults must not substitute for actual multi-item order parcel data.

The backend also needs a non-booking quote operation and an atomic selected-courier approval operation. Exact routes/methods remain **unknown**. Suggested quote information is a proposal: an order-bound quote identifier, saved parcel snapshot, expiration, currency, and available courier/service identifiers, names, total delivery charges and optional delivery estimates. The frontend adapter maps the actual response into `OrderCourierQuotes`. Suggested approval input is also a proposal: the order, quote and selected courier identifiers plus the saved parcel snapshot. The server must reject stale quotes, changed parcels, invalid/unavailable couriers and ineligible orders, and initiate fulfillment only once with that same parcel and selected service. It must define total-charge inclusions (tax/fees), read-back persistence, quote expiry, and whether approval creates a booking/AWB. Browser code must never make private Shiprocket API calls directly.

### Product nested multipart persistence

- Feature: configuration persistence and preservation of pre-existing product package data.
- Endpoints: existing POST/PATCH `/admin/products` and `/admin/products/:id`.
- Expected request: existing multipart payload plus JSON-serialized `configuration`. Current product forms omit `packageDetails`; actual parcel entry is order-scoped.
- Expected response: existing product response/listing containing the same documented object fields. No new response envelope is required by this frontend.
- Current observed behavior: safe mocked round trips pass; deployed multipart decoding/persistence remains unverified.
- Frontend status: implemented, including warning when a fresh read omits/changes submitted objects.
- Recommended change: confirm multipart JSON parsing and partial update semantics on the deployed backend; ensure gallery PATCH does not reset existing configuration/package data; expose the nested objects on product listings or document a supported detail-read route.

### Duplicate category names

- Feature: create/recreate categories with identical display names.
- Endpoints: existing POST/PATCH/DELETE `/admin/categories` routes.
- Missing capability if duplicate-key rejection remains: removal of any old unique name index and generation of unique slugs server-side.
- Expected request: existing name/description/isActive fields, no special duplicate flag and no client-generated default slug.
- Expected response: normal category record with a distinct ID and unique slug; actual existing envelopes remain supported.
- Current observed behavior: mocked duplicate/create/delete/recreate checks pass; deployed duplicate behavior was not probed.
- Frontend status: ID-based workflows implemented; backend errors are shown, never bypassed by hidden names or arbitrary suffixes.
- Recommended change: verify/remove the old database name index and confirm unique slug generation, including soft-deleted categories.

### Customer fee and storefront selections

- Feature: ₹99 once per order if any cart item’s unit price is strictly below ₹499; printing-side modifiers included in checkout.
- Endpoint: checkout route remains unspecified in the supplied document and is outside this admin app. The documented cart endpoint is `POST /cart/items` with `{productId,quantity,selectedOptions:[{key,value}]}`.
- Missing capability to verify: backend-owned cart pricing and checkout calculation, saved order shipping charge, storefront configuration consumption.
- Expected request/response: follow the existing storefront/checkout contract; do not invent an admin payment mutation. Expose the saved `shippingCharge` on orders for display.
- Current observed behavior: admin displays returned `shippingCharge` and selected option keys/values; no amount is recalculated or added to existing payments.
- Frontend status: admin configuration and read-only presentation complete. Storefront/cart/checkout changes are outside the available repository.
- Recommended change: confirm backend unit-price threshold, once-per-order application and modifier inclusion in Razorpay totals, then verify storefront selection submission against saved admin configuration.
