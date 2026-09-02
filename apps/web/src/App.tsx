import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import LandingPage from './components/auth/LandingPage';
import LoginForm from './components/auth/LoginForm';
import AdminLayout from './components/admin/AdminLayout';
import DashboardOverview from './components/admin/DashboardOverview';
import UploadPurchases from './components/admin/UploadPurchases';
import ClientsManager from './components/admin/ClientsManager';
import TenantPurchases from './components/admin/TenantPurchases';
import TenantReports from './components/admin/TenantReports';
import SubmissionsPage from './components/admin/SubmissionsPage';
import SalesRatesManager from './components/admin/SalesRatesManager';
import ClientCredentialsManager from './components/admin/ClientCredentialsManager';
import SuperAdminDashboard from './components/superadmin/SuperAdminDashboard';
import GlobalPurchases from './components/superadmin/GlobalPurchases';
import GlobalReports from './components/superadmin/GlobalReports';
import UsersManager from './components/admin/UsersManager';
import ProfileSettings from './components/shared/ProfileSettings';
import SettingsLayout from './components/superadmin/settings/SettingsLayout';
import ColumnMappings from './components/superadmin/settings/ColumnMappings';
import GlobalItems from './components/superadmin/settings/GlobalItems';
import VatNotes from './components/superadmin/settings/VatNotes';
import UnitConversions from './components/superadmin/settings/UnitConversions';
import ProtectedRoute from './components/auth/ProtectedRoute';
import TenantsManager from './components/superadmin/TenantsManager';
import PlansManager from './components/superadmin/PlansManager';
import StorageStats from './components/superadmin/StorageStats';

export default function App() {
  const { user, token, logout } = useAuthStore();

  // If token exists but user is lost, force logout
  if (token && !user) {
    logout();
    return <Navigate to="/login" />;
  }

  return (
    <Routes>
      <Route 
        path="/landing" 
        element={!token ? <LandingPage /> : <Navigate to={user?.role === 'superadmin' ? '/superadmin' : '/admin'} />} 
      />
      <Route 
        path="/login" 
        element={!token ? <LoginForm /> : <Navigate to={user?.role === 'superadmin' ? '/superadmin' : '/admin'} />} 
      />
      
      {/* Super Admin Routes */}
      <Route 
        path="/superadmin" 
        element={
          token && user?.role === 'superadmin' ? 
            <AdminLayout /> : 
            <Navigate to="/login" />
        } 
      >
        <Route index element={<SuperAdminDashboard />} />
        <Route path="tenants" element={<TenantsManager />} />
        <Route path="plans" element={<PlansManager />} />
        <Route path="purchases" element={<GlobalPurchases />} />
        <Route path="reports" element={<GlobalReports />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route path="mappings" element={<ColumnMappings />} />
          <Route path="items" element={<GlobalItems />} />
          <Route path="vat-notes" element={<VatNotes />} />
          <Route path="unit-conversions" element={<UnitConversions />} />
        </Route>
        <Route path="storage" element={<StorageStats />} />
        <Route path="profile" element={<ProfileSettings />} />
      </Route>

      {/* Admin and User (Sub-user) Routes */}
      <Route 
        path="/admin" 
        element={
          token && (user?.role === 'admin' || user?.role === 'user') ? 
            <AdminLayout /> : 
            <Navigate to="/login" />
        } 
      >
        <Route index element={<DashboardOverview />} />
        <Route path="upload" element={<UploadPurchases />} />
        <Route path="purchases" element={<TenantPurchases />} />
        <Route path="reports" element={<TenantReports />} />
        <Route path="submissions" element={<SubmissionsPage />} />
        <Route path="profile" element={<ProfileSettings />} />

        {/* Admin-only routes */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="clients" element={<ClientsManager />} />
          <Route path="sales-rates" element={<SalesRatesManager />} />
          <Route path="client-credentials" element={<ClientCredentialsManager />} />
          <Route path="users" element={<UsersManager />} />
        </Route>
      </Route>

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to={token ? (user?.role === 'superadmin' ? '/superadmin' : '/admin') : "/landing"} />} />
      <Route path="*" element={<Navigate to={token ? (user?.role === 'superadmin' ? '/superadmin' : '/admin') : "/landing"} />} />
    </Routes>
  );
}
