import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Check, X, Search } from 'lucide-react';
import { useState } from 'react';

export default function TenantsManager() {
  const queryClient = useQueryClient();
  const [approveDays, setApproveDays] = useState<{ [key: number]: string }>({});
  const [tenantSearchTerm, setTenantSearchTerm] = useState('');

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-signups'],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin['pending-signups'].$get();
      return res.json();
    }
  });

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin['tenants'].$get();
      return res.json();
    }
  });

  const approveMutation = useMutation({
    mutationFn: async ({ userId, days }: { userId: number, days?: number }) => {
      const res = await (apiClient as any).api.superadmin['approve-signup'].$post({ json: { userId, days } });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-signups'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await (apiClient as any).api.superadmin['reject-signup'].$post({ json: { userId } });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-signups'] });
    }
  });

  const pendingUsers = pendingData?.data || [];
  const tenants = tenantsData?.data || [];

  const filteredTenants = tenants.filter((tenant: any) =>
    tenant.name.toLowerCase().includes(tenantSearchTerm.toLowerCase()) ||
    tenant.email.toLowerCase().includes(tenantSearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 p-6 bg-slate-900 min-h-screen">
      {/* Pending Signups */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-slate-100">Pending Approvals</h2>
          <span className="bg-blue-500/20 text-blue-400 py-1 px-3 rounded-full text-sm font-medium border border-blue-500/30">
            {pendingUsers.length} Pending
          </span>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-700/50 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-4 py-2.5 font-medium tracking-wide">Name</th>
                <th className="px-4 py-2.5 font-medium tracking-wide">Email</th>
                <th className="px-4 py-2.5 font-medium tracking-wide">Mobile</th>
                <th className="px-4 py-2.5 font-medium tracking-wide">Trx ID</th>
                <th className="px-4 py-2.5 font-medium tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {pendingLoading ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-400">Loading...</td></tr>
              ) : pendingUsers.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-400">No pending signups.</td></tr>
              ) : (
                pendingUsers.map((user: any) => (
                  <tr key={user.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-2.5 text-slate-200">{user.name}</td>
                    <td className="px-4 py-2.5 text-slate-400">{user.email}</td>
                    <td className="px-4 py-2.5 text-slate-400">{user.mobile}</td>
                    <td className="px-4 py-2.5 text-emerald-400 font-mono">{user.trxId || 'N/A'}</td>
                    <td className="px-4 py-2.5 flex justify-end items-center space-x-2">
                      <input
                        type="number"
                        placeholder="Days"
                        className="w-20 px-2 py-1 bg-slate-900 border border-slate-600 rounded-md text-slate-200 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        value={approveDays[user.id] || ''}
                        onChange={(e) => setApproveDays({ ...approveDays, [user.id]: e.target.value })}
                      />
                      <button
                        onClick={() => approveMutation.mutate({ userId: user.id, days: approveDays[user.id] ? parseInt(approveDays[user.id]) : undefined })}
                        className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/20 rounded-lg transition-all"
                        title="Approve"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to reject and delete this user?')) {
                            rejectMutation.mutate(user.id);
                          }
                        }}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all"
                        title="Reject"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Tenants */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-slate-100">Active Tenants</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tenants..."
              value={tenantSearchTerm}
              onChange={(e) => setTenantSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none w-64"
            />
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-700/50 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-4 py-2.5 font-medium tracking-wide">Name</th>
                <th className="px-4 py-2.5 font-medium tracking-wide">Email</th>
                <th className="px-4 py-2.5 font-medium tracking-wide">Status</th>
                <th className="px-4 py-2.5 font-medium tracking-wide">Exp Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {tenantsLoading ? (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-400">Loading...</td></tr>
              ) : filteredTenants.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-400">No tenants found.</td></tr>
              ) : (
                filteredTenants.map((tenant: any) => (
                  <tr key={tenant.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-2.5 text-slate-200">{tenant.name}</td>
                    <td className="px-4 py-2.5 text-slate-400">{tenant.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${tenant.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/20 text-red-400 border border-red-500/20'}`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {tenant.expDate ? new Date(tenant.expDate).toLocaleDateString() : 'Lifetime'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
