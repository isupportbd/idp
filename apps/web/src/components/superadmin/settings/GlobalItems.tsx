import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { Plus, Edit2, Trash2, X, AlertCircle, Search } from 'lucide-react';

interface Item {
  id: number;
  name: string;
  hsCode: string | null;
  awHsCode: string | null;
}

export default function GlobalItems() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState({ name: '', hsCode: '', awHsCode: '' });
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 1500);
  };

  const { data: queryData, isLoading } = useQuery({
    queryKey: ['global-items', currentPage, searchTerm],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin.items.$get({
        query: {
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
          search: searchTerm
        }
      });
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (newItem: Omit<Item, 'id'>) => {
      const res = await (apiClient as any).api.superadmin.items.$post({ json: newItem });
      if (!res.ok) throw new Error('Failed to create');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-items'] });
      closeModal();
      showMessage('Item created successfully!', 'success');
    },
    onError: () => showMessage('Failed to create item.', 'error')
  });

  const updateMutation = useMutation({
    mutationFn: async (item: Item) => {
      const res = await (apiClient as any).api.superadmin.items[':id'].$put({
        param: { id: item.id.toString() },
        json: { name: item.name, hsCode: item.hsCode, awHsCode: item.awHsCode }
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-items'] });
      closeModal();
      showMessage('Item updated successfully!', 'success');
    },
    onError: () => showMessage('Failed to update item.', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await (apiClient as any).api.superadmin.items[':id'].$delete({ param: { id: id.toString() } });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-items'] });
      showMessage('Item deleted successfully!', 'success');
    },
    onError: () => showMessage('Failed to delete item.', 'error')
  });

  const items: Item[] = queryData?.data || [];
  const totalCount = queryData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  const openModal = (item?: Item) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        hsCode: item.hsCode || '',
        awHsCode: item.awHsCode || ''
      });
    } else {
      setEditingItem(null);
      setFormData({ name: '', hsCode: '', awHsCode: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ ...formData, id: editingItem.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <>
      <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-medium text-slate-100">Global Items</h3>
          <p className="text-sm text-slate-400 mt-1">Manage system-wide items and HS codes.</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={searchTerm} 
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} 
              placeholder="Search items by name, hs code..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
            />
          </div>
          <div className="flex items-center px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 font-medium text-sm shadow-sm">
            Total Items
            <span className="ml-2 bg-emerald-500 text-white px-2 py-0.5 rounded text-xs font-bold shadow-sm">
              {totalCount}
            </span>
          </div>
          <button
            onClick={() => openModal()}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>
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
              <th className="px-6 py-3 font-medium">#</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">HS Code</th>
              <th className="px-4 py-2.5 font-medium">AW HS Code</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {isLoading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No items found.</td></tr>
            ) : (
              items.map((item, index) => (
                <tr key={item.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-center text-slate-500 font-medium">
                    {(currentPage - 1) * itemsPerPage + index + 1}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-200">{item.name}</td>
                  <td className="px-4 py-2.5 text-slate-400">{item.hsCode || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{item.awHsCode || '-'}</td>
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
        {totalPages > 1 && (
          <div className="flex justify-between items-center px-6 py-4 bg-slate-900 border-t border-slate-700">
            <button 
              className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 transition-all"
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(c => c - 1)}
            >
              Previous
            </button>
            <span className="text-sm font-medium text-slate-400">Page {currentPage} of {totalPages}</span>
            <button 
              className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 transition-all"
              disabled={currentPage === totalPages} 
              onClick={() => setCurrentPage(c => c + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl border border-slate-700 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h3 className="text-xl font-semibold text-slate-100">
                {editingItem ? 'Edit Item' : 'Add Item'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">HS Code</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.hsCode}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({
                        ...formData, 
                        hsCode: val,
                        awHsCode: val.replace(/[\.\s]/g, '')
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">AW HS Code</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.awHsCode}
                    onChange={e => setFormData({...formData, awHsCode: e.target.value})}
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
