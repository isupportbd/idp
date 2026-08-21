import React, { useState, useEffect, useRef } from 'react';
import { Copy, Trash2, Edit2, Upload, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../api/client';

interface Credential {
  id: number;
  clientId: number;
  clientName?: string;
  clientBin?: string;
  loginId: string;
  loginPassword?: string;
  createdAt: string;
}

export default function ClientCredentialsManager() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    clientId: '',
    loginId: '',
    loginPassword: ''
  });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{type: 'error'|'success', text: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCredentials = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.api['client-credentials'].$get({
        query: {
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
          search: searchQuery
        }
      });
      if (res.ok) {
        const data = await res.json() as { success: boolean; data: any[]; total: number };
        if (data.success) {
          setCredentials(data.data || []);
          setTotalCount(data.total || 0);
        }
      }
    } catch (error) {
      console.error('Failed to fetch credentials', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await apiClient.api.clients.$get();
      if (res.ok) {
        const data = await res.json() as any;
        setClients(data.data || data || []);
      }
    } catch (error) {
      console.error('Failed to fetch clients', error);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCredentials();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const paginatedCredentials = credentials;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      // could show a toast here
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const openAddModal = () => {
    setEditMode(false);
    setCurrentId(null);
    setFormData({ clientId: '', loginId: '', loginPassword: '' });
    setShowModal(true);
  };

  const openEditModal = (cred: Credential) => {
    setEditMode(true);
    setCurrentId(cred.id);
    setFormData({ 
      clientId: cred.clientId.toString(), 
      loginId: cred.loginId, 
      loginPassword: cred.loginPassword || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.loginId || !formData.loginPassword) {
      alert('Please fill out all fields');
      return;
    }

    try {
      const payload = {
        clientId: parseInt(formData.clientId),
        loginId: formData.loginId,
        loginPassword: formData.loginPassword
      };

      if (editMode && currentId) {
        // If password is blank, we don't send it, but schema requires it.
        // Actually, schema requires loginPassword. Let's see how legacy did it.
        // If blank, keep old. Our new backend expects it. If blank, backend will fail zValidator.
        // Let's pass old password if blank? We don't have old password in plaintext if it's hashed, but it's not hashed here!
        const existing = credentials.find(c => c.id === currentId);
        if (!payload.loginPassword) {
           payload.loginPassword = existing?.loginPassword || '';
        }

        const res = await apiClient.api['client-credentials'][':id'].$put({
          param: { id: currentId.toString() },
          json: payload
        });
        if (res.ok) {
          setShowModal(false);
          fetchCredentials();
        }
      } else {
        if (!payload.loginPassword) return alert("Password is required for new credential");
        const res = await apiClient.api['client-credentials'].$post({
          json: payload
        });
        if (res.ok) {
          setShowModal(false);
          fetchCredentials();
        }
      }
    } catch (err) {
      console.error(err);
      alert('Operation failed');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this credential?')) return;
    try {
      await apiClient.api['client-credentials'][':id'].$delete({ param: { id: id.toString() } });
      fetchCredentials();
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} credentials?`)) return;
    try {
      const res = await apiClient.api['client-credentials']['batch-delete'].$post({
        json: { ids: selectedIds }
      });
      if (res.ok) {
        setSelectedIds([]);
        fetchCredentials();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedCredentials.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setUploadMessage(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/client-credentials/upload`, {
        method: 'POST',
        body: formData,
        headers: {
           Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      
      if (data.success) {
        setUploadMessage({ type: 'success', text: data.message });
        setTimeout(() => setUploadMessage(null), 1000);
        setFile(null);
        fetchCredentials();
      } else {
        setUploadMessage({ type: 'error', text: data.error || 'Upload failed' });
        setTimeout(() => setUploadMessage(null), 1000);
      }
    } catch (err) {
      console.error(err);
      setUploadMessage({ type: 'error', text: 'Network error during upload' });
      setTimeout(() => setUploadMessage(null), 1000);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:px-8 md:pt-2 md:pb-8 font-sans text-slate-200">
      
      <div className="flex justify-between items-start mb-5 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <KeyRound size={32} className="text-blue-500" />
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                Credentials
              </span>
              <span className="text-2xl text-slate-500 font-semibold">({totalCount})</span>
            </h1>
          </div>
          <p className="text-slate-400 mt-2">Manage third-party portal login credentials for your clients.</p>
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
        
        {/* Left: Actions */}
        <div className="flex items-center gap-4 flex-wrap w-full lg:w-auto">
          {selectedIds.length > 0 ? (
            <div className="flex items-center gap-4 w-full sm:w-auto p-2 bg-slate-800 border border-slate-700 rounded-lg">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-md font-bold text-sm">
                {selectedIds.length} selected
              </span>
              <button 
                onClick={handleBatchDelete}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors text-sm font-medium border border-red-500/20"
              >
                <Trash2 size={16} /> Delete Selected
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={openAddModal}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all flex items-center gap-2 h-10"
              >
                <span className="text-xl leading-none">+</span> Add
              </button>
              
              <span className="text-slate-500 font-medium hidden sm:inline">or</span>

              <div className="flex items-center shadow-sm rounded-lg w-full sm:w-auto overflow-x-auto">
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx,.xls,.csv" className="hidden" />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-l-lg border border-slate-600 text-sm font-medium transition-colors h-10 whitespace-nowrap"
                >
                  Choose File
                </button>
                <div className="bg-slate-900 border-y border-slate-600 text-slate-400 px-4 py-2 text-sm h-10 flex items-center min-w-[200px] sm:min-w-[380px] truncate">
                  {file ? (
                    <span className="truncate text-slate-300 font-medium">{file.name}</span>
                  ) : (
                    <span className="text-slate-400 text-sm truncate">Only Excel with header BIN, Username, Password</span>
                  )}</div>
                <button 
                  disabled={!file || uploading}
                  onClick={handleUpload}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-4 py-2 rounded-r-lg border border-slate-600 disabled:border-slate-600 transition-colors h-10 flex items-center justify-center border-l-0"
                  title="Upload File"
                >
                  <Upload size={18} className={uploading ? "animate-bounce" : ""} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: Search */}
        <div className="w-full lg:w-auto relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input 
            type="text" 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            placeholder="Search by Client Name, BIN..." 
            className="w-full lg:w-72 pl-10 pr-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm h-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700 uppercase tracking-wider text-xs">
              <tr>
                <th className="p-4 w-12">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
                    checked={selectedIds.length === paginatedCredentials.length && paginatedCredentials.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-4 w-16 text-center font-semibold">SL</th>
                <th className="p-4 font-semibold">Client</th>
                <th className="p-4 font-semibold">Login ID</th>
                <th className="p-4 font-semibold">Password</th>
                <th className="p-4 font-semibold">Last Updated</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">Loading credentials...</td>
                </tr>
              ) : paginatedCredentials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <div className="text-4xl mb-3">📭</div>
                    No credentials found.
                  </td>
                </tr>
              ) : (
                paginatedCredentials.map((cred, index) => (
                  <tr key={cred.id} className="hover:bg-slate-700/30 transition-colors group">
                    <td className="p-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
                        checked={selectedIds.includes(cred.id)}
                        onChange={() => toggleSelect(cred.id)}
                      />
                    </td>
                    <td className="p-4 text-center font-medium text-slate-500">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-200">{cred.clientName}</div>
                      <div className="text-sm text-slate-400 mt-0.5">BIN: {cred.clientBin || 'N/A'}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg w-fit border border-slate-700/50">
                        <code className="text-blue-400 font-bold tracking-wide">{cred.loginId}</code>
                        <button onClick={() => handleCopy(cred.loginId)} className="text-slate-500 hover:text-white transition-colors" title="Copy ID">
                          <Copy size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg w-fit border border-slate-700/50">
                        <span className="text-slate-500 tracking-widest text-lg leading-none mt-1">••••••••</span>
                        <button onClick={() => handleCopy(cred.loginPassword || '')} className="text-slate-500 hover:text-white transition-colors" title="Copy Password">
                          <Copy size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="p-4 text-slate-300 font-medium text-sm">
                      {new Date(cred.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openEditModal(cred)}
                          className="p-2 bg-slate-700 text-slate-300 hover:bg-blue-500 hover:text-white rounded-md transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(cred.id)}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-slate-100">{editMode ? 'Edit Credential' : 'Add New Credential'}</h3>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Client</label>
                  {editMode ? (
                    <input 
                      type="text" 
                      value={clients.find(c => c.id.toString() === formData.clientId)?.name || ''} 
                      disabled
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-400 cursor-not-allowed"
                    />
                  ) : (
                    <select 
                      value={formData.clientId} 
                      onChange={e => setFormData({...formData, clientId: e.target.value})}
                      required
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="" disabled>Select a client...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Login ID (Username)</label>
                  <input 
                    type="text" 
                    value={formData.loginId} 
                    onChange={e => setFormData({...formData, loginId: e.target.value})}
                    required
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">
                    Password {editMode && <span className="text-xs text-slate-500 font-normal">(Leave blank to keep existing)</span>}
                  </label>
                  <input 
                    type="text" 
                    value={formData.loginPassword} 
                    onChange={e => setFormData({...formData, loginPassword: e.target.value})}
                    required={!editMode}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition-all"
                >
                  Save Credential
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
