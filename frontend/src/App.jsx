import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout        from './components/layout/Layout';
import LoginPage     from './pages/auth/LoginPage';
import SignupPage    from './pages/auth/SignupPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import OrdersPage    from './pages/orders/OrdersPage';
import InventoryPage from './pages/inventory/InventoryPage';
import SalesPage     from './pages/sales/SalesPage';
import CustomersPage from './pages/customers/CustomersPage';
import BillingPage   from './pages/billing/BillingPage';
import ReportsPage   from './pages/reports/ReportsPage';
import WhatsAppPage  from './pages/whatsapp/WhatsAppPage';

function ProtectedRoute({ children }) {
  const { isLoggedIn, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-10 h-10 bg-orange-500 rounded-xl animate-pulse" />
    </div>
  );
  return isLoggedIn ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isLoggedIn, loading } = useAuth();
  if (loading) return null;
  return isLoggedIn ? <Navigate to="/" replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"  element={<PublicRoute><LoginPage  /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/"          element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/orders"    element={<ProtectedRoute><OrdersPage    /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
      <Route path="/sales"     element={<ProtectedRoute><SalesPage     /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
      <Route path="/billing"   element={<ProtectedRoute><BillingPage   /></ProtectedRoute>} />
      <Route path="/reports"   element={<ProtectedRoute><ReportsPage   /></ProtectedRoute>} />
      <Route path="/whatsapp"  element={<ProtectedRoute><WhatsAppPage  /></ProtectedRoute>} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-center" toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            background: '#1a1a1a',
            color: '#fff',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#f97316', secondary: '#fff' } },
        }} />
      </BrowserRouter>
    </AuthProvider>
  );
}
