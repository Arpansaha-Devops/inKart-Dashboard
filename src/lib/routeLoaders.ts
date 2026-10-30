export const routeLoaders = {
  '/login': () => import('../pages/Login'),
  '/dashboard': () => import('../pages/Dashboard'),
  '/orders': () => import('../pages/Orders'),
  '/shipment-tracking': () => import('../pages/ShipmentTracking'),
  '/analytics': () => import('../pages/Analytics'),
  '/customers': () => import('../pages/Customers'),
  '/products': () => import('../pages/Products'),
  '/categories': () => import('../pages/Categories'),
  '/coupons': () => import('../pages/Coupons'),
};

export function prefetchRoute(path: string) {
  const load = routeLoaders[path as keyof typeof routeLoaders];
  // Navigation will retry a failed speculative load through React.lazy.
  if (load) void load().catch(() => {});
}
