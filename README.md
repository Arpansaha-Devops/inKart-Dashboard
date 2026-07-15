# InkArt Admin Dashboard

This repository contains the InkArt admin dashboard. It is a Vite + React + TypeScript single-page app for managing the same backend data used by the customer-facing InkArt e-commerce storefront.

Admin changes are live business data changes. Product, category, coupon, customer, order, and analytics operations in this dashboard can affect what the storefront displays or consumes through the shared API.

## Overview

Current functionality:

- Admin login with password flow and optional OTP verification flow
- Protected admin-only routes
- Dashboard summary cards, product/category charts, coupon discount chart, recent users, and quick actions
- Orders listing with server filters, search, date range filtering, pagination, CSV export, detail modal, order approval, delivery estimate updates, and confirmation email resend
- Order analytics KPI cards and revenue-over-time chart
- Customer listing, debounced search, pagination, customer details, and user deletion
- Product listing, create, edit, stock adjustment, quantity pricing tiers, image upload, and verified delete
- Category listing, create, edit, delete, status display, and client-side pagination
- Coupon listing, create, edit, delete, active/expired summaries, validity windows, usage limits, and category targeting
- Dark/light theme switching persisted in localStorage
- Responsive sidebar, header, right-side notification/activity/manager panel shell, modals, tables, cards, and chart surfaces

## Shared API Contract

The dashboard uses the same backend API as the e-commerce project.

- Default API base URL: `https://inkart-virid.vercel.app/api/v1`
- Runtime override: `VITE_API_BASE_URL`
- Browser route basename: `/admin`
- Vite base path: `/admin/`
- Local dev URL: `http://localhost:8000/admin/login`

All normal API calls go through [src/lib/apiClient.ts](src/lib/apiClient.ts). The refresh-token retry uses raw `axios.post` internally so it can retry the failed request after receiving a new access token.

Important API client behavior:

- Trims trailing slashes from `VITE_API_BASE_URL`.
- Defaults to the live backend URL when `VITE_API_BASE_URL` is not set.
- Adds a `_ts` cache-busting query param to every GET request.
- Adds `Authorization: Bearer <token>` to authenticated requests, reading from cookies first and localStorage second.
- Skips auth headers for `/auth/login`, `/auth/register`, `/auth/verify-login-otp`, `/auth/verify-otp`, and `/auth/refresh-token`.
- On a `401`, retries once with `POST /auth/refresh-token` if a refresh token exists.
- If refresh fails, clears auth storage, shows a session-expired toast, and redirects to `/admin/login`.

[vite.config.ts](vite.config.ts) defines a dev proxy from `/api` to the live backend, but the current API client does not automatically switch to `/api`. To use the proxy locally, set:

```env
VITE_API_BASE_URL="/api"
```

## Tech Stack

- React 19
- TypeScript 5
- Vite 6
- React Router DOM 7
- Tailwind CSS 4
- Axios
- Chart.js + react-chartjs-2
- Sonner
- Lucide React
- Motion
- js-cookie

## Scripts

```bash
npm run dev      # start Vite on port 8000
npm run build    # production build
npm run preview  # preview production build
npm run lint     # TypeScript check with tsc --noEmit
npm run clean    # remove dist with rm -rf
npm run doctor   # run react-doctor
```

Note: `npm run clean` uses Unix-style `rm -rf`, so it may not work in a plain Windows shell.

## Environment

Defined in [.env.example](.env.example):

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
VITE_API_BASE_URL="https://inkart-virid.vercel.app/api/v1"
ADMIN_EMAIL="inkartproduct.colourstreak@gmail.com"
ADMIN_PASSWORD="your_admin_password_here"
```

Actual frontend runtime usage:

- `VITE_API_BASE_URL` is used by `apiClient`.
- `GEMINI_API_KEY` is injected by `vite.config.ts` as `process.env.GEMINI_API_KEY`, but no current UI feature uses it.
- `APP_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are not used by the current frontend source.

## App Configuration

[vite.config.ts](vite.config.ts):

- Uses `@vitejs/plugin-react` and `@tailwindcss/vite`.
- Sets `base: '/admin/'`.
- Sets dev server port to `8000`.
- Defines alias `@` as the repository root, not `src`.
- Defines a `/api` proxy to `https://inkart-virid.vercel.app/api/v1`.
- Injects `process.env.GEMINI_API_KEY`.
- Allows HMR unless `DISABLE_HMR=true`.

[src/main.tsx](src/main.tsx):

- Removes the legacy `localStorage['inkart-dashboard-deleted-categories']` key at startup.
- Reads `localStorage['inkart-dashboard-theme']`.
- Defaults to dark mode unless the stored value is exactly `light`.
- Applies `body.dark` or `body.light` and `color-scheme` before React render.
- Renders `<App />` inside `StrictMode`.

[src/App.tsx](src/App.tsx):

- Wraps the app with `AuthProvider`.
- Uses `BrowserRouter` with `basename="/admin"`.
- Mounts `Toaster`.
- Defines public and protected routes.
- Lazy-loads `Dashboard` and `Analytics`.

## Route Map

| Route | Access | Component |
|---|---|---|
| `/login` | Public | `Login` |
| `/dashboard` | Admin only | `Dashboard` |
| `/orders` | Admin only | `Orders` |
| `/analytics` | Admin only | `Analytics` |
| `/customers` | Admin only | `Customers` |
| `/products` | Admin only | `Products` |
| `/categories` | Admin only | `Categories` |
| `/coupons` | Admin only | `Coupons` |
| `/` | Admin only | Redirects to `/dashboard` |
| `*` | Any | Redirects to `/dashboard` |

Sidebar navigation matches the protected routes:

- Dashboard
- Orders
- Analytics
- Customers
- Products
- Categories
- Coupons

## Auth Flow

[src/context/AuthContext.tsx](src/context/AuthContext.tsx):

- Stores `user`, `token`, and `isLoading`.
- Hydrates `user` and `token` from cookies first, then localStorage.
- Checks JWT expiry during hydration; expired or malformed tokens are cleared.
- `login()` saves `user`, `token`, and `refreshToken` into cookies and localStorage for 7 days.
- `logout()` clears auth cookies and localStorage values.
- `isLoading` is currently always `false` after synchronous hydration.

[src/components/PrivateRoute.tsx](src/components/PrivateRoute.tsx):

- Requires `token`, `user`, and `user.role === 'admin'`.
- Redirects unauthorized users to `/login`.

[src/pages/Login.tsx](src/pages/Login.tsx):

- Calls `POST /auth/login` with email/password.
- If the login response is successful but does not include user/token data, switches to OTP mode.
- Calls `POST /auth/verify-login-otp` with email/OTP in OTP mode.
- Accepts auth payloads from either top-level fields or `data`.
- Requires an admin user, access token, and refresh token before entering the dashboard.

[src/components/Sidebar.tsx](src/components/Sidebar.tsx):

- Logout calls `POST /auth/logout`.
- Local auth state is cleared even if the logout API fails.

## API Endpoint Matrix

All backend endpoints referenced by current source:

| Method | Endpoint | Used In |
|---|---|---|
| `POST` | `/auth/login` | Login |
| `POST` | `/auth/verify-login-otp` | Login OTP step |
| `POST` | `/auth/logout` | Sidebar logout |
| `POST` | `/auth/refresh-token` | API client interceptor |
| `GET` | `/users/all` | Dashboard, Customers |
| `DELETE` | `/admin/users/:id` | Customers |
| `GET` | `/admin/orders` | Orders |
| `PATCH` | `/admin/orders/:id/approve` | Order detail actions |
| `PATCH` | `/admin/orders/:id/delivery-estimate` | Order detail actions |
| `POST` | `/admin/orders/:id/resend-confirmation` | Order detail actions |
| `GET` | `/admin/products` | Dashboard, Products, CreateProductModal, productService |
| `GET` | `/products` | Dashboard/Products fallback, product delete fallback |
| `POST` | `/admin/products` | Products, CreateProductModal, productService |
| `PATCH` | `/admin/products/:id` | Products, productService |
| `PATCH` | `/admin/products/:id/stock` | Products, productService |
| `DELETE` | `/admin/products/:id` | Products, productService |
| `DELETE` | `/products/:id` | productService fallback after admin delete |
| `GET` | `/admin/categories` | Dashboard, Products, Categories, Coupons, CreateProductModal, services |
| `GET` | `/categories` | Category fallback, product/category lookup fallback |
| `POST` | `/admin/categories` | CreateCategoryModal, categoryService |
| `PATCH` | `/admin/categories/:id` | EditCategoryModal, categoryService |
| `DELETE` | `/admin/categories/:id` | DeleteCategoryModal, categoryService |
| `GET` | `/admin/coupons` | Dashboard, Coupons |
| `POST` | `/admin/coupons` | Coupons, couponService |
| `PATCH` | `/admin/coupons/:id` | Coupons, couponService |
| `DELETE` | `/admin/coupons/:id` | Coupons, couponService |
| `GET` | `/admin/analytics/dashboard-stats` | Analytics, analyticsService |
| `GET` | `/admin/analytics/revenue-over-time` | Analytics, analyticsService |

## Page Analysis

### Dashboard

File: [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx)

Shows total users, total products, total coupons, active categories, products by category, coupon discount chart, recent user activity, and quick actions.

API calls:

- `GET /users/all?limit=1`
- `GET /admin/products?limit=1`
- `GET /admin/coupons?page=1&limit=1`
- `GET /admin/categories`
- `GET /admin/products?page=1&limit=200`
- `GET /admin/coupons?page=1&limit=50`
- fallback `GET /products?page=1&limit=500`

Implementation notes:

- Uses `Promise.allSettled` so partial failures do not break the whole page.
- Recursively extracts counts and arrays from inconsistent response shapes.
- Keeps last known counts/recent users when individual requests fail.
- Refreshes every 30 seconds.
- Updates chart theme colors when the body theme changes.

### Analytics

File: [src/pages/Analytics.tsx](src/pages/Analytics.tsx)

Shows order analytics KPI cards and a revenue-over-time line chart.

API calls through [src/services/analyticsService.ts](src/services/analyticsService.ts):

- `GET /admin/analytics/dashboard-stats`
- `GET /admin/analytics/revenue-over-time`

Implementation notes:

- The service defensively parses many possible analytics response shapes.
- Recognizes revenue-like keys such as `revenue`, `totalRevenue`, `amount`, `sales`, `grossRevenue`, and `netRevenue`.
- Derives average order value from revenue/orders if the API does not provide it.
- Adds a revenue trend to the total revenue metric when at least two revenue points exist.
- Chart and metric colors update when the theme changes.
- Stats and revenue sections can be retried independently.

### Orders

File: [src/pages/Orders.tsx](src/pages/Orders.tsx)

Lists orders with summary metrics, search, status filters, payment filters, date range filtering, pagination, CSV export, and a detailed order modal.

API calls:

- `GET /admin/orders?page={page}&limit=10&status={optional}&paymentStatus={optional}&search={optional}`
- `PATCH /admin/orders/:id/approve`
- `PATCH /admin/orders/:id/delivery-estimate`
- `POST /admin/orders/:id/resend-confirmation`

Implementation notes:

- Normalizes flexible order payload shapes into a local `Order` model.
- Handles both standard and customized order payloads, including preview images, canvas dimensions, front/back layers, product images, coupons, address fields, and timeline/history rows.
- Recognizes order statuses: placed, confirmed, processing, shipped, delivered, cancelled, return requested, and returned.
- Recognizes payment statuses: pending, paid, failed, and refunded.
- Applies date range filtering client-side after the paged API response is loaded.
- Exports the currently loaded/filtered page of orders as CSV.
- Detail modal can copy the order number.
- Admin actions can approve eligible orders, set/update future delivery estimates with an optional note, and resend the confirmation email.

### Customers

File: [src/pages/Customers.tsx](src/pages/Customers.tsx)

Lists registered users, supports debounced search, server pagination, customer detail view, and user delete.

API calls:

- `GET /users/all?page={page}&limit=10&search={optional}`
- `DELETE /admin/users/:id`

Implementation notes:

- Search fetch is debounced by 300 ms.
- Response parsing is recursive and supports multiple payload shapes.
- Blocks deleting the currently logged-in admin account.
- Delete modal includes escape close, click-outside close, and focus trapping.
- Customer detail modal is read-only.

### Products

File: [src/pages/Products.tsx](src/pages/Products.tsx)

Lists products, edits product details, updates stock, deletes products, and opens a dedicated create-product modal.

API calls:

- `GET /admin/products?page=1&limit=500`
- fallback `GET /products?page=1&limit=500`
- `GET /admin/categories`
- `PATCH /admin/products/:id`
- `POST /admin/products` through `CreateProductModal`/`productService`
- `PATCH /admin/products/:id/stock`
- `DELETE /admin/products/:id` through `productService`
- fallback `DELETE /products/:id` through `productService`

Implementation notes:

- Product arrays and totals are extracted from flexible response shapes.
- The page fetches a large product set and paginates client-side.
- Category labels are resolved from `/admin/categories` and nested product category data.
- Product display names are cleaned with [src/lib/productNames.ts](src/lib/productNames.ts) so hidden uniqueness markers are not shown to admins.
- Edit submits `FormData` with name, description, category, product type, stock, customizable flag, base price, optional image, and sorted `quantityPricing`.
- Quantity pricing tiers must have positive whole-number `minQty`, positive `pricePerUnit`, unique minimum quantities, and a first tier starting at quantity 1.
- Delete verifies removal by refetching `/admin/products`; if the admin delete still appears to leave the product, it attempts the public `/products/:id` delete fallback.

### Create Product Modal

File: [src/components/CreateProductModal.tsx](src/components/CreateProductModal.tsx)

Dedicated product creation flow with validation, category lookup, drag/drop image upload, quantity pricing, and FormData submission.

API calls:

- `GET /admin/categories`
- `GET /categories`
- fallback `GET /admin/products?page=1&limit=200`
- `POST /admin/products`

Submitted fields:

- `name`
- generated `slug`
- generated `productSlug`
- `price`
- `description`
- resolved category id as `category`
- `productType`
- `stock`
- `isCustomizable`
- `isActive`
- `images`
- `basePrice`
- `quantityPricing`

Implementation notes:

- Requires name, price, description, active category, base price, at least one image, and valid quantity pricing.
- Allows up to 5 JPG, PNG, or WebP images and optimizes large files before upload to keep the multipart request within the backend request-size limit.
- Category input accepts an active category name or a 24-character active category id.
- Slugs are generated by [src/lib/productSlugs.ts](src/lib/productSlugs.ts) using a sanitized product name plus timestamp.
- Some auth failure branches navigate to `/login`; because the router basename is `/admin`, this still resolves inside the admin app.

### Categories

File: [src/pages/Categories.tsx](src/pages/Categories.tsx)

Lists categories, sorts newest first, paginates client-side, and opens create/edit/delete modals.

API calls through [src/services/categoryService.ts](src/services/categoryService.ts):

- `GET /admin/categories`
- fallback `GET /categories`
- `POST /admin/categories`
- `PATCH /admin/categories/:id`
- `DELETE /admin/categories/:id`

Implementation notes:

- Status display comes from `isActive`.
- Create sends `FormData`; edit sends a JSON patch payload.
- Deleted categories are refetched from the server after delete.
- The old local deleted-category cache key is cleared at startup by `main.tsx`.

### Coupons

File: [src/pages/Coupons.tsx](src/pages/Coupons.tsx)

Lists coupons, shows total/active/expired summary cards, creates coupons, edits coupons, deletes coupons, and targets active categories.

API calls:

- `GET /admin/coupons?page={page}&limit=10`
- `GET /admin/categories` through `getCategories()`
- fallback `GET /categories` through `getCategories()`
- `POST /admin/coupons`
- `PATCH /admin/coupons/:id`
- `DELETE /admin/coupons/:id`

Implementation notes:

- Supports server pagination or local slicing fallback.
- Normalizes applicable category names to ids before submit.
- Uses selectable active-category chips; an empty category list means the coupon applies to all categories.
- Validates required code/description, positive discount, percentage <= 100, and `validUntil > validFrom`.
- Expired state is computed from `isActive` and `validUntil`.
- Modal and delete dialog include focus trap and accessibility behavior.

## Shared Components

[src/components/Layout.tsx](src/components/Layout.tsx):

- Main shell: sidebar, header, scrollable main area, and notification panel.
- Mobile sidebar state lives here.

[src/components/Header.tsx](src/components/Header.tsx):

- Derives title from the current route.
- Shows the `/orders` route title as `Customized Orders`.
- Shows theme toggle and admin avatar initial.
- Persists theme in `localStorage['inkart-dashboard-theme']`.
- Dispatches `themechange` for chart updates.

[src/components/Sidebar.tsx](src/components/Sidebar.tsx):

- Renders protected navigation.
- Provides desktop sidebar and mobile drawer.
- Handles logout confirmation and API logout.

[src/components/NotificationPanel.tsx](src/components/NotificationPanel.tsx):

- Right-side portal panel with notifications, activities, and manager contacts sections.
- Uses empty local arrays right now and calls no API.
- Starts open by default, can be toggled with the bell button, closes on Escape, and locks body scroll while open.

[src/context/NotificationContext.tsx](src/context/NotificationContext.tsx):

- Defines notification panel open-state context, but it is not currently mounted by `App` or `Layout`.

[src/components/DashboardCharts.tsx](src/components/DashboardCharts.tsx):

- Lazy-loads Chart.js/react-chartjs-2 only when charts render.
- Supports dashboard doughnut and bar chart variants.

Category modal components:

- [src/components/CreateCategoryModal.tsx](src/components/CreateCategoryModal.tsx)
- [src/components/EditCategoryModal.tsx](src/components/EditCategoryModal.tsx)
- [src/components/DeleteCategoryModal.tsx](src/components/DeleteCategoryModal.tsx)

All category modals implement keyboard/click-outside behavior and use `categoryService`.

## Services and Utilities

[src/services/productService.ts](src/services/productService.ts):

- `createProduct(formData)` -> `POST /admin/products`
- `getProducts(page, limit)` -> `GET /admin/products`
- `updateProduct(productId, formData)` -> `PATCH /admin/products/:id`
- `updateStock(productId, data)` -> `PATCH /admin/products/:id/stock`
- `fetchCategories()` -> tries `/admin/categories`, then `/categories`
- `deleteProduct(productId)` -> deletes through `/admin/products/:id`, verifies by refetching products, then optionally tries `/products/:id`

[src/services/orderService.ts](src/services/orderService.ts):

- `approveOrder(orderId)` -> `PATCH /admin/orders/:id/approve`
- `setDeliveryEstimate(orderId, data)` -> `PATCH /admin/orders/:id/delivery-estimate`
- `resendConfirmation(orderId)` -> `POST /admin/orders/:id/resend-confirmation`

[src/services/categoryService.ts](src/services/categoryService.ts):

- `getCategories()` -> tries `/admin/categories`, then `/categories`
- `createCategory(payload)` -> `POST /admin/categories`
- `updateCategory(id, payload)` -> `PATCH /admin/categories/:id`
- `deleteCategory(id)` -> `DELETE /admin/categories/:id`
- `extractCategories(data)` -> recursive parser for mixed API shapes

[src/services/couponService.ts](src/services/couponService.ts):

- `createCoupon(data)` -> `POST /admin/coupons`
- `updateCoupon(couponId, data)` -> `PATCH /admin/coupons/:id`
- `deleteCoupon(couponId)` -> `DELETE /admin/coupons/:id`

[src/services/analyticsService.ts](src/services/analyticsService.ts):

- `getDashboardStats()` -> `GET /admin/analytics/dashboard-stats`
- `getRevenueOverTime()` -> `GET /admin/analytics/revenue-over-time`
- Parses flexible metric and chart response payloads into stable frontend types.

[src/lib/productSlugs.ts](src/lib/productSlugs.ts):

- Generates sanitized unique product slugs and writes both `slug` and `productSlug` into FormData.

[src/lib/productNames.ts](src/lib/productNames.ts):

- Hides internal duplicate-friendly name markers from admin display.

[src/lib/utils.ts](src/lib/utils.ts):

- Provides `cn()` for class merging and `formatDate()` for display dates.

## Types

[src/types.ts](src/types.ts) defines:

- `User`
- `Product`
- `QuantityPricingTier`
- `CreateProductPayload`
- `UpdateProductPayload`
- `AuthResponse`
- `PaginatedResponse<T>`
- `Coupon`
- `CreateCouponPayload`
- `CouponResponse`
- `Category`
- `CreateCategoryPayload`
- `StockUpdatePayload`
- `RevenueDataPoint`
- `AnalyticsMetric`
- `AnalyticsDashboardStats`
- `RevenueOverTimeResponse`
- `DashboardStatsResponse`

## UI Structure

Global styling lives in [src/index.css](src/index.css).

Key app structure:

- `body.dark` / `body.light` theme classes
- CSS variables for colors, borders, shadows, and radii
- `.page-wrapper` for page spacing
- `.card` and `.card-hover` for panels and repeated items
- `.data-table` and `.table-container` for tables
- `.modal-backdrop`, `.modal-box`, `.modal-box-lg` for dialogs
- `.btn-primary`, `.btn-ghost`, `.btn-danger` for commands
- `.input-field` for form controls
- badge classes for status/product/coupon states
- responsive classes for product tables, sidebar, header, and notification panel behavior

The UI is an operational dashboard: dense tables, summary cards, modal workflows, chart surfaces, responsive drawers, and focused admin actions.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure the API base URL:

```env
VITE_API_BASE_URL="https://inkart-virid.vercel.app/api/v1"
```

To route local requests through the Vite proxy instead:

```env
VITE_API_BASE_URL="/api"
```

3. Start the dev server:

```bash
npm run dev
```

4. Open:

```text
http://localhost:8000/admin/login
```

## QA Notes and Known Quirks

- This admin and the e-commerce storefront share the same backend data. Product/category/coupon/order mutations in admin should be tested against storefront behavior.
- The `/api` proxy exists in Vite config, but the API client only uses it when `VITE_API_BASE_URL` is set to `/api`.
- The notification panel is UI-only and not connected to backend data yet.
- `NotificationContext` exists but is not mounted by the current app shell.
- Several UI strings still contain encoding artifacts such as `â€™`, `â‚¹`, `Â·`, and `Ã—`.
- `public/favicon_io/site.webmanifest` uses root-relative icon paths even though the files live under `public/favicon_io/`.
- `package.json` is still named `react-example`, even though metadata identifies this as the InkArt Admin Panel.

## Verification Performed For This README

This README was updated after reviewing:

- Root project/config files
- App bootstrap and route definitions
- Auth context and protected route behavior
- API client behavior and base URL handling
- Every page under `src/pages`
- Services under `src/services`
- Shared layout, header, sidebar, notification panel, chart, and modal components
- Shared utilities and type definitions
- Endpoint usage via source search
