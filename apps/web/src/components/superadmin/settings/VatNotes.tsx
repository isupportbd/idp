import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { Plus, Edit2, Trash2, X, AlertCircle } from 'lucide-react';

interface VatNote {
  id: number;
  vatRate: number;
  noteName: string;
}

export default function VatNotes() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VatNote | null>(null);
  const [formData, setFormData] = useState<{ vatRate: number | string, noteName: string }>({ vatRate: '', noteName: '' });
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 1500);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['vat-notes'],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin['vat-notes'].$get();
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (newItem: Omit<VatNote, 'id'>) => {
      const res = await (apiClient as any).api.superadmin['vat-notes'].$post({ json: newItem });
      if (!res.ok) throw new Error('Failed to create');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-notes'] });
      closeModal();
      showMessage('VAT Note created successfully!', 'success');
    },
    onError: () => showMessage('Failed to create VAT Note.', 'error')
  });

  const updateMutation = useMutation({
    mutationFn: async (item: VatNote) => {
      const res = await (apiClient as any).api.superadmin['vat-notes'][':id'].$put({
        param: { id: item.id.toString() },
        json: { vatRate: item.vatRate, noteName: item.noteName }
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-notes'] });
      closeModal();
      showMessage('VAT Note updated successfully!', 'success');
    },
    onError: () => showMessage('Failed to update VAT Note.', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await (apiClient as any).api.superadmin['vat-notes'][':id'].$delete({ param: { id: id.toString() } });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-notes'] });
      showMessage('VAT Note deleted successfully!', 'success');
    },
    onError: () => showMessage('Failed to delete VAT Note.', 'error')
  });

  const items: VatNote[] = data?.data || [];

  const openModal = (item?: VatNote) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        vatRate: item.vatRate,
        noteName: item.noteName
      });
    } else {
      setEditingItem(null);
      setFormData({ vatRate: '', noteName: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedVatRate = parseFloat(formData.vatRate.toString());
    const finalVatRate = isNaN(parsedVatRate) ? 0 : parsedVatRate;
    
    if (editingItem) {
      updateMutation.mutate({ noteName: formData.noteName, vatRate: finalVatRate, id: editingItem.id });
    } else {
      createMutation.mutate({ noteName: formData.noteName, vatRate: finalVatRate });
    }
  };

  return (
    <>
      <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-medium text-slate-100">VAT Notes (Sales)</h3>
          <p className="text-sm text-slate-400 mt-1">Map VAT rates to Note Names.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add VAT Note</span>
        </button>
      </div>

      {message && createPortal(
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-3 animate-in zoom-in-95 fade-in duration-200 ${message.type === 'success' ? 'bg-green-600/90 backdrop-blur-md text-white border border-green-500/50' : 'bg-red-600/90 backdrop-blur-md text-white border border-red-500/50'}`}>
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">{message.text}</span>
        </div>,
        document.body
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 border-b border-slate-700 text-slate-300">
            <tr>
              <th className="px-4 py-2.5 font-medium">VAT Rate (%)</th>
              <th className="px-4 py-2.5 font-medium">Note Name</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading ? (
              <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">No VAT Notes found.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-200">{item.vatRate}%</td>
                  <td className="px-4 py-2.5 text-slate-400">{item.noteName}</td>
                  <td className="px-4 py-2.5 flex justify-end space-x-2">
                    <button
                      onClick={() => openModal(item)}
                      className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { if(confirm('Are you sure?')) deleteMutation.mutate(item.id) }}
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

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl border border-slate-700 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h3 className="text-xl font-semibold text-slate-100">
                {editingItem ? 'Edit VAT Note' : 'Add VAT Note'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">VAT Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={formData.vatRate}
                    onChange={e => setFormData({...formData, vatRate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Note Name</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.noteName}
                    onChange={e => setFormData({...formData, noteName: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-8">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {editingItem ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
