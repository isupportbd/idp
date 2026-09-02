import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

interface ProtectedRouteProps {
  allowedRoles: string[];
  children?: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, token } = useAuthStore();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // Redirect to default dashboard if user doesn't have permission
    return <Navigate to={user.role === 'superadmin' ? '/superadmin' : '/admin'} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
