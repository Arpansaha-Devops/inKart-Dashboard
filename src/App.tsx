import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LazyMotion, domAnimation } from 'motion/react';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Customers from './pages/Customers';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Coupons from './pages/Coupons';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));

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
          <Route path="/login" element={<Login />} />

          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Suspense fallback={<FullScreenLoader />}><Dashboard /></Suspense>} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/analytics" element={<Suspense fallback={<FullScreenLoader />}><Analytics /></Suspense>} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/coupons" element={<Coupons />} />
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
