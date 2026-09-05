import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Users, CreditCard, ShoppingCart, Settings as SettingsIcon, LineChart } from 'lucide-react';

export default function SuperAdminDashboard() {
  const { data: pendingData } = useQuery({
    queryKey: ['pending-signups'],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin['pending-signups'].$get();
      return res.json();
    },
    refetchInterval: 30000 // Refetch every 30s
  });
  
  const pendingCount = pendingData?.data?.length || 0;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      <div className="flex flex-wrap justify-center gap-6">
        
        <Link 
          to="/superadmin/tenants" 
          className="relative flex-1 min-w-[240px] max-w-[320px] glass-panel p-8 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-blue-900/20 hover:border-blue-500/50 group backdrop-blur-sm"
        >
          <div className="p-4 bg-blue-500/10 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
            <Users size={40} className="text-blue-400" />
          </div>
          <h3 className="text-xl font-bold m-0 mb-3 text-slate-100 tracking-wide">Approvals & Tenants</h3>
          <p className="m-0 text-sm text-slate-400 leading-relaxed">Manage pending signups and active clients.</p>
          {pendingCount > 0 && (
            <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-red-500/30">
              {pendingCount}
            </div>
          )}
        </Link>

        <Link 
          to="/superadmin/plans" 
          className="flex-1 min-w-[240px] max-w-[320px] glass-panel p-8 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-900/20 hover:border-emerald-500/50 group backdrop-blur-sm"
        >
          <div className="p-4 bg-emerald-500/10 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
            <CreditCard size={40} className="text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold m-0 mb-3 text-slate-100 tracking-wide">Pricing Plans</h3>
          <p className="m-0 text-sm text-slate-400 leading-relaxed">Configure global pricing tiers and limits.</p>
        </Link>

        <Link 
          to="/superadmin/purchases" 
          className="flex-1 min-w-[240px] max-w-[320px] glass-panel p-8 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-orange-900/20 hover:border-orange-500/50 group backdrop-blur-sm"
        >
          <div className="p-4 bg-orange-500/10 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
            <ShoppingCart size={40} className="text-orange-400" />
          </div>
          <h3 className="text-xl font-bold m-0 mb-3 text-slate-100 tracking-wide">System Purchases</h3>
          <p className="m-0 text-sm text-slate-400 leading-relaxed">View and manage all system purchases globally.</p>
        </Link>

        <Link 
          to="/superadmin/settings" 
          className="flex-1 min-w-[240px] max-w-[320px] glass-panel p-8 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-purple-900/20 hover:border-purple-500/50 group backdrop-blur-sm"
        >
          <div className="p-4 bg-purple-500/10 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
            <SettingsIcon size={40} className="text-purple-400" />
          </div>
          <h3 className="text-xl font-bold m-0 mb-3 text-slate-100 tracking-wide">Global Settings</h3>
          <p className="m-0 text-sm text-slate-400 leading-relaxed">Manage global system configurations.</p>
        </Link>
        
        <Link 
          to="/superadmin/reports" 
          className="flex-1 min-w-[240px] max-w-[320px] glass-panel p-8 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-indigo-900/20 hover:border-indigo-500/50 group backdrop-blur-sm"
        >
          <div className="p-4 bg-indigo-500/10 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
            <LineChart size={40} className="text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold m-0 mb-3 text-slate-100 tracking-wide">Reports</h3>
          <p className="m-0 text-sm text-slate-400 leading-relaxed">View calculated purchase, sales, and VAT reports.</p>
        </Link>

        <Link 
          to="/superadmin/submissions" 
          className="flex-1 min-w-[240px] max-w-[320px] glass-panel p-8 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-900/20 hover:border-emerald-500/50 group backdrop-blur-sm"
        >
          <div className="p-4 bg-emerald-500/10 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <h3 className="text-xl font-bold m-0 mb-3 text-slate-100 tracking-wide">Submissions</h3>
          <p className="m-0 text-sm text-slate-400 leading-relaxed">View and manage all VAT submissions.</p>
        </Link>

        <Link 
          to="/superadmin/storage" 
          className="flex-1 min-w-[240px] max-w-[320px] glass-panel p-8 text-slate-200 no-underline transition-all duration-300 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-cyan-900/20 hover:border-cyan-500/50 group backdrop-blur-sm"
        >
          <div className="p-4 bg-cyan-500/10 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><line x1="22" y1="12" x2="2" y2="12"></line><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path><line x1="6" y1="16" x2="6.01" y2="16"></line><line x1="10" y1="16" x2="10.01" y2="16"></line></svg>
          </div>
          <h3 className="text-xl font-bold m-0 mb-3 text-slate-100 tracking-wide">Storage Overview</h3>
          <p className="m-0 text-sm text-slate-400 leading-relaxed">View database, backend, and frontend storage usage.</p>
        </Link>

      </div>
    </div>
  );
}
