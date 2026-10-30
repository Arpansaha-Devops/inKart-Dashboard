import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LazyMotion, domAnimation } from 'motion/react';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import { routeLoaders } from './lib/routeLoaders';

const Login = lazy(routeLoaders['/login']);
const Dashboard = lazy(routeLoaders['/dashboard']);
const Analytics = lazy(routeLoaders['/analytics']);
const Customers = lazy(routeLoaders['/customers']);
const Orders = lazy(routeLoaders['/orders']);
const Products = lazy(routeLoaders['/products']);
const Categories = lazy(routeLoaders['/categories']);
const Coupons = lazy(routeLoaders['/coupons']);
const ShipmentTracking = lazy(routeLoaders['/shipment-tracking']);

const FullScreenLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
  </div>
);

export default function App() {
  return (
    <LazyMotion features={domAnimation}>
      <AuthProvider>
      <Router basename="/admin">
        <Routes>
          <Route path="/login" element={<Suspense fallback={<FullScreenLoader />}><Login /></Suspense>} />

          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Suspense fallback={<FullScreenLoader />}><Dashboard /></Suspense>} />
              <Route path="/orders" element={<Suspense fallback={<FullScreenLoader />}><Orders /></Suspense>} />
              <Route path="/shipment-tracking" element={<Suspense fallback={<FullScreenLoader />}><ShipmentTracking /></Suspense>} />
              <Route path="/analytics" element={<Suspense fallback={<FullScreenLoader />}><Analytics /></Suspense>} />
              <Route path="/customers" element={<Suspense fallback={<FullScreenLoader />}><Customers /></Suspense>} />
              <Route path="/products" element={<Suspense fallback={<FullScreenLoader />}><Products /></Suspense>} />
              <Route path="/categories" element={<Suspense fallback={<FullScreenLoader />}><Categories /></Suspense>} />
              <Route path="/coupons" element={<Suspense fallback={<FullScreenLoader />}><Coupons /></Suspense>} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>

      <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </LazyMotion>
  );
}
