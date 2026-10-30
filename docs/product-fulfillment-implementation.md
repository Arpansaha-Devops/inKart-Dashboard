# Product configuration and fulfillment implementation

Date: 26 October 2026. Order courier integration updated: 30 October 2026.

The new `inkart_admin_order_shiprocket_payloads.md` and enhanced implementation prompt now supply the order courier endpoints. Save/quote and courier confirmation are connected through the shared API client. The previous placeholder adapter has been replaced with the actual contract described below. No live shipment or wallet charge was triggered during verification.

Product-form update, 27 October 2026: filters are authored per product in Create Product after category selection. Category-wide filter persistence is not documented and was not introduced. The modal now orders product information, category/options, common quantity pricing, description and images; optional inventory/mockups are collapsible. Category switches keep separate unsaved product-filter drafts and restore them when returning. See [API integration](#api-integration) for payload compatibility and backend/storefront limitations.

**BACKEND INTEGRATION NOT LIVE-VERIFIED.** All mutation verification used mocks, including an isolated real browser. No production products, categories, payments, orders, emails or shipments were changed. A passing mock proves frontend behavior, not deployed backend persistence or storefront rendering.

## QA audit — 30 October 2026

The four measurements (weight in kg; length, breadth and height in cm) belong to the entire packed order. Every order View modal renders its own measurement section, independently of product/category. Paid, unbooked orders in placed/confirmed/processing state can enter measurements; booked, unpaid and closed orders have read-only controls. Measurements are absent from product forms. Product filter labels/options remain specific to each product; quantity pricing is common to all product forms.

Baseline: all 47 existing tests and TypeScript passed. Added failing regressions before fixing the following issues:

| Reproduced failure | Fix and verification |
| --- | --- |
| Product edit and stock-adjustment inputs changed `1.5` to `1` | Preserve the full number and reject fractions before sending a request; edit errors appear inline; the browser checks both forms, including submit-event validation |
| A numeric-string stock response failed the new edit validation | Normalize the saved stock when prepopulating the edit form; saving and reopening continue to work |
| Two rapid stock submissions sent two PATCH requests | Synchronous request guard, pending state and locked controls; a delayed mock response verifies exactly one request, then successful retry/add/subtract behavior |
| HTTP 200 with `success:false` was treated as successful approval or stock update | Reject explicit root/nested failures and preserve backend messages; booking reports partial approval failure without booking again; rejected stock changes keep the modal open |

Final checks: **49 automated tests passed**, TypeScript passed, production build passed, and the full mocked browser suite passed. Browser coverage includes product create/edit and image upload, common quantity pricing, arbitrary filter keys/options/decimal modifiers, delayed category lookup, saved option locks, inactive/duplicate categories, selected customer options, separate parcel values for two orders, numeric payloads and exact courier ID types, quote errors/empty/loading/retry states, cancellation, stale-selection clearing, duplicate submissions, approval skipping/recovery, isolated result toasts, existing label controls, and dark desktop/light mobile layouts. The existing main-bundle size advisory remains.

A **read-only live check** of [GET /api/v1/products?page=1&limit=10](https://inkart-virid.vercel.app/api/v1/products?page=1&limit=10) returned HTTP 200 and `success:true`. All four returned products exposed structurally valid configuration objects and quantity-pricing arrays. Three contained two fields/four options each; one had no configured fields. This confirms that the sampled public product responses expose configuration; it does not prove storefront rendering, cart selection submission, modifier calculation, Razorpay totals, or order persistence through checkout.

No live order was approved or booked. Deployed courier quote/confirmation responses, measurement persistence, wallet charges, AWB/pickup/label automation, and storefront checkout still require a disposable test order and backend/storefront verification. The approval POST/PATCH discrepancy described below remains unresolved. Source changes preserve the current PATCH path and payload; only explicit failure handling was added to the existing approval service.

## Product gallery editing — 30 October 2026

The edit modal now supports selecting five images at once, drag/drop, current/new previews, individual removal of pending files and resetting to the saved gallery. It follows the user's clarified rule: preserve the first current images and replace the tail. With five current images, two new images keep the first three, three keep the first two, and five replace all five. With fewer current images, the resulting count is the greater of the current and selected counts. No selection or Cancel sends no gallery mutation.

The existing `PATCH /admin/products/:id` route accepts multipart files under `productImages`; no documented retained-URL/delete payload exists. The frontend therefore downloads the retained prefix without credentials, combines those files with the new selection in slot order, optimizes the complete set and sends repeated `productImages` parts. Retained visual content is preserved, but re-uploaded files can receive new storage IDs/URLs. Download/type/size failures stop before any product PATCH. Unrelated product fields, filters, pricing and variants keep their existing request semantics. Gallery thumbnails take precedence over stale legacy cover fields; legacy single-image products remain supported.

A fresh product read checks the expected gallery count and verifies that URLs from replaced slots do not remain in the new tail. A failed read, appended/ignored upload, or unchanged replaced slots yields an unverified-save warning with no automatic mutation retry. This checks count and URL changes, not image-byte equivalence on the deployed storage service. The backend must replace the gallery in the submitted file order for this contract to work; exact storage cleanup remains backend-owned.

The frontend limit is **five gallery images**, with the existing optimized-file budget of 3.5 MiB. Selections of six or ten files are explicitly rejected without truncating the previous draft. A read-only public API sample had gallery counts 5, 5, 1 and 5; a sampled image returned HTTP 200, JPEG content and `Access-Control-Allow-Origin: *`. This proves neither the backend's maximum accepted file count nor live gallery replacement. No production product images were changed. Supporting 6–10 requires confirming backend upload count, replacement/retention behavior and request/storage limits.

Verification: **57 automated tests**, TypeScript, production build and the mocked browser suite pass. Tests cover 2/3/5 image replacements, retained file bytes/order, rejected 6/10 counts and invalid/empty files, failed retained-image downloads before mutation, full replacement without old downloads, cancellation, resetting/reopening, updated thumbnail precedence, ignored/appended updates, legacy cover fallback and dark desktop/light mobile overflow checks. Browser asset failures handle both Fetch and XHR resource classifications. Existing product/category/order/courier regressions remain in the suite.

## Architecture reviewed

Reviewed README, both supplied requirement documents, authentication context, shared Axios client, product/category/order services, product name/slug/description/image utilities, shared types, product create/edit flows, category create/edit/delete/list flows, order normalization/details/approval, and the Shiprocket workspace. The working tree was clean before implementation. No AGENTS.md guidance or existing test framework was found.

The shared Axios client owns bearer cookies, token refresh, session expiry and the configured API base. These mechanisms were preserved. Creation already uses a text-only multipart POST followed by a multipart PATCH for gallery images and optional variant mockups. This two-request flow remains intact. Product edits are partial multipart PATCH requests. Shipment synchronization remains an explicit admin action; opening order details does not initiate it.

## Completed steps and verification

1. Added shared types, nested validation, multipart serialization and focused tests. Verified seven tests and TypeScript before integrating forms.
2. Added product configuration and fresh backend read-back verification. Parcel inputs were subsequently moved out of both product forms into the order View modal at the user's request; existing product package data remains untouched.
3. Fixed category selection by ID and removed automatic frontend slug generation. Verified sixteen tests and TypeScript before integrating order presentation.
4. Added the order-scoped Parcel → Courier quotes → Approval UI, backend delivery-charge display and selected-option array support. On 30 October, connected save/quote and courier confirmation, verified the service layer first, then the modal and browser flow against mocks.

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
| Order parcel UI | Four measurements, dynamic courier cards, inline validation, loading/error/empty states and wallet-charge confirmation | IMPLEMENTED — LIVE BACKEND VERIFICATION PENDING |
| New courier booking flow | Save/quote POST → selected-courier confirmation POST → existing approval PATCH; list refresh and partial approval recovery | IMPLEMENTED — LIVE BACKEND VERIFICATION PENDING |
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
| `POST /admin/orders/:id/courier-quotes` | JSON `{weight,length,breadth,height}` | Backend saves this order's actual parcel and obtains rates using its saved address; frontend validates the returned courier list and clears stale selections |
| `POST /admin/orders/:id/confirm-courier` | JSON `{courierId}` using the exact returned string/number ID | Only after explicit confirmation; backend creates shipment; then existing approval is called once; no client price, address override or invented quote token is submitted |
| `POST /shipments/:id/sync-shipment` | Existing `{approveOrder:true}` | Unchanged explicit action; no new automatic creation/retries |
| Existing shipment details/track/pickup/label/manifest/cancel routes | Existing request fields | Preserved; existing service route and AWB handling covered by focused mocked checks |

Nested multipart encoding follows the existing `quantityPricing` JSON convention. The new PRD supplies JSON object shapes but does not explicitly confirm the deployed multipart parser supports them. Runtime read-back verification exposes that distinction. If read-back fails after a mutation, the UI reports that the product save occurred but nested persistence remains unconfirmed and refreshes/closes rather than inviting duplicate product creation.

Read-back uses the documented listing route rather than inventing a detail route. It searches bounded pages, stopping on a short/unknown list shape. Products absent from those pages yield an unverified warning. Comparison currently expects documented numeric/boolean/object response types; other backend shapes require a confirmed normalization contract.

Each read-back request explicitly includes `_ts: Date.now()`, matching product-list requests. The shared Axios request interceptor already adds `_ts` to all GET requests and preserves an explicitly supplied value; the service parameter makes this behavior explicit and testable even with a mocked client.

A read-only, unauthenticated probe of deployed `GET /admin/products?page=1&limit=1` on 26 October 2026 returned `401 Unauthorized`, `Cache-Control: public, max-age=0, must-revalidate`, `Age: 0`, and `X-Vercel-Cache: MISS`. These headers describe that error response: they do not confirm that authenticated product listings return cached or stale data. The cache policy and cache-hit behavior of successful authenticated listings remain unverified. No authentication or production mutation was performed for this probe.

## UI

`ProductConfigurationFields` extends existing product modals using the dashboard's CSS variables, form controls and buttons. Parcel inputs are absent from both create/edit product forms. Product edit disables its form while saving/verifying, and create/edit have synchronous submission guards. Saved field removal asks for confirmation because customer selections may reference its key.

`OrderParcelDetails` appears full-width inside Orders → View, before the existing Shiprocket workspace and approval actions. It contains three steps: actual packed parcel measurements; available courier providers/services with returned charges and estimates; and confirmation/approval. Paid `placed`, `confirmed` and `processing` orders without a saved shipment can prepare their first shipment. Booked, terminal and unpaid orders have read-only parcel controls. This allows an order approved through the existing action to select its first courier later. The backend must enforce eligibility and prevent duplicate bookings too. The layout uses two columns on desktop and stacks on mobile.

Measurements have per-field blur validation. Weight is 0.1–999.99 kg with up to two decimal places; all dimensions accept positive finite decimals in cm. Inputs start blank unless the order returns actual parcel data (`packageDetails`, `parcel`, `parcelDetails`, or flat `parcelWeight`/`parcelLength`/`parcelBreadth`/`parcelHeight`). Each modal has its own draft and selection, reset on close. No localStorage or product mutation is used. Invalid measurements disable fetching. Changing any measurement clears quotes and selection. A successful quote response acknowledges the combined save operation; it is not represented as a separate verified backend read.

Courier lists accept `data.couriers`, root `couriers`, or a `data` array from the provided prompt. Each returned service needs an ID, name and valid nonnegative INR rate. Malformed responses produce an error rather than a fabricated quote or empty-success state. Numeric and string IDs retain their type. Courier cards are buttons with an accessible pressed state and orange selection accent; clicking the row or price opens a native nested confirmation dialog using existing modal classes. Cancel/Escape closes only the confirmation and makes no API call. The footer can reopen it for the selected service. Loading locks repeated requests and dismissal. Confirmation failure leaves the dialog open and does not approve. Successful confirmation calls the existing approval only for `placed` orders, closes both dialogs and refreshes the list. `confirmed` and `processing` orders skip approval and return `approvalFailed: false`, avoiding repeated approval emails and an unavailable manual-recovery step. Approval failure produces a warning and still refreshes; it never repeats the shipment request. Existing approval, delivery estimates, AWB workspace, pickup and labels are preserved.

## Changed files

| File | Purpose |
| --- | --- |
| `src/types.ts` | Product configuration/option/field and package interfaces; optional product/payload fields |
| `src/lib/productConfiguration.ts` | Nested validation, canonical payloads, package drafts, response lookup and persistence comparison |
| `src/lib/productConfigurationDrafts.ts` | Isolates unsaved product-filter drafts by selected category; restores and resets drafts without category persistence |
| `src/lib/categoryOptions.ts` | ID-based duplicate-name resolution, contextual titles and actionable backend errors |
| `src/lib/orderPresentation.ts` | Safe display normalization for returned parcels, shipping charges and selected options |
| `src/lib/orderFulfillment.ts` | Order parcel validation/prepopulation/eligibility, courier estimates and confirm-then-approve sequencing |
| `src/components/ProductConfigurationFields.tsx` | Reusable per-product select configuration editor |
| `src/components/ProductGalleryEditor.tsx` | Multi-select/drop gallery editor; retained-prefix/new-tail previews, reset/removal and object URL cleanup |
| `src/lib/productImages.ts` | Gallery planning/validation, credential-free retained-image reads, existing image optimization and shared five-image limit |
| `src/components/PackageDetailsForm.tsx` | Reusable actual-order measurement controls with labels, units and blur validation |
| `src/components/OrderParcelDetails.tsx` | Connected parcel/quote states, dynamic service cards and nested wallet-charge confirmation |
| `src/services/orderService.ts` | Courier quote and confirmation POST functions; existing methods/paths preserved; approval rejects explicit backend failure flags |
| `src/components/CreateProductModal.tsx` | New form sections, nested POST serialization, read-back verification and submission guard |
| `src/pages/Products.tsx` | Edit prepopulation, dirty-field serialization, ID category selector, pending state and verified-save messaging |
| `src/services/productService.ts` | Fresh configuration/package/gallery verification using existing GET route; detects changed gallery count and stale replaced slots |
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
| `tests/productConfigurationDrafts.test.mjs` | Category draft switching, no hardcoded choices, common pricing preservation and exact decimal modifier serialization |
| `tests/productService.test.mjs` | Multipart methods/paths and read-back success/failure |
| `tests/productForms.test.mjs` | Rendered saved fields, stable keys, unit labels and accessible errors |
| `tests/categoryManagement.test.mjs` | Duplicate names, ID CRUD/assignment, slug omission and backend rejection |
| `tests/orderIntegration.test.mjs` | Order presentation, parcel prepopulation/read-only states, dynamic service cards and unchanged shipment contracts |
| `tests/orderFulfillment.test.mjs` | Parcel boundaries, exact requests, response validation, ID type preservation, sequencing and partial approval failure |
| `tests/browser-smoke.mjs` | Real Chromium checks against built app with every external request intercepted |
| `tests/browserCleanup.test.mjs` | Exercises the harness cleanup and diagnostics with failed CDP/DevTools calls and closed sockets; checks original errors and pending timer cleanup |
| `README.md` | Feature and verification notes with link to this report |
| `docs/product-fulfillment-implementation.md` | This implementation report and exact backend gaps |

## Checks and limits

- Baseline: `npm run lint` passed. Initial sandbox build could not read parent directories; the approved build outside the sandbox passed.
- `npm test`: 57 focused automated tests passed. Tests use Node 24 and the installed TypeScript compiler, with no added dependencies. Includes multi-image gallery selection/planning/validation, retained image bytes/order and fresh read-back warnings; existing product/category, order/courier and browser-cleanup cases remain.
- `npm run lint`: TypeScript passed.
- `npm run build`: production build passed. The existing >500 kB main-chunk advisory remains; it was present before these changes.
- `npm run test:browser`: product/category regressions plus order validation; exact numeric quote payload; loading/500/422/empty states and retry; dynamic services/prices; Cancel/Escape without booking; selection invalidation on edit; confirmation failure without approval; duplicate-click protection; success → PATCH approval for placed orders → modal close/list refresh; confirmed/processing courier bookings without another approval request or false manual-approval warning; partial approval failure and manual recovery; separate measurements for two orders; prepopulation and read-only booked shipments; existing label controls; dark desktop and light mobile layouts. PASS prints after the final browser-error and no-auto-sync assertions. All external requests are intercepted.
- Dark desktop (1440px) and light mobile (390px) screenshots were visually inspected; mobile modal overflow assertion passed. Screenshots are generated in the OS temporary directory `inkart-ui-checks`.
- Authentication/session code, dashboard, analytics, coupons and customer CRUD were not changed. Their source compiled in the production build; their live workflows were not exercised. Login itself was not live-tested; browser tests inject an isolated fake admin cookie that only reaches intercepted mock responses.
- Real Shiprocket booking, duplicate-shipment guarantees, delayed AWB assignment, pickup, label/manifest downloads, cancellation, Razorpay checkout and storefront rendering were not live-verified. Existing UI/service behavior was retained; mocked route checks do not establish provider side effects.

To rerun browser checks, build the app, start an isolated headless Chromium browser with a temporary profile and `--remote-debugging-port=9229`, then run `npm run test:browser`. Override `BROWSER_DEBUG_URL` if needed. The script serves `dist` on localhost:4175, intercepts all external browser requests, and returns the page to `about:blank` before disconnecting.

## Backend developer actions

### Order courier contract and remaining live verification

- Connected endpoints: `POST /admin/orders/:id/courier-quotes` with the four numeric measurements; `POST /admin/orders/:id/confirm-courier` with the saved courier ID. The backend retrieves the order's customer/address and configured pickup details. The browser never calls private Shiprocket APIs or submits an authoritative charge.
- Approval discrepancy: the short endpoint sheet lists `POST /:id/approve`, while the enhanced prompt explicitly requires preserving the existing `PATCH` function. This implementation preserves `PATCH` and reports its failure separately after a successful booking. Confirm the deployed approval method with the backend developer. The supplied documents do not specify how re-approval behaves for `confirmed` or `processing` orders. The README's earlier live audit only checked a fake order ID, which cannot establish that behavior. No disposable staging order or backend implementation is available here; actual repeat-approval behavior remains unverified to avoid changing a customer order or sending an extra email.
- The short sheet does not define a response schema. The enhanced prompt supplies the supported courier fields (`courierId`, `courierName`, `rate`, optional `serviceType`/`estimatedDays`/`currency`) and booking fields (`awb`, `shipmentId`, `courierName`). Actual deployed responses remain unverified.
- The combined quote endpoint is documented to save measurements. There is no separately documented read-back, quote token, expiry or wallet-balance endpoint. No such routes or fields are invented. Reopening prepopulates measurements when the existing order listing returns them.
- The backend must retain the same saved measurements and selected available courier when creating the shipment, validate current order state and rates, and enforce idempotency against duplicate or ambiguous retries. Local in-flight guards cannot guarantee server-side exactly-once booking, particularly after a lost response or activity in another browser.
- Units follow the enhanced prompt: kg and cm. The short sheet says to confirm units with the backend. Weight bounds/precision are frontend checks from that prompt and must also be enforced server-side.
- Actual wallet debit, total-charge inclusions, pickup automation, label generation, AWB assignment timing and tracking/webhook updates depend on the backend/Shiprocket account. They were not triggered against a live order. Existing pickup, tracking and label/manifest routes remain unchanged.
- Shiprocket describes freight deductions during order processing and possible reversals/weight adjustments in [its passbook documentation](https://support.shiprocket.in/support/solutions/articles/43000614621-explaining-shiprocket-passbook-charges). The confirmation dialog therefore warns about wallet charges and final billing, rather than claiming that a quoted amount is guaranteed or that booking is irrevocable.

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
