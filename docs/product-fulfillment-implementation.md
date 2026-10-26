# Product configuration and fulfillment implementation

Date: 26 October 2026.

**BACKEND INTEGRATION NOT LIVE-VERIFIED.** All mutation verification used mocks, including an isolated real browser. No production products, categories, payments, orders, emails or shipments were changed. A passing mock proves frontend behavior, not deployed backend persistence or storefront rendering.

## Architecture reviewed

Reviewed README, both supplied requirement documents, authentication context, shared Axios client, product/category/order services, product name/slug/description/image utilities, shared types, product create/edit flows, category create/edit/delete/list flows, order normalization/details/approval, and the Shiprocket workspace. The working tree was clean before implementation. No AGENTS.md guidance or existing test framework was found.

The shared Axios client owns bearer cookies, token refresh, session expiry and the configured API base. These mechanisms were preserved. Creation already uses a text-only multipart POST followed by a multipart PATCH for gallery images and optional variant mockups. This two-request flow remains intact. Product edits are partial multipart PATCH requests. Shipment synchronization remains an explicit admin action; opening order details does not initiate it.

## Completed steps and verification

1. Added shared types, nested validation, multipart serialization and focused tests. Verified seven tests and TypeScript before integrating forms.
2. Added configuration and package sections to existing product modals, plus fresh backend read-back verification. Verified twelve tests and TypeScript before changing categories.
3. Fixed category selection by ID and removed automatic frontend slug generation. Verified sixteen tests and TypeScript before integrating order presentation.
4. Added an honest order-parcel limitation section, backend delivery-charge display and selected-option array support. Verified twenty automated tests, TypeScript, production build and real-browser checks with intercepted APIs.

The browser checks found a standard-order display gap: selected options were normalized but only displayed for customized orders. Standard and customized order details now share the selected-option presentation.

## Features and status

| Requirement | Result | Status |
| --- | --- | --- |
| Standee options | Product-specific select fields, labels, stable keys, required/active states, options, modifiers and active options | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Menu Card options | Same reusable editor; configurations remain specific to each product | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Visiting Card sides | Admin can create `printingSides` with explicit option values/modifiers; no automatic surcharge or presets | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Configuration create/edit | JSON multipart fields; saved fields prepopulate; existing keys are locked; category changes retain unsaved configuration | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Product package defaults | Four optional measurements, validated together; positive finite numbers, explicit kg/cm, decimal precision | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Duplicate category names | Names unchanged; IDs distinguish assignments; slug generation delegated to backend unless explicitly edited | IMPLEMENTED — BACKEND VERIFICATION PENDING |
| Order parcel UI | Reusable measurement display, disabled save with explanation; no fabricated save state | PARTIALLY IMPLEMENTED — BACKEND BLOCKER |
| New parcel-before-approval gate | No verified order-level save API; existing approval remains available | PARTIALLY IMPLEMENTED — BACKEND BLOCKER |
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
| `POST /admin/products` | Existing multipart scalar/pricing fields plus optional JSON `configuration` and `packageDetails` | Preserve text-first creation; reject explicit `success:false`; obtain returned product ID; upload gallery/variants through existing PATCH |
| `PATCH /admin/products/:id` | Existing multipart fields plus edited JSON nested fields | Preserve quantity pricing, partial updates and file uploads; edited gallery uses `productImages`, matching the existing creation PATCH contract |
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

## UI

`ProductConfigurationFields` and `PackageDetailsForm` extend existing modals using the dashboard’s CSS variables, form controls and buttons. They wrap on small screens and work in dark/light themes. Numeric inputs retain blank states, labels include units, errors announce themselves, and nested editors disable during saves. Product edit disables its form while saving/verifying, and create/edit have synchronous submission guards. Saved field removal asks for confirmation because customer selections may reference its key.

`OrderParcelDetails` renders disabled controls and a disabled save button with an explicit explanation. Values appear only when a valid `packageDetails` object is actually returned on that order; this does not assert that Shiprocket consumed it. There is no localStorage parcel persistence and no edit to global product defaults on an order’s behalf.

## Changed files

| File | Purpose |
| --- | --- |
| `src/types.ts` | Product configuration/option/field and package interfaces; optional product/payload fields |
| `src/lib/productConfiguration.ts` | Nested validation, canonical payloads, package drafts, response lookup and persistence comparison |
| `src/lib/categoryOptions.ts` | ID-based duplicate-name resolution, contextual titles and actionable backend errors |
| `src/lib/orderPresentation.ts` | Safe display normalization for returned parcels, shipping charges and selected options |
| `src/components/ProductConfigurationFields.tsx` | Reusable per-product select configuration editor |
| `src/components/PackageDetailsForm.tsx` | Reusable labeled measurement controls |
| `src/components/OrderParcelDetails.tsx` | Explicit unavailable order-save UI |
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
| `tests/browser-smoke.mjs` | Real Chromium checks against built app with every external request intercepted |
| `README.md` | Feature and verification notes with link to this report |
| `docs/product-fulfillment-implementation.md` | This implementation report and exact backend gaps |

## Checks and limits

- Baseline: `npm run lint` passed. Initial sandbox build could not read parent directories; the approved build outside the sandbox passed.
- `npm test`: 26 focused automated tests passed. Tests use Node 24 and the installed TypeScript compiler, with no added dependencies. This includes full/short pagination cases for both `docs` and `data.docs` product listings and saved/new option identifier rendering.
- `npm run lint`: TypeScript passed.
- `npm run build`: production build passed. The existing >500 kB main-chunk advisory remains; it was present before these changes.
- `npm run test:browser`: passed against an isolated headless Edge browser with mocked API interception. Covers product creation with image upload/configuration/measurements; product editing and reload; adding/removing fields and unsaved options; disabled saved-option removal while its active toggle remains usable; duplicate-key validation before any mutation; stable saved keys and option values; new option identifiers remaining editable; active-only category assignments with the current inactive category retained; switching category without losing inputs; distinct duplicate-name category assignment; duplicate category creation with an assertion that the parsed POST request omits the `slug` key; warning when the backend ignores edited configuration; read-only order parcel UI; backend delivery-charge/selected-option display; and existing paid-order approval without shipment auto-sync. The PASS message is printed only after the final browser-error and shipment assertions.
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
- Frontend status: reusable form/types/validation and honest disabled order section complete; approval gate intentionally inactive.
- Recommended change: publish/deploy the contract and enforce valid persisted measurements server-side before initiating Shiprocket. Frontend can then save, refetch and verify before enabling the new flow. Product defaults must not substitute for actual multi-item order parcel data.

### Product nested multipart persistence

- Feature: configuration/packageDetails persistence.
- Endpoints: existing POST/PATCH `/admin/products` and `/admin/products/:id`.
- Expected request: existing multipart payload plus JSON-serialized documented objects under `configuration` and `packageDetails`.
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
