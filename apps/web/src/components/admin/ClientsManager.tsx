import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/auth';

interface Client {
  id: number;
  name: string;
  bin: string;
  adminName?: string;
}

export default function ClientsManager() {
  const { user } = useAuthStore();
  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const getLastMonth = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  };
  const [selectedMonth, setSelectedMonth] = useState(getLastMonth());

  // Admin Transfer logic (for superadmin)
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<number | null>(null);
  const [activeClientId, setActiveClientId] = useState<number | null>(null);
  const [activeClientName, setActiveClientName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients();
      if (user?.role === 'superadmin') {
        fetchAdmins();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [user, selectedMonth, currentPage, searchQuery]);

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.api.clients.$get({
        query: { 
          month: selectedMonth,
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
          search: searchQuery
        }
      });
      if (res.ok) {
        const data = await res.json() as { data: any[], total: number };
        setClients(data.data || []);
        setTotalCount(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      const res = await apiClient.api.superadmin.tenants.$get();
      if (res.ok) {
        const data = await res.json() as any;
        setAdminsList(data.data);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const paginatedClients = clients;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedMonth]);

  const openAdminModal = (client: Client) => {
    setActiveClientId(client.id);
    setActiveClientName(client.name);
    setSelectedAdminId(null);
    setShowAdminModal(true);
  };

  const closeAdminModal = () => {
    setShowAdminModal(false);
    setActiveClientId(null);
    setActiveClientName('');
    setSelectedAdminId(null);
  };

  const submitChangeAdmin = async () => {
    if (!activeClientId || !selectedAdminId) return;
    
    if (!window.confirm(`Are you sure you want to transfer this client? All their data (purchases, rates) will be moved to the new admin.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.api.clients[':id'].admin.$put({
        param: { id: activeClientId.toString() },
        json: { newAdminId: selectedAdminId }
      });
      
      const data = await res.json() as any;
      if (data.success) {
        alert(data.message);
        closeAdminModal();
        await fetchClients();
      } else {
        alert(data.message || 'Failed to transfer client admin.');
      }
    } catch (error: any) {
      console.error('Error transferring admin:', error);
      alert(error.message || 'Failed to transfer client admin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (window.confirm(`WARNING: Are you sure you want to delete ${client.name}? THIS WILL DELETE ALL PURCHASES AND SALES RATES ASSOCIATED WITH THIS CLIENT. This action cannot be undone.`)) {
      try {
        setIsLoading(true);
        const res = await apiClient.api.clients[':id'].$delete({
          param: { id: client.id.toString() }
        });
        const data = await res.json() as any;
        if (data.success) {
          alert(data.message);
          await fetchClients();
        } else {
          alert(data.message || 'Failed to delete client.');
        }
      } catch (error: any) {
        console.error('Error deleting client:', error);
        alert(error.message || 'Failed to delete client.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-10">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-slate-100 mb-2">Client Management</h2>
          <p className="text-red-500 font-medium text-base">Manage your clients. Warning: Deleting a client will delete all their purchases and sales rates.</p>
        </div>
        <div className="flex items-center px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 font-medium text-sm shadow-sm">
          Total Clients
          <span className="ml-2 bg-emerald-500 text-white px-2 py-0.5 rounded text-xs font-bold shadow-sm">
            {totalCount}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
            <input 
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-200 px-4 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              style={{ colorScheme: 'dark' }}
            />
        </div>

        <div className="w-full max-w-sm relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input 
            type="text" 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            placeholder="Search clients by name or BIN..." 
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
          />
        </div>
      </div>

      {isLoading && clients.length === 0 ? (
        <div className="text-center py-16 text-slate-400">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="text-4xl mb-4">👥</div>
          <h3 className="text-xl font-semibold text-slate-200 mb-2">No Clients Found</h3>
          <p>You haven't uploaded any data for clients yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-700">
                    <th className="px-6 py-4 text-center font-semibold text-slate-400 uppercase text-xs tracking-wider w-16">SL</th>
                    <th className="px-6 py-4 font-semibold text-slate-400 uppercase text-xs tracking-wider">Client Name</th>
                    <th className="px-6 py-4 font-semibold text-slate-400 uppercase text-xs tracking-wider">BIN</th>
                    {user?.role === 'superadmin' && <th className="px-6 py-4 font-semibold text-slate-400 uppercase text-xs tracking-wider">Admin (Owner)</th>}
                    {user?.role !== 'user' && <th className="px-6 py-4 text-right font-semibold text-slate-400 uppercase text-xs tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {paginatedClients.map((client, index) => (
                    <tr key={client.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 text-center text-slate-500 font-medium">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-200">{client.name}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-300">{client.bin || 'N/A'}</td>
                      {user?.role === 'superadmin' && (
                        <td className="px-6 py-4">
                          <span className="bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs font-medium border border-slate-600">
                            {client.adminName || 'Unknown'}
                          </span>
                        </td>
                      )}
                      {user?.role !== 'user' && (
                        <td className="px-6 py-4 text-right">
                          {user?.role === 'superadmin' && (
                            <button 
                              className="mr-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-semibold text-sm hover:bg-blue-500 hover:text-white transition-colors" 
                              onClick={() => openAdminModal(client)}
                            >
                              Change Admin
                            </button>
                          )}
                          <button 
                            className="p-2 bg-white/10 text-red-400 border border-white/20 rounded-md hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 backdrop-blur-sm transition-all shadow-sm"
                            onClick={() => handleDeleteClient(client)}
                            title="Delete Client"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="flex justify-between items-center px-6 py-4 bg-slate-900 border-t border-slate-700">
                <button 
                  className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 disabled:hover:bg-slate-800 disabled:hover:border-slate-600 transition-all"
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(c => c - 1)}
                >
                  Previous
                </button>
                <span className="text-sm font-medium text-slate-400">Page {currentPage} of {totalPages}</span>
                <button 
                  className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 disabled:hover:bg-slate-800 disabled:hover:border-slate-600 transition-all"
                  disabled={currentPage === totalPages} 
                  onClick={() => setCurrentPage(c => c + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Change Admin Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-slate-100 mb-2">Change Client Admin</h3>
            <p className="text-sm text-slate-400 mb-6">Transfer <span className="font-semibold text-white">{activeClientName}</span> and all their data to a new admin.</p>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">Select New Admin</label>
              <select 
                value={selectedAdminId || ''} 
                onChange={e => setSelectedAdminId(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-600 text-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="" disabled>-- Choose Admin --</option>
                {adminsList.map(admin => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name} ({admin.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" className="px-4 py-2 border border-slate-600 text-slate-400 hover:text-white rounded-lg font-semibold transition-colors" onClick={closeAdminModal}>Cancel</button>
              <button 
                type="button" 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed" 
                onClick={submitChangeAdmin} 
                disabled={!selectedAdminId || isSubmitting}
              >
                {isSubmitting ? 'Transferring...' : 'Transfer Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
