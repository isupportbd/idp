import { useState, useEffect } from 'react';
import { Users, Edit2, Trash2, Plus, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

interface User {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastActive: string | null;
}

export default function UsersManager() {
  const { } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Toast message state
  const [uploadMessage, setUploadMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    id: 0,
    name: '',
    email: '',
    mobile: '',
    password: ''
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, searchQuery]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/users?page=${currentPage}&limit=${itemsPerPage}&search=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data || []);
        setTotalCount(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setUploadMessage({ type, text });
    setTimeout(() => setUploadMessage(null), 3000);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const paginatedUsers = users;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const openAddModal = () => {
    setEditMode(false);
    setFormData({ id: 0, name: '', email: '', mobile: '', password: '' });
    setShowModal(true);
  };

  const openEditModal = (user: User) => {
    setEditMode(true);
    setFormData({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile || '',
      password: '' // Don't populate password
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const method = editMode ? 'PUT' : 'POST';
      const url = editMode ? `/api/users/${formData.id}` : '/api/users';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          mobile: formData.mobile,
          password: formData.password
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        showToast('success', data.message);
        setShowModal(false);
        fetchUsers();
      } else {
        showToast('error', data.message || 'Failed to save user');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'User deleted successfully');
        fetchUsers();
      } else {
        showToast('error', data.message || 'Failed to delete');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Network error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:px-8 md:pt-2 md:pb-8 font-sans text-slate-200">
      
      <div className="flex justify-between items-start mb-5 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Users size={32} className="text-blue-500" />
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                User Management
              </span>
            </h1>
          </div>
          <p className="text-slate-400 mt-2">Manage users within your organization.</p>
        </div>
        <div className="flex items-center px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 font-medium text-sm shadow-sm">
          Total Users
          <span className="ml-2 bg-emerald-500 text-white px-2 py-0.5 rounded text-xs font-bold shadow-sm">
            {totalCount}
          </span>
        </div>
      </div>

      {uploadMessage && (
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] p-5 rounded-2xl shadow-2xl flex items-center justify-center gap-4 border max-w-lg min-w-[320px] animate-in fade-in zoom-in-95 duration-200 ${uploadMessage.type === 'success' ? 'bg-emerald-900/95 border-emerald-500/50 text-emerald-100' : 'bg-red-900/95 border-red-500/50 text-red-100'}`}>
          {uploadMessage.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertCircle size={24} className="text-red-400" />}
          <span className="text-base font-semibold text-center">{uploadMessage.text}</span>
          <button onClick={() => setUploadMessage(null)} className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row justify-between items-center mb-4 gap-4">
        
        <div className="flex items-center gap-4 flex-wrap w-full lg:w-auto">
          <button 
            onClick={openAddModal}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all flex items-center gap-2 h-10"
          >
            <Plus size={20} /> Add User
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-80">
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, email..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Table Area */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700 shadow-xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-700 text-xs tracking-wider uppercase">
              <tr>
                <th className="p-4 font-semibold text-center w-16">SL</th>
                <th className="p-4 font-semibold">User Details</th>
                <th className="p-4 font-semibold">Contact Info</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Created Date</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <div>Loading users...</div>
                    </div>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Users size={48} className="text-slate-600" />
                      <div className="text-lg font-medium text-slate-300">No users found</div>
                      <div className="text-sm">Click "Add User" to create a new user account.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u, index) => (
                  <tr key={u.id} className="hover:bg-slate-700/30 transition-colors group">
                    <td className="p-4 text-center font-medium text-slate-500">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-200 text-base">{u.name}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-slate-300">{u.email}</div>
                      {u.mobile && <div className="text-slate-500 text-sm mt-0.5">{u.mobile}</div>}
                    </td>
                    <td className="p-4">
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-semibold tracking-wide uppercase border border-emerald-500/20">
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300 font-medium text-sm">
                      {new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openEditModal(u)}
                          className="p-2 bg-slate-700 text-slate-300 hover:bg-blue-500 hover:text-white rounded-md transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(u.id)}
                          className="p-2 bg-slate-700 text-slate-300 hover:bg-red-500 hover:text-white rounded-md transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-700 bg-slate-800/80 flex items-center justify-between text-sm text-slate-400">
            <div>
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} entries
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <div className="flex items-center gap-1 px-2">
                {Array.from({length: totalPages}, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                      currentPage === page 
                        ? 'bg-blue-600 text-white font-bold' 
                        : 'hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                {editMode ? <Edit2 size={20} className="text-blue-400" /> : <Plus size={20} className="text-blue-400" />}
                {editMode ? 'Edit User' : 'Add New User'}
              </h2>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Full Name</label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    required
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter full name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Email Address</label>
                  <input 
                    type="email" 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    required
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter email address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Mobile Number (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.mobile} 
                    onChange={e => setFormData({...formData, mobile: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter mobile number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">
                    Password {editMode && <span className="text-xs text-slate-500 font-normal">(Leave blank to keep existing)</span>}
                  </label>
                  <input 
                    type="password" 
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    required={!editMode}
                    minLength={6}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={editMode ? "Enter new password" : "Enter password"}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-8">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70 flex items-center gap-2"
                >
                  {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                  {editMode ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
