import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { Database, Package, FileText, Scale } from 'lucide-react';

export default function SettingsLayout() {
  const location = useLocation();

  const tabs = [
    { name: 'Column Mappings', path: '/superadmin/settings/mappings', icon: Database },
    { name: 'Items', path: '/superadmin/settings/items', icon: Package },
    { name: 'VAT Notes', path: '/superadmin/settings/vat-notes', icon: FileText },
    { name: 'Unit Conversions', path: '/superadmin/settings/unit-conversions', icon: Scale },
  ];

  // If we're exactly at /superadmin/settings, redirect to the first tab
  if (location.pathname === '/superadmin/settings' || location.pathname === '/superadmin/settings/') {
    return <Navigate to="/superadmin/settings/mappings" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:justify-between md:items-center">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Global Settings</h2>
          <p className="text-slate-400 text-sm mt-1">Configure system-wide parameters and mappings.</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden">
        <div className="border-b border-slate-700 overflow-x-auto">
          <nav className="flex space-x-1 p-2" aria-label="Tabs">
            {tabs.map((tab) => {
              const isActive = location.pathname.startsWith(tab.path);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.name}
                  to={tab.path}
                  className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-200' : 'text-slate-500'}`} />
                  <span>{tab.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
