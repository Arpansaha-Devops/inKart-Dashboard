# InkArt Admin Dashboard

A React + TypeScript admin portal for managing the InkArt commerce backend.

This README documents the current codebase as implemented in this repository: routes, pages, API calls, data flow, auth behavior, and operational notes.

## 1. Project Overview

The dashboard is a client-side single-page app that provides admin-facing management tools for:
- Admin authentication
- Dashboard statistics
- Customer listing and search
- Product listing, create, edit, and stock updates
- Coupon listing, create, edit, and delete

The app is deployed under the path base `/inkarts-admin` and communicates with the backend API at:
- `https://inkart-virid.vercel.app/api/v1`

## 2. Tech Stack

- React 19
- TypeScript 5
- Vite 6
- React Router DOM 7
- Tailwind CSS 4
- Axios
- Sonner (toast notifications)
- Lucide React (icons)
- Motion (animations)
- js-cookie

## 3. Scripts

From `package.json`:

- `npm run dev` - Start Vite dev server
- `npm run build` - Production build
- `npm run preview` - Preview production build
- `npm run lint` - Type check (`tsc --noEmit`)
- `npm run clean` - Remove `dist`

## 4. Environment Variables

Expected env keys:

- `VITE_API_BASE_URL` (required for API base URL)
- `ADMIN_EMAIL` (currently not consumed in frontend code)
- `ADMIN_PASSWORD` (currently not consumed in frontend code)
- `GEMINI_API_KEY` (not currently used by app features)

Current API clients default to:
- `VITE_API_BASE_URL` if provided
- fallback `https://inkart-virid.vercel.app/api/v1`

## 5. App Bootstrapping

- Entry: `src/main.tsx`
- Root app: `src/App.tsx`
- Router basename: `/inkarts-admin`
- Auth provider wraps the entire app

## 6. Implemented Route Map

From `src/App.tsx`:

| Route | Access | Component | Notes |
|---|---|---|---|
| `/login` | Public | `src/pages/Login.tsx` | Admin login flow |
| `/dashboard` | Admin only | `src/pages/Dashboard.tsx` | Stats cards |
| `/customers` | Admin only | `src/pages/Customers.tsx` | Users table + search |
| `/products` | Admin only | `src/pages/Products.tsx` | Product management |
| `/coupons` | Admin only | `src/pages/Coupons.tsx` | Coupon management |
| `/` | Admin only | Redirect to `/dashboard` | |
| `*` | Any | Redirect to `/dashboard` | |

### Important

There is currently **no `/categories` route/page registered** in `App.tsx` in this code snapshot.

## 7. Access Control and Auth Flow

### Auth context (`src/context/AuthContext.tsx`)

- Stores `user`, `token`, `isLoading` in React context
- Initializes from cookies first, then localStorage
- `login()` writes to both cookies and localStorage
- `logout()` clears both cookies and localStorage

### Private route guard (`src/components/PrivateRoute.tsx`)

A route is allowed only when:
- token exists
- user exists
- `user.role === 'admin'`

Otherwise redirect to `/login`.

### Login page (`src/pages/Login.tsx`)

- Calls `POST /auth/login`
- Expects payload with `token`, `refreshToken`, and `data.user`
- Rejects non-admin users (`role !== 'admin'`)
- On success: stores auth in context + navigates to `/dashboard`

### Logout flow (`src/components/Sidebar.tsx`)

- Calls `POST /auth/logout`
- Clears local auth regardless of API response
- Redirects to `/login`

## 8. API Clients

### `src/lib/api.ts`

- Used by login, dashboard, customers, sidebar logout, create product modal category lookup
- Adds auth token from cookies/localStorage on each request
- On 401: clears cookies + localStorage, redirects to `/login`

### `src/lib/apiClient.ts`

- Used by most admin feature pages/services
- Adds auth token from localStorage
- On 401: clears localStorage, redirects to `/login`

## 9. Pages and Data Fetching

### 9.1 Dashboard (`src/pages/Dashboard.tsx`)

#### API calls
- `GET /users/all?limit=1`
- `GET /admin/products?limit=1`

#### Behavior
- Fetches both in parallel
- Uses recursive count extraction to support variable response shapes
- Auto-refreshes stats every 30 seconds
- Orders and revenue are currently placeholder values in frontend state

### 9.2 Customers (`src/pages/Customers.tsx`)

#### API call
- `GET /users/all` with query params:
  - `page`
  - `limit`
  - optional `search`

#### Behavior
- Debounced fetch via 300ms timeout on search/page change
- Supports variable response envelopes (array, nested data keys)
- Shows paginated table with user detail modal

### 9.3 Products (`src/pages/Products.tsx`)

#### API calls
- Category lookup:
  - `GET /admin/categories`
  - fallback `GET /categories`
  - fallback `GET /categories/all`
- Product list:
  - `GET /admin/products?page={page}&limit={limit}`
- Product create/update:
  - `POST /admin/products`
  - `PATCH /admin/products/:productId`
- Stock update:
  - `PATCH /admin/products/:productId/stock`

#### Behavior
- Extracts category names recursively from response payloads
- Extracts product arrays recursively from response payloads
- Includes edit modal and stock modal
- Product delete button is visible in UI but not wired to an API handler in this current version

### 9.4 Create Product Modal (`src/components/CreateProductModal.tsx`)

#### API calls
- Category source:
  - `GET /admin/categories`
  - fallback `GET /categories`
  - fallback `GET /categories/all`
  - fallback to parsing `GET /admin/products?page=1&limit=200`
- Product creation:
  - `POST /admin/products` via service

#### Behavior
- Resolves category input to ObjectId or matched known category name
- Validates required form fields
- Uses multipart `FormData`
- Sends product image as `image` key

### 9.5 Coupons (`src/pages/Coupons.tsx`)

#### API calls
- `GET /admin/coupons?page={page}&limit=10`
- `POST /admin/coupons`
- `PATCH /admin/coupons/:couponId`
- `DELETE /admin/coupons/:couponId`

#### Behavior
- Full create/edit modal with validation
- Delete confirmation modal with accessibility handling:
  - Escape-to-close
  - click-outside close
  - focus trapping and restore
- Handles nested/variable coupon response shapes

## 10. Service Layer

### `src/services/productService.ts`

Exports:
- `createProduct(formData)` -> `POST /admin/products`
- `getProducts(page, limit)` -> `GET /admin/products`
- `updateProduct(productId, formData)` -> `PATCH /admin/products/:id`
- `updateStock(productId, data)` -> `PATCH /admin/products/:id/stock`
- `fetchCategories()` -> tries:
  - `/admin/categories`
  - `/categories`
  - `/categories/all`

### `src/services/couponService.ts`

Exports:
- `createCoupon(data)` -> `POST /admin/coupons`
- `updateCoupon(couponId, data)` -> `PATCH /admin/coupons/:id`
- `deleteCoupon(couponId)` -> `DELETE /admin/coupons/:id`

## 11. UI Architecture

- `Layout` composes `Sidebar + Header + Outlet`
- Sidebar is responsive with mobile backdrop
- Header computes title from current pathname
- Shared utility classes in `src/index.css`:
  - `btn-primary`
  - `input-field`
  - `card`

## 12. Types

Defined in `src/types.ts`:
- `User`
- `Product`
- `AuthResponse`
- `PaginatedResponse<T>`
- `Coupon`
- `CreateCouponPayload`
- `CouponResponse`

## 13. Backend Endpoint Matrix (Used in Code)

| Method | Endpoint | Used by |
|---|---|---|
| POST | `/auth/login` | Login page |
| POST | `/auth/logout` | Sidebar logout |
| GET | `/users/all` | Dashboard, Customers |
| GET | `/admin/products` | Dashboard, Products, CreateProductModal fallback |
| POST | `/admin/products` | Products page, CreateProductModal, product service |
| PATCH | `/admin/products/:id` | Products page, product service |
| PATCH | `/admin/products/:id/stock` | Products page, product service |
| GET | `/admin/categories` | Products page, CreateProductModal, product service fallback |
| GET | `/categories` | Products page fallback, CreateProductModal fallback, product service fallback |
| GET | `/categories/all` | Products page fallback, CreateProductModal fallback, product service fallback |
| GET | `/admin/coupons` | Coupons page |
| POST | `/admin/coupons` | coupon service |
| PATCH | `/admin/coupons/:id` | coupon service |
| DELETE | `/admin/coupons/:id` | coupon service |

## 14. Known Gaps and Notes

- `Categories` management page is not currently routed in `App.tsx` in this snapshot.
- Product delete action is not wired to an API call in `Products.tsx` (UI button exists).
- Two axios clients (`api.ts` and `apiClient.ts`) have similar responsibilities and could be unified.
- Some text encoding artifacts appear in UI strings (`â€¢`, `â‚¹`) due to source file encoding.

## 15. Local Development

1. Install dependencies
```bash
npm install
```

2. Configure `.env`
```env
VITE_API_BASE_URL="https://inkart-virid.vercel.app/api/v1"
```

3. Start development server
```bash
npm run dev
```

4. Open app
- `http://localhost:8000/inkarts-admin/login`

## 16. Build and Preview

```bash
npm run build
npm run preview
```

## 17. Deployment Considerations

- Router basename is fixed to `/inkarts-admin`; hosting must serve app at that base path.
- Ensure backend CORS and auth headers allow admin domain/origin.
- Keep `VITE_API_BASE_URL` aligned with target environment.
