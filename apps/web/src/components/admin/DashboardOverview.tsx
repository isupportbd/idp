import { Link } from 'react-router-dom';
import UploadIcon3D from '../icons/UploadIcon3D';
import { useAuthStore } from '../../stores/auth';

export default function DashboardOverview() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="flex flex-wrap justify-center gap-6">
        
        <Link 
          to="/admin/clients" 
          className="flex-1 min-w-[220px] max-w-[300px] glass-panel p-6 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-2xl hover:border-blue-500/50 hover:bg-slate-700/50"
        >
          <div className="text-4xl mb-4">💼</div>
          <h3 className="text-lg font-semibold m-0 mb-2 text-slate-100">Clients</h3>
          <p className="m-0 text-sm text-slate-400">Manage client information and settings.</p>
        </Link>

        {isAdmin && (
          <Link 
            to="/admin/client-credentials" 
            className="flex-1 min-w-[220px] max-w-[300px] glass-panel p-6 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-2xl hover:border-blue-500/50 hover:bg-slate-700/50"
          >
            <div className="text-4xl mb-4">🔑</div>
            <h3 className="text-lg font-semibold m-0 mb-2 text-slate-100">User Name & Password</h3>
            <p className="m-0 text-sm text-slate-400">Save and manage client login credentials.</p>
          </Link>
        )}

        {user?.role === 'admin' && (
          <Link 
            to="/admin/users" 
            className="flex-1 min-w-[220px] max-w-[300px] glass-panel p-6 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-2xl hover:border-blue-500/50 hover:bg-slate-700/50"
          >
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-lg font-semibold m-0 mb-2 text-slate-100">Users</h3>
            <p className="m-0 text-sm text-slate-400">Manage users within your organization.</p>
          </Link>
        )}

        {user?.role === 'admin' && (
          <Link 
            to="/admin/sales-rates" 
            className="flex-1 min-w-[220px] max-w-[300px] glass-panel p-6 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-2xl hover:border-blue-500/50 hover:bg-slate-700/50"
          >
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-lg font-semibold m-0 mb-2 text-slate-100">Sales Rates</h3>
            <p className="m-0 text-sm text-slate-400">Configure client and item-wise sales rates.</p>
          </Link>
        )}

        {user?.role === 'admin' && (
          <Link 
            to="/admin/upload" 
            className="flex-1 min-w-[220px] max-w-[300px] glass-panel p-6 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-2xl hover:border-blue-500/50 hover:bg-slate-700/50"
          >
            <div className="mb-4"><UploadIcon3D size={64} /></div>
            <h3 className="text-lg font-semibold m-0 mb-2 text-slate-100">Upload File</h3>
            <p className="m-0 text-sm text-slate-400">Excel/CSV Format only</p>
          </Link>
        )}

        {isSuperAdmin && (
          <Link 
            to="/admin/purchases" 
            className="flex-1 min-w-[220px] max-w-[300px] glass-panel p-6 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-2xl hover:border-blue-500/50 hover:bg-slate-700/50"
          >
            <div className="text-4xl mb-4">🛒</div>
            <h3 className="text-lg font-semibold m-0 mb-2 text-slate-100">Purchases</h3>
            <p className="m-0 text-sm text-slate-400">View and manage all system purchases.</p>
          </Link>
        )}

        <Link 
          to="/admin/reports" 
          className="flex-1 min-w-[220px] max-w-[300px] glass-panel p-6 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-2xl hover:border-blue-500/50 hover:bg-slate-700/50"
        >
          <div className="text-4xl mb-4">📈</div>
          <h3 className="text-lg font-semibold m-0 mb-2 text-slate-100">Reports</h3>
          <p className="m-0 text-sm text-slate-400">View calculated purchase, sales, and VAT reports.</p>
        </Link>

      </div>
    </div>
  );
}
