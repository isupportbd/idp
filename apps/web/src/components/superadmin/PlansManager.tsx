import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Plus, Trash2, Edit, Search } from 'lucide-react';
import { useState } from 'react';

export default function PlansManager() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '', rateMonthly: 0, rateYearly: 0, maxUsers: 0, yearlyDiscountPercent: 0
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Automatically calculate yearly discount
  const calculateDiscount = (monthly: number, yearly: number) => {
    if (monthly > 0) {
      const discount = Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
      return Math.max(0, discount);
    }
    return 0;
  };

  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin.plans.$get();
      return res.json();
    }
  });

  const addMutation = useMutation({
    mutationFn: async (planData: typeof formData) => {
      let res;
      if (editingId) {
        res = await (apiClient as any).api.superadmin.plans[':id'].$put({ 
          param: { id: editingId.toString() },
          json: planData 
        });
      } else {
        res = await (apiClient as any).api.superadmin.plans.$post({ json: planData });
      }
      
      if (!res.ok) {
        let errMsg = 'Failed to save plan.';
        try {
          const errData = await res.json();
          errMsg = errData.error?.message || JSON.stringify(errData);
        } catch(e) {}
        throw new Error(errMsg);
      }
      return res.json();
    },
    onError: (err) => alert(err.message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: '', rateMonthly: 0, rateYearly: 0, maxUsers: 0, yearlyDiscountPercent: 0 });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await (apiClient as any).api.superadmin.plans[':id'].$delete({ param: { id: id.toString() } });
      if (!res.ok) throw new Error('Failed to delete plan.');
      return res.json();
    },
    onError: (err) => alert(err.message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans'] })
  });

  const handleEdit = (plan: any) => {
    setFormData({
      name: plan.name,
      rateMonthly: plan.rateMonthly,
      rateYearly: plan.rateYearly,
      maxUsers: plan.maxUsers,
      yearlyDiscountPercent: plan.yearlyDiscountPercent
    });
    setEditingId(plan.id);
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', rateMonthly: 0, rateYearly: 0, maxUsers: 0, yearlyDiscountPercent: 0 });
  };

  const plans = data?.data || [];

  const filteredPlans = plans.filter((plan: any) => 
    plan.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-slate-100">Subscription Plans</h2>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search plans..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none w-64"
            />
          </div>
          <button
            onClick={() => {
              if (isAdding) handleCancel();
              else setIsAdding(true);
            }}
            className="flex items-center space-x-2 glass-button px-4 py-2 rounded-lg"
          >
            {isAdding ? <span>Cancel</span> : <><Plus className="w-5 h-5" /><span>Add Plan</span></>}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="glass-panel p-6 rounded-xl grid grid-cols-2 md:grid-cols-7 gap-4 items-end animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">Plan Name</label>
            <input type="text" className="w-full px-3 py-2 rounded-lg glass-input" 
              value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Monthly/TK</label>
            <input type="number" className="w-full px-3 py-2 rounded-lg glass-input" 
              value={formData.rateMonthly || ''} 
              onChange={(e) => {
                const monthly = parseFloat(e.target.value) || 0;
                setFormData({...formData, rateMonthly: monthly, yearlyDiscountPercent: calculateDiscount(monthly, formData.rateYearly)});
              }} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Yearly/TK</label>
            <input type="number" className="w-full px-3 py-2 rounded-lg glass-input" 
              value={formData.rateYearly || ''} 
              onChange={(e) => {
                const yearly = parseFloat(e.target.value) || 0;
                setFormData({...formData, rateYearly: yearly, yearlyDiscountPercent: calculateDiscount(formData.rateMonthly, yearly)});
              }} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Max Users</label>
            <input type="number" className="w-full px-3 py-2 rounded-lg glass-input" 
              value={formData.maxUsers || ''} onChange={(e) => setFormData({...formData, maxUsers: parseInt(e.target.value) || 0})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Discount (%)</label>
            <input type="number" readOnly className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-white/5 text-slate-400 cursor-not-allowed outline-none" 
              value={formData.yearlyDiscountPercent} />
          </div>
          <button
            disabled={!formData.name.trim() || formData.maxUsers < 1}
            onClick={() => addMutation.mutate(formData)}
            className="w-full glass-button disabled:bg-slate-700/50 disabled:border-white/5 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none px-4 py-2 rounded-lg font-medium"
          >
            {editingId ? 'Update' : 'Save'}
          </button>
        </div>
      )}

      <div className="glass-panel rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="glass-table-header">
            <tr>
              <th className="px-4 py-2.5 font-medium tracking-wide">Name</th>
              <th className="px-4 py-2.5 font-medium tracking-wide">Monthly Rate</th>
              <th className="px-4 py-2.5 font-medium tracking-wide">Yearly Rate</th>
              <th className="px-4 py-2.5 font-medium tracking-wide">Max Users</th>
              <th className="px-4 py-2.5 font-medium tracking-wide">Discount</th>
              <th className="px-4 py-2.5 font-medium tracking-wide text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-4 text-center text-slate-400">Loading...</td></tr>
            ) : filteredPlans.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-4 text-center text-slate-400">No plans found.</td></tr>
            ) : (
              filteredPlans.map((plan: any) => (
                <tr key={plan.id} className="glass-table-row">
                  <td className="px-4 py-2.5 font-medium text-slate-200">{plan.name}</td>
                  <td className="px-4 py-2.5 text-slate-300">৳ {plan.rateMonthly}</td>
                  <td className="px-4 py-2.5 text-slate-300">৳ {plan.rateYearly}</td>
                  <td className="px-4 py-2.5 text-slate-300">{plan.maxUsers}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-md text-xs font-semibold border border-blue-500/30">
                      {plan.yearlyDiscountPercent}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 flex justify-end space-x-2">
                    <button 
                      onClick={() => handleEdit(plan)}
                      className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => { if(confirm('Delete plan?')) deleteMutation.mutate(plan.id) }}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
