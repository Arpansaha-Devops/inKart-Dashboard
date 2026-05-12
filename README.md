# InkArt Admin Dashboard

This README is a code-accurate walkthrough of the current project in this repository. It documents the actual files, routes, components, API calls, auth flow, and a few implementation quirks that are important before making new changes.

## Overview

This project is a Vite + React + TypeScript admin dashboard for the InkArt backend.

It currently provides:

- Admin login
- Dashboard stats and charts
- Customer listing, search, detail view, and delete
- Product listing, edit, stock update, create, and delete
- Category listing, create, edit, and delete
- Coupon listing, create, edit, and delete
- Theme switching with persisted dark/light mode
- A placeholder right-side notification panel

The app is deployed and routed under:

- Frontend base path: `/inkarts-admin`
- Backend API base URL default: `https://inkart-virid.vercel.app/api/v1`

## Tech Stack

- React 19
- TypeScript 5
- Vite 6
- React Router DOM 7
- Tailwind CSS 4
- Axios
- Sonner
- Lucide React
- Motion
- Chart.js + react-chartjs-2
- js-cookie

Present in dependencies but not used by current app features:

- `@google/genai`
- `date-fns`

## Scripts

From `package.json`:

- `npm run dev` - start Vite on port `8000`
- `npm run build` - production build
- `npm run preview` - preview build
- `npm run lint` - TypeScript type check via `tsc --noEmit`
- `npm run clean` - removes `dist` using `rm -rf`

Note: `clean` is Unix-style and may not work on Windows shells without compatible tooling.

## Environment Variables

Defined or implied in the repo:

- `VITE_API_BASE_URL`
- `GEMINI_API_KEY`
- `APP_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Actual frontend runtime usage:

- `VITE_API_BASE_URL` is used by `src/lib/apiClient.ts`
- `GEMINI_API_KEY` is injected in `vite.config.ts` as `process.env.GEMINI_API_KEY`, but there is no current UI feature using it
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` appear only in `.env.example`
- `APP_URL` appears only in `.env.example`

Fallback API base if `VITE_API_BASE_URL` is missing:

- `https://inkart-virid.vercel.app/api/v1`

## Build and Runtime Configuration

### `vite.config.ts`

- Uses React and Tailwind Vite plugins
- Sets `base: '/inkarts-admin/'`
- Loads env with `loadEnv`
- Defines `process.env.GEMINI_API_KEY`
- Adds alias `@` -> repo root, not `src`
- Starts dev server on port `8000`
- Adds a proxy from `/api` to `https://inkart-virid.vercel.app/api/v1`

Important note: current frontend API code does not use `/api`; it uses `apiClient` with an absolute base URL, so the Vite proxy is effectively unused by the current app code.

### `tsconfig.json`

- Bundler module resolution
- `jsx: react-jsx`
- `noEmit: true`
- `allowJs: true`
- path alias `@/*` -> `./*`

### `index.html`

- Mount point is `#root`
- Title is `InKart - Admin Dashboard`
- Includes favicon and manifest links under `/favicon_io/...`

## File Inventory

### Root

- `README.md` - this architecture guide
- `package.json` - dependencies and scripts
- `package-lock.json` - lockfile
- `vite.config.ts` - Vite config
- `tsconfig.json` - TS config
- `index.html` - HTML shell
- `.env.example` - sample env values
- `metadata.json` - app metadata

### Source

- `src/main.tsx` - bootstraps app and applies saved theme before render
- `src/App.tsx` - router and app composition
- `src/index.css` - global theme tokens, layout, utilities, tables, modals, responsive rules
- `src/types.ts` - shared types
- `src/vite-env.d.ts` - Vite env typing

### Context

- `src/context/AuthContext.tsx` - auth state, login, logout, hydration from cookie/localStorage

### API / Utilities

- `src/lib/api.ts` - re-exports `apiClient`
- `src/lib/apiClient.ts` - axios client, auth headers, refresh-token retry, redirect logic
- `src/lib/utils.ts` - `cn()` and `formatDate()`

### Pages

- `src/pages/Login.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Customers.tsx`
- `src/pages/Products.tsx`
- `src/pages/Categories.tsx`
- `src/pages/Coupons.tsx`

### Components

- `src/components/Layout.tsx`
- `src/components/Header.tsx`
- `src/components/Sidebar.tsx`
- `src/components/PrivateRoute.tsx`
- `src/components/NotificationPanel.tsx`
- `src/components/CreateProductModal.tsx`
- `src/components/CreateCategoryModal.tsx`
- `src/components/EditCategoryModal.tsx`
- `src/components/DeleteCategoryModal.tsx`

### Services

- `src/services/productService.ts`
- `src/services/categoryService.ts`
- `src/services/couponService.ts`

### Public Assets

- `public/favicon_io/about.txt`
- `public/favicon_io/site.webmanifest`
- `public/favicon_io/favicon.ico`
- `public/favicon_io/favicon-16x16.png`
- `public/favicon_io/favicon-32x32.png`
- `public/favicon_io/apple-touch-icon.png`
- `public/favicon_io/android-chrome-192x192.png`
- `public/favicon_io/android-chrome-512x512.png`

## App Bootstrap and Layout

### `src/main.tsx`

- Reads theme from `localStorage` key `inkart-dashboard-theme`
- Defaults to dark mode unless stored value is exactly `light`
- Applies `body.dark` or `body.light` before React render
- Renders `<App />` inside `<StrictMode>`

### `src/App.tsx`

- Wraps everything with `AuthProvider`
- Uses `BrowserRouter` with `basename="/inkarts-admin"`
- Mounts `Toaster`
- Declares public and protected routes

### `src/components/Layout.tsx`

- Page shell is `Sidebar + Header + main content + NotificationPanel`
- Sidebar is collapsible on mobile
- Main content scrolls independently
- Notification panel is always mounted

## Routes

Actual route map from `src/App.tsx`:

| Route | Access | Component |
|---|---|---|
| `/login` | Public | `Login` |
| `/dashboard` | Admin only | `Dashboard` |
| `/customers` | Admin only | `Customers` |
| `/products` | Admin only | `Products` |
| `/categories` | Admin only | `Categories` |
| `/coupons` | Admin only | `Coupons` |
| `/` | Admin only | Redirects to `/dashboard` |
| `*` | Any | Redirects to `/dashboard` |

Navigation items in `Sidebar.tsx` match the routed pages:

- Dashboard
- Customers
- Products
- Categories
- Coupons

## Auth Flow

### `src/context/AuthContext.tsx`

Stores:

- `user`
- `token`
- `isLoading`

Behavior:

- On startup, reads `user` and `token` from cookies first, then `localStorage`
- `login()` stores `user`, `token`, and `refreshToken` in both cookies and `localStorage`
- `logout()` clears cookies and `localStorage`

### `src/components/PrivateRoute.tsx`

Protected access requires:

- token exists
- user exists
- `user.role === 'admin'`

While auth is hydrating, it renders a full-screen `Loading...` state.

### `src/lib/apiClient.ts`

This is the only real axios client used by the app.

Behavior:

- Adds `Authorization: Bearer <token>` for most requests
- Skips auth header for:
  - `/auth/login`
  - `/auth/register`
  - `/auth/refresh-token`
- On `401`, it tries `POST /auth/refresh-token` once if a refresh token exists
- If refresh fails, it clears auth storage and redirects to `/inkarts-admin/login`

`src/lib/api.ts` does not define a second client anymore; it only re-exports `apiClient`.

## Page-by-Page Analysis

### 1. Login Page

File:

- `src/pages/Login.tsx`

Responsibilities:

- Collects email and password
- Calls `POST /auth/login`
- Expects `token`, `refreshToken`, and `data.user`
- Rejects non-admin users
- Calls `login()` from auth context
- Navigates to `/dashboard`

Notable details:

- Contains visible encoding artifacts in placeholder/footer text
- Uses Sonner toasts for success and failure

### 2. Dashboard Page

File:

- `src/pages/Dashboard.tsx`

Responsibilities:

- Fetches summary counts
- Shows category distribution doughnut chart
- Shows coupon discount bar chart
- Shows recent registered users
- Shows quick links to other admin sections

API calls:

- `GET /users/all?limit=1`
- `GET /admin/products?limit=1`
- `GET /admin/coupons?page=1&limit=1`
- `GET /admin/categories`
- `GET /admin/products?page=1&limit=200`
- `GET /admin/coupons?page=1&limit=50`

Implementation details:

- Uses `Promise.allSettled`, not `Promise.all`, so partial success is allowed
- Uses recursive helpers to extract arrays/counts from inconsistent API shapes
- Auto-refreshes every 30 seconds
- Reads `inkart-dashboard-deleted-products` from `localStorage` so chart counts hide locally deleted products
- Updates chart theme colors when body theme changes

### 3. Customers Page

File:

- `src/pages/Customers.tsx`

Responsibilities:

- Lists users
- Supports search
- Paginates server-side
- Opens customer detail modal
- Deletes users

API calls:

- `GET /users/all?page={page}&limit=10&search={optional}`
- `DELETE /admin/users/:id`

Implementation details:

- Search fetch is debounced by `300ms`
- Response parsing is defensive and recursive
- Delete flow blocks deleting the currently logged-in admin
- Delete modal has focus trap, escape-to-close, and click-outside handling
- Customer detail modal is read-only

### 4. Products Page

File:

- `src/pages/Products.tsx`

Responsibilities:

- Lists products
- Edits product details
- Updates stock
- Deletes products
- Opens a dedicated create-product modal

API calls used directly in this page:

- `GET /admin/products?page={page}&limit=10`
- `GET /admin/categories`
- `GET /categories`
- `GET /categories/all`
- `PATCH /admin/products/:id`
- `POST /admin/products`
- `PATCH /admin/products/:id/stock`

API call used through service:

- `DELETE /admin/products/:id`

Implementation details:

- Extracts products from nested/variable response structures
- Builds category name lookup from category endpoints and nested product category data
- Clicking stock opens a stock-adjustment modal
- Deleted product IDs are also stored in `localStorage` under `inkart-dashboard-deleted-products`
- Product create button opens `CreateProductModal`
- A second inline modal exists in this file for create/edit, but the current UI uses it only for edit

### 5. Create Product Modal

File:

- `src/components/CreateProductModal.tsx`

Responsibilities:

- Dedicated create-product flow
- Validates fields
- Loads known active categories
- Uploads image with `FormData`

API calls:

- `GET /admin/categories`
- `GET /categories`
- `GET /categories/all`
- fallback `GET /admin/products?page=1&limit=200`
- `POST /admin/products`

Implementation details:

- Requires:
  - `name`
  - `price`
  - `description`
  - `category`
  - `basePrice`
  - image
- Accepts category by active category name or 24-char ObjectId
- Sends:
  - `name`
  - `slug`
  - `price`
  - `description`
  - `category`
  - `productType`
  - optional `stock`
  - `images`
  - `basePrice`
- Supports drag/drop image upload
- Uses `window.location.href = '/login'` on some auth failure paths, which does not include the app basename

### 6. Categories Page

File:

- `src/pages/Categories.tsx`

Responsibilities:

- Loads all categories
- Sorts newest first
- Paginates client-side
- Opens create/edit/delete modals

API behavior:

- Uses `getCategories()` from `categoryService`
- `getCategories()` tries `/admin/categories`, then `/categories`

Implementation details:

- This page does not use server-side pagination
- Status display is based on `isActive`

### 7. Category Modals

Files:

- `src/components/CreateCategoryModal.tsx`
- `src/components/EditCategoryModal.tsx`
- `src/components/DeleteCategoryModal.tsx`

API calls:

- `POST /admin/categories`
- `PATCH /admin/categories/:id`
- `DELETE /admin/categories/:id`

Implementation details:

- Create modal auto-generates slug from name unless user edits slug manually
- Create sends `FormData`
- Edit sends a regular patch payload
- All three modals implement keyboard and click-outside close handling

### 8. Coupons Page

File:

- `src/pages/Coupons.tsx`

Responsibilities:

- Lists coupons
- Shows small summary cards
- Creates coupons
- Edits coupons
- Deletes coupons

API calls:

- `GET /admin/coupons?page={page}&limit=10`
- `POST /admin/coupons`
- `PATCH /admin/coupons/:id`
- `DELETE /admin/coupons/:id`

Implementation details:

- Extracts coupon arrays and totals from nested payloads
- Supports either server pagination or local slicing fallback depending on response size/count behavior
- Validates:
  - code required
  - description required
  - discount value > 0
  - percentage <= 100
  - validUntil > validFrom
- `applicableCategories` is entered as comma-separated text
- Expired state is computed from `isActive` and `validUntil`
- Modal and delete dialog include focus trap and accessibility behaviors

## Shared Components

### `src/components/Sidebar.tsx`

- Renders route navigation
- Supports mobile drawer mode
- Handles logout confirmation modal
- Calls `POST /auth/logout`
- Clears local auth even if logout API fails

### `src/components/Header.tsx`

- Reads current route and derives page title
- Shows theme toggle
- Persists theme in `localStorage`
- Dispatches a `themechange` event on toggle
- Shows avatar initial from current user

### `src/components/NotificationPanel.tsx`

- Right-side slide panel
- Open by default
- Docked on desktop at viewport width `>= 1280`
- Overlay style on smaller screens
- Currently uses empty placeholder arrays for:
  - notifications
  - activities
  - manager contacts

This component is purely presentational right now. It does not call any API.

## Services Layer

### `src/services/productService.ts`

Exports:

- `createProduct(formData)` -> `POST /admin/products`
- `getProducts(page, limit)` -> `GET /admin/products`
- `updateProduct(productId, formData)` -> `PATCH /admin/products/:id`
- `updateStock(productId, data)` -> `PATCH /admin/products/:id/stock`
- `fetchCategories()` -> tries category endpoints
- `deleteProduct(productId)` -> `DELETE /admin/products/:id`

### `src/services/categoryService.ts`

Exports:

- `getCategories()` -> tries `/admin/categories`, then `/categories`
- `createCategory(payload)` -> `POST /admin/categories`
- `updateCategory(id, payload)` -> `PATCH /admin/categories/:id`
- `deleteCategory(id)` -> `DELETE /admin/categories/:id`
- `extractCategories(data)` -> recursive parser for mixed API shapes

### `src/services/couponService.ts`

Exports:

- `createCoupon(data)` -> `POST /admin/coupons`
- `updateCoupon(couponId, data)` -> `PATCH /admin/coupons/:id`
- `deleteCoupon(couponId)` -> `DELETE /admin/coupons/:id`

## Types

Defined in `src/types.ts`:

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

## API Endpoint Matrix

All backend endpoints referenced in the codebase:

| Method | Endpoint | Used In |
|---|---|---|
| POST | `/auth/login` | Login page |
| POST | `/auth/logout` | Sidebar |
| POST | `/auth/refresh-token` | apiClient interceptor |
| GET | `/users/all` | Dashboard, Customers |
| DELETE | `/admin/users/:id` | Customers |
| GET | `/admin/products` | Dashboard, Products, CreateProductModal, productService |
| POST | `/admin/products` | Products, CreateProductModal, productService |
| PATCH | `/admin/products/:id` | Products, productService |
| PATCH | `/admin/products/:id/stock` | Products, productService |
| DELETE | `/admin/products/:id` | Products, productService |
| GET | `/admin/categories` | Dashboard, Products, CreateProductModal, categoryService |
| GET | `/categories` | Products, CreateProductModal, categoryService |
| GET | `/categories/all` | Products, CreateProductModal |
| POST | `/admin/categories` | CreateCategoryModal, categoryService |
| PATCH | `/admin/categories/:id` | EditCategoryModal, categoryService |
| DELETE | `/admin/categories/:id` | DeleteCategoryModal, categoryService |
| GET | `/admin/coupons` | Dashboard, Coupons |
| POST | `/admin/coupons` | Coupons, couponService |
| PATCH | `/admin/coupons/:id` | Coupons, couponService |
| DELETE | `/admin/coupons/:id` | Coupons, couponService |

## Styling and UX Notes

`src/index.css` contains most shared styling and layout behavior:

- theme token definitions for dark and light mode
- utility classes such as:
  - `card`
  - `btn-primary`
  - `btn-ghost`
  - `btn-danger`
  - `input-field`
- table styling
- modal styling
- responsive product-table behavior
- badge styling
- theme toggle styling
- mobile sidebar behavior

The app uses a dark default theme and persists theme choice in:

- `localStorage['inkart-dashboard-theme']`

## Public Asset Notes

### `public/favicon_io/about.txt`

- Documents that the favicon was generated from the `Knewave` font.

### `public/favicon_io/site.webmanifest`

- Declares standalone display mode
- Uses icon paths like `/android-chrome-192x192.png`

Note: the manifest icon paths are root-relative, while the actual image files live inside `public/favicon_io/`. That mismatch is worth checking during deployment.

## Observed Quirks and Gaps

These are based on the current code, not guesses:

- `README.md` was previously outdated; this version corrects it.
- `src/lib/api.ts` is only a re-export and no longer represents a separate API client.
- `vite.config.ts` includes a `/api` proxy, but the frontend currently uses absolute API URLs through `apiClient`.
- `CreateProductModal.tsx` redirects to `/login` in a couple of failure branches instead of `/inkarts-admin/login`.
- `Products.tsx` contains an inline create/edit modal, but the visible create flow uses `CreateProductModal`.
- `CreateProductModal.tsx` collects both `price` and `basePrice`, while product listing/editing is centered around `basePrice`; backend expectations should be kept in mind before refactoring.
- Several files contain encoding artifacts in UI strings such as `Youâ€™ll`, `â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢`, and `â‚¹`.
- `NotificationPanel.tsx` is fully wired into layout but uses placeholder arrays and no live data source yet.
- `package.json` still includes packages that are not used by the current code paths.

## Local Development

1. Install dependencies

```bash
npm install
```

2. Add env values

```env
VITE_API_BASE_URL="https://inkart-virid.vercel.app/api/v1"
```

3. Start the dev server

```bash
npm run dev
```

4. Open the app

- `http://localhost:8000/inkarts-admin/login`

## Verification Performed

- Full repository file inventory reviewed
- Routes verified from `src/App.tsx`
- Components and pages inspected individually
- Service layer inspected individually
- API endpoints cross-checked from code usage
- TypeScript check passed with `npm run lint`
