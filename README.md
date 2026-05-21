# InkArt Admin Dashboard

This README documents the current admin project in this repository. The admin dashboard and the InkArt e-commerce storefront use the same backend API, so admin changes can directly affect catalog, category, coupon, user, and analytics data seen by the customer-facing app.

## Overview

InkArt Admin Dashboard is a Vite + React + TypeScript single-page admin panel for managing the InkArt backend.

Current features:

- Admin-only login and protected routes
- Dashboard summary cards and charts
- Order analytics page with KPI cards and revenue chart
- Customer listing, search, detail view, and delete
- Product listing, create, edit, stock update, and delete
- Category listing, create, edit, and delete
- Coupon listing, create, edit, delete, active/expired summaries, and category targeting
- Dark/light theme switching persisted in local storage
- Responsive sidebar, header, and right notification panel shell

## Shared API Contract

The app talks to the same API used by the e-commerce project.

- Default API base URL: `https://inkart-virid.vercel.app/api/v1`
- Runtime override: `VITE_API_BASE_URL`
- Frontend route basename: `/inkarts-admin`
- Vite base path: `/inkarts-admin/`
- Local dev URL: `http://localhost:8000/inkarts-admin/login`

All API requests go through [src/lib/apiClient.ts](src/lib/apiClient.ts), except the refresh-token retry which uses raw `axios.post` internally.

Important API client behavior:

- Trims trailing slashes from the configured base URL.
- Adds `Authorization: Bearer <token>` to authenticated requests.
- Skips auth headers for `/auth/login`, `/auth/register`, and `/auth/refresh-token`.
- On `401`, tries `POST /auth/refresh-token` once if a refresh token exists.
- If refresh fails, clears auth storage and redirects to `/inkarts-admin/login`.

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
- clsx + tailwind-merge

Present in dependencies but not used by visible app features:

- `@google/genai`
- `date-fns`

## Scripts

```bash
npm run dev      # start Vite on port 8000
npm run build    # production build
npm run preview  # preview production build
npm run lint     # TypeScript check with tsc --noEmit
npm run clean    # remove dist with rm -rf
```

Note: `npm run clean` uses Unix-style `rm -rf`, so it may not work in a plain Windows shell.

## Environment

Defined in `.env.example`:

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
- Sets `base: '/inkarts-admin/'`.
- Sets dev server port to `8000`.
- Defines alias `@` as the repository root, not `src`.
- Defines a `/api` proxy to `https://inkart-virid.vercel.app/api/v1`.

Important note: the current `.env` points `VITE_API_BASE_URL` directly to the live API, so the `/api` proxy is not used unless the env value is changed to `/api` for local development.

[src/main.tsx](src/main.tsx):

- Reads `localStorage['inkart-dashboard-theme']`.
- Defaults to dark mode unless the stored value is exactly `light`.
- Applies `body.dark` or `body.light` before React render.
- Renders `<App />` inside `StrictMode`.

[src/App.tsx](src/App.tsx):

- Wraps everything with `AuthProvider`.
- Uses `BrowserRouter` with `basename="/inkarts-admin"`.
- Mounts `Toaster`.
- Defines public and protected routes.

## Route Map

| Route | Access | Component |
|---|---|---|
| `/login` | Public | `Login` |
| `/dashboard` | Admin only | `Dashboard` |
| `/analytics` | Admin only | `Analytics` |
| `/customers` | Admin only | `Customers` |
| `/products` | Admin only | `Products` |
| `/categories` | Admin only | `Categories` |
| `/coupons` | Admin only | `Coupons` |
| `/` | Admin only | Redirects to `/dashboard` |
| `*` | Any | Redirects to `/dashboard` |

Sidebar navigation matches the protected routes:

- Dashboard
- Analytics
- Customers
- Products
- Categories
- Coupons

## Auth Flow

[src/context/AuthContext.tsx](src/context/AuthContext.tsx):

- Stores `user`, `token`, and `isLoading`.
- Hydrates `user` and `token` from cookies first, then localStorage.
- `login()` saves `user`, `token`, and `refreshToken` into cookies and localStorage.
- `logout()` clears auth cookies and localStorage values.

[src/components/PrivateRoute.tsx](src/components/PrivateRoute.tsx):

- Shows `Loading...` while auth state hydrates.
- Requires `token`, `user`, and `user.role === 'admin'`.
- Redirects unauthorized users to `/login`.

[src/pages/Login.tsx](src/pages/Login.tsx):

- Calls `POST /auth/login`.
- Expects `token`, `refreshToken`, and `data.user`.
- Rejects non-admin users.
- Calls auth context `login()` and navigates to `/dashboard`.

[src/components/Sidebar.tsx](src/components/Sidebar.tsx):

- Logout calls `POST /auth/logout`.
- Local auth state is cleared even if the logout API fails.

## API Endpoint Matrix

All backend endpoints referenced by current code:

| Method | Endpoint | Used In |
|---|---|---|
| `POST` | `/auth/login` | Login |
| `POST` | `/auth/logout` | Sidebar logout |
| `POST` | `/auth/refresh-token` | API client interceptor |
| `GET` | `/users/all` | Dashboard, Customers |
| `DELETE` | `/admin/users/:id` | Customers |
| `GET` | `/admin/products` | Dashboard, Products, CreateProductModal, productService |
| `POST` | `/admin/products` | Products, CreateProductModal, productService |
| `PATCH` | `/admin/products/:id` | Products, productService |
| `PATCH` | `/admin/products/:id/stock` | Products, productService |
| `DELETE` | `/admin/products/:id` | Products, productService |
| `GET` | `/admin/categories` | Dashboard, Products, Categories, Coupons, CreateProductModal, services |
| `GET` | `/categories` | Categories fallback, Products/CreateProductModal category fallback |
| `GET` | `/categories/all` | Products/CreateProductModal category fallback, productService |
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

Shows total users, total products, total coupons, active categories, product distribution, coupon discount chart, recent user activity, and quick actions.

API calls:

- `GET /users/all?limit=1`
- `GET /admin/products?limit=1`
- `GET /admin/coupons?page=1&limit=1`
- `GET /admin/categories`
- `GET /admin/products?page=1&limit=200`
- `GET /admin/coupons?page=1&limit=50`

Implementation notes:

- Uses `Promise.allSettled` so partial failures do not break the whole page.
- Recursively extracts counts and arrays from inconsistent response shapes.
- Refreshes every 30 seconds.
- Reads `localStorage['inkart-dashboard-deleted-products']` to hide locally deleted products from chart counts.
- Updates chart theme colors when the body theme changes.

### Analytics

File: [src/pages/Analytics.tsx](src/pages/Analytics.tsx)

Shows order analytics KPI cards and a revenue-over-time line chart.

API calls through [src/services/analyticsService.ts](src/services/analyticsService.ts):

- `GET /admin/analytics/dashboard-stats`
- `GET /admin/analytics/revenue-over-time`

Implementation notes:

- The service defensively parses many possible analytics response shapes.
- Recognizes revenue-like keys such as `revenue`, `totalRevenue`, `sales`, `grossRevenue`, and `netRevenue`.
- Derives average order value from revenue/orders if the API does not provide it.
- Chart and metric colors update when the theme changes.

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

- `GET /admin/products?page={page}&limit=10`
- `GET /admin/categories`
- `PATCH /admin/products/:id`
- `POST /admin/products`
- `PATCH /admin/products/:id/stock`
- `DELETE /admin/products/:id` through `productService`

Implementation notes:

- Product arrays and totals are extracted from flexible response shapes.
- Category labels are resolved from `/admin/categories` and nested product category data.
- Product deletes are stored in `localStorage['inkart-dashboard-deleted-products']` and hidden locally.
- The create flow uses `CreateProductModal`; the inline modal in `Products.tsx` is mainly used for editing and still contains create code paths.

### Create Product Modal

File: [src/components/CreateProductModal.tsx](src/components/CreateProductModal.tsx)

Dedicated product creation flow with validation, category lookup, image upload, and FormData submission.

API calls:

- `GET /admin/categories`
- `GET /categories`
- `GET /categories/all`
- fallback `GET /admin/products?page=1&limit=200`
- `POST /admin/products`

Submitted fields:

- `name`
- generated `slug`
- `price`
- `description`
- resolved `category`
- `productType`
- optional `stock`
- `images`
- `basePrice`

Implementation notes:

- Requires name, price, description, category, base price, and at least one image.
- Allows up to 5 images.
- Category input accepts an active category name or a 24-character category id.
- Some auth failure branches redirect to `/login` instead of `/inkarts-admin/login`.

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

- Deleted category ids are stored in `localStorage['inkart-dashboard-deleted-categories']` and hidden locally.
- Status display comes from `isActive`.
- Create sends `FormData`; edit sends a JSON patch payload.

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
- Validates required code/description, positive discount, percentage <= 100, and `validUntil > validFrom`.
- Expired state is computed from `isActive` and `validUntil`.
- Modal and delete dialog include focus trap and accessibility behavior.

## Shared Components

[src/components/Layout.tsx](src/components/Layout.tsx):

- Main shell: sidebar, header, scrollable main area, and notification panel.
- Mobile sidebar state lives here.

[src/components/Header.tsx](src/components/Header.tsx):

- Derives title from the current route.
- Shows theme toggle and admin avatar initial.
- Persists theme in `localStorage['inkart-dashboard-theme']`.
- Dispatches `themechange` for chart updates.

[src/components/Sidebar.tsx](src/components/Sidebar.tsx):

- Renders protected navigation.
- Provides desktop sidebar and mobile drawer.
- Handles logout confirmation and API logout.

[src/components/NotificationPanel.tsx](src/components/NotificationPanel.tsx):

- Right-side panel with notifications, activities, and manager contacts sections.
- Uses empty local arrays right now and calls no API.
- Docked on desktop at `>= 1280px`, overlay-style on smaller screens.

Category modal components:

- [src/components/CreateCategoryModal.tsx](src/components/CreateCategoryModal.tsx)
- [src/components/EditCategoryModal.tsx](src/components/EditCategoryModal.tsx)
- [src/components/DeleteCategoryModal.tsx](src/components/DeleteCategoryModal.tsx)

All category modals implement keyboard/click-outside behavior and use `categoryService`.

## Services

[src/services/productService.ts](src/services/productService.ts):

- `createProduct(formData)` -> `POST /admin/products`
- `getProducts(page, limit)` -> `GET /admin/products`
- `updateProduct(productId, formData)` -> `PATCH /admin/products/:id`
- `updateStock(productId, data)` -> `PATCH /admin/products/:id/stock`
- `fetchCategories()` -> tries `/admin/categories`, `/categories`, `/categories/all`
- `deleteProduct(productId)` -> `DELETE /admin/products/:id`

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

## Types

[src/types.ts](src/types.ts) defines:

- `User`
- `Product`
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

The UI is operational-dashboard oriented: dense tables, summary cards, modal workflows, and chart surfaces.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure the API base URL:

```env
VITE_API_BASE_URL="https://inkart-virid.vercel.app/api/v1"
```

3. Start the dev server:

```bash
npm run dev
```

4. Open:

```text
http://localhost:8000/inkarts-admin/login
```

## QA Notes and Known Quirks

- This admin and the e-commerce storefront share the same backend data. Product/category/coupon mutations in admin should be tested against storefront behavior.
- `CreateProductModal.tsx` redirects to `/login` in some auth failure paths, while the app basename expects `/inkarts-admin/login`.
- `Products.tsx` has an inline modal with create/edit logic, but visible creation uses `CreateProductModal`.
- Product and category deletes are also remembered in localStorage and hidden locally after successful delete.
- Several UI strings contain encoding artifacts such as `â‚¹`, `â€¢`, `Â©`, and `Youâ€™ll`.
- The Vite `/api` proxy exists but is unused while `VITE_API_BASE_URL` points directly at the live API.
- The notification panel is UI-only and not connected to backend data.
- `public/favicon_io/site.webmanifest` uses root-relative icon paths even though the files live under `public/favicon_io/`.

## Verification Performed

This README was recreated after reviewing:

- Root config files
- App bootstrap and route definitions
- Auth context and protected route behavior
- API client and services
- Every page under `src/pages`
- Shared layout, header, sidebar, notification panel, and modal components
- Endpoint usage via source search
