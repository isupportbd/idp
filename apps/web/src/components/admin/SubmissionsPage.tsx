import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { type Client, formatMonth } from './reports/types';

type Submission = {
  id: number;
  clientId: number;
  clientName: string;
  clientBin: string | null;
  month: string;
  submissionId: string;
  createdAt: string | null;
};

export default function SubmissionsPage() {
  // Data Table State
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Selection State
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals & States
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);

  // Form State
  const [clientSearchText, setClientSearchText] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [isLoadingMonths, setIsLoadingMonths] = useState(false);
  const [hasFetchedMonths, setHasFetchedMonths] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch Submissions
  const fetchSubmissions = async () => {
    // Only show the loading spinner if we have no data yet (initial load)
    if (submissions.length === 0) {
      setIsLoading(true);
    }
    try {
      // @ts-ignore
      const res = await apiClient.api.submissions.$get({
        query: {
          search: searchQuery,
          month: filterMonth,
          page: currentPage.toString(),
          limit: itemsPerPage.toString()
        }
      });
      if (res.ok) {
        const result = await res.json() as any;
        setSubmissions(result.data || []);
        setTotalCount(result.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await apiClient.api.submissions.$get({
          query: {
            search: searchQuery,
            month: filterMonth,
            page: currentPage.toString(),
            limit: itemsPerPage.toString()
          }
        });
        if (res.ok) {
          const result = await res.json() as any;
          if (!ignore) {
            setSubmissions(result.data || []);
            setTotalCount(result.total || 0);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [currentPage, searchQuery, filterMonth]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterMonth]);

  // Debounced client search
  useEffect(() => {
    let ignore = false;
    if (!clientSearchText || selectedClient) {
      setClientSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingClients(true);
      try {
        const res = await apiClient.api.clients.$get({ query: { search: clientSearchText, limit: '50' } });
        if (res.ok) {
          const data = await res.json() as any;
          if (!ignore) {
            setClientSearchResults(Array.isArray(data) ? data : data.data || []);
          }
        }
      } catch (e) { 
        console.error(e); 
      } finally { 
        if (!ignore) setIsSearchingClients(false); 
      }
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [clientSearchText, selectedClient]);

  // Fetch Available Months
  useEffect(() => {
    if (!selectedClient) {
      setAvailableMonths([]);
      setSelectedMonth('');
      setHasFetchedMonths(false);
      return;
    }

    const fetchMonths = async () => {
      if (editMode) return; // In edit mode we don't change month
      setIsLoadingMonths(true);
      setHasFetchedMonths(false);
      try {
        const res = await apiClient.api.submissions['available-months'].$get({
          query: { clientId: selectedClient.id.toString() }
        });
        if (res.ok) {
          const result = await res.json() as any;
          setAvailableMonths(result.data || []);
        } else {
          showToast('error', 'Failed to fetch available months');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingMonths(false);
        setHasFetchedMonths(true);
      }
    };
    fetchMonths();
  }, [selectedClient, editMode]);

  const selectClient = (c: Client) => {
    setSelectedClient(c);
    setClientSearchText(c.name);
    setShowClientDropdown(false);
  };

  const clearClient = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setSelectedClient(null);
    setClientSearchText('');
    setSelectedMonth('');
    setSubmissionId('');
    setHasFetchedMonths(false);
  };

  const openAddModal = () => {
    setEditMode(false);
    setCurrentId(null);
    clearClient();
    setShowModal(true);
  };

  const openEditModal = (sub: Submission) => {
    setEditMode(true);
    setCurrentId(sub.id);
    setSelectedClient({ id: sub.clientId, name: sub.clientName, bin: sub.clientBin || undefined });
    setClientSearchText(sub.clientName);
    setSelectedMonth(sub.month);
    setSubmissionId(sub.submissionId);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    clearClient();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !selectedMonth || !submissionId.trim()) return;

    setIsSubmitting(true);
    try {
      if (editMode && currentId) {
        // @ts-ignore
        const res = await apiClient.api.submissions[':id'].$put({
          param: { id: currentId.toString() },
          json: { submissionId: submissionId.trim() }
        });
        
        if (res.ok) {
          showToast('success', 'Submission ID updated successfully!');
          closeModal();
          fetchSubmissions();
        } else {
          const errData = await res.json() as any;
          showToast('error', errData.error || 'Failed to update submission');
        }
      } else {
        const res = await apiClient.api.submissions.$post({
          json: {
            clientId: selectedClient.id,
            month: selectedMonth,
            submissionId: submissionId.trim()
          }
        });

        if (res.ok) {
          showToast('success', 'Submission saved successfully!');
          closeModal();
          fetchSubmissions();
        } else {
          const errData = await res.json() as any;
          showToast('error', errData.error || 'Failed to save submission');
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this submission?')) return;
    try {
      // @ts-ignore
      await apiClient.api.submissions[':id'].$delete({ param: { id: id.toString() } });
      fetchSubmissions();
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      showToast('success', 'Submission deleted');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} submissions?`)) return;
    try {
      // @ts-ignore
      const res = await apiClient.api.submissions['batch-delete'].$post({
        json: { ids: selectedIds }
      });
      if (res.ok) {
        setSelectedIds([]);
        fetchSubmissions();
        showToast('success', 'Submissions deleted');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete submissions');
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(submissions.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  return (
    <>
      <div className="w-full max-w-screen-2xl mx-auto pb-10">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <span className="text-blue-500">📝</span> Submissions
          </h2>
          <p className="text-slate-400 mt-1">Manage eVAT submission IDs for clients.</p>
        </div>

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
              <button 
                onClick={openAddModal}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all flex items-center gap-2 h-10"
              >
                <span className="text-xl leading-none">+</span> Add New
              </button>
            )}
          </div>

          {/* Right: Search and Filter */}
          <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <input
                type="month"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 text-sm h-10 min-w-[150px]"
                lang="en-US" // Enforces YYYY-MM format visually in some browsers
                style={{ colorScheme: 'dark' }}
              />
              {!filterMonth && (
                <span className="absolute left-[2px] top-[2px] bottom-[2px] right-10 bg-slate-800 flex items-center px-3.5 text-slate-400 pointer-events-none text-sm rounded-l-md z-10">
                  All Months
                </span>
              )}
            </div>

            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <input 
                type="text" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                placeholder="Search by Client Name, BIN, ID..." 
                className="w-full sm:w-64 pl-10 pr-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm h-10"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/50 border-b border-slate-700 text-slate-300 text-sm">
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
                      checked={submissions.length > 0 && selectedIds.length === submissions.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4 font-semibold">Client Name</th>
                  <th className="p-4 font-semibold text-center">BIN</th>
                  <th className="p-4 font-semibold text-center">Month</th>
                  <th className="p-4 font-semibold text-center">Submission ID</th>
                  <th className="p-4 font-semibold text-center">Created At</th>
                  <th className="p-4 font-semibold text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        Loading submissions...
                      </div>
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No submissions found. {searchQuery ? 'Try adjusting your search.' : 'Add your first submission.'}
                    </td>
                  </tr>
                ) : (
                  submissions.map(sub => (
                    <tr key={sub.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
                          checked={selectedIds.includes(sub.id)}
                          onChange={() => toggleSelect(sub.id)}
                        />
                      </td>
                      <td className="p-4 font-medium">{sub.clientName}</td>
                      <td className="p-4 text-center font-mono text-sm text-slate-400">{sub.clientBin || '-'}</td>
                      <td className="p-4 text-center">
                        <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md text-sm font-medium">
                          {formatMonth(sub.month)}
                        </span>
                      </td>
                      <td className="p-4 text-center font-mono text-emerald-400 font-medium">
                        {sub.submissionId}
                      </td>
                      <td className="p-4 text-center text-sm text-slate-500">
                        {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => openEditModal(sub)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(sub.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-700 flex items-center justify-between bg-slate-900/50">
              <div className="text-sm text-slate-400">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} entries
              </div>
              <div className="flex gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-3 py-1 bg-slate-800 border border-slate-600 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 text-sm transition-colors"
                >
                  Previous
                </button>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-3 py-1 bg-slate-800 border border-slate-600 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl overflow-visible animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-800/80 rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <span className="text-blue-500">{editMode ? '✏️' : '➕'}</span> 
                {editMode ? 'Edit Submission' : 'Add New Submission'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 bg-slate-900/50 rounded-b-xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Client Search */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-300 mb-2">Client</label>
                <div className="relative">
                  <input
                    type="text"
                    value={clientSearchText}
                    onChange={e => {
                      setClientSearchText(e.target.value);
                      setSelectedClient(null);
                      if (e.target.value) setShowClientDropdown(true);
                      else setShowClientDropdown(false);
                    }}
                    onFocus={() => { if (clientSearchText) setShowClientDropdown(true); }}
                    onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                    placeholder="Search client by name or BIN..."
                    disabled={editMode}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 pr-10"
                  />
                  {clientSearchText && !editMode && (
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs" onMouseDown={clearClient}>✕</button>
                  )}
                  {showClientDropdown && !editMode && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
                      {!clientSearchText ? (
                        <div className="px-4 py-3 text-slate-400 text-sm italic">Type to search for a client...</div>
                      ) : isSearchingClients ? (
                        <div className="px-4 py-3 text-slate-400 text-sm italic">Searching...</div>
                      ) : clientSearchResults.length > 0 ? (
                        clientSearchResults.map(c => (
                          <div key={c.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => selectClient(c)}>
                            <div className="font-medium text-slate-200 text-sm">{c.name}</div>
                            {c.bin && <div className="text-xs text-slate-400">BIN: {c.bin}</div>}
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-slate-400 text-sm italic">No clients found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Month Selector */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-300 mb-2">Month</label>
                
                <div 
                  onMouseDown={(e) => { 
                    // e.preventDefault() prevents the input from losing focus or rogue clicks
                    e.preventDefault();
                    if (!editMode && selectedClient && availableMonths.length > 0) setShowMonthDropdown(!showMonthDropdown); 
                  }}
                  className={`w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none flex justify-between items-center ${(!selectedClient || editMode || availableMonths.length === 0) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-500'}`}
                >
                  <span className={!selectedMonth && !editMode ? 'text-slate-400' : ''}>
                    {editMode 
                      ? formatMonth(selectedMonth) 
                      : selectedMonth 
                        ? formatMonth(selectedMonth) 
                        : '-- Select Month --'
                    }
                  </span>
                  {!editMode && (
                    <svg className={`w-4 h-4 transition-transform text-slate-400 ${showMonthDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  )}
                </div>
                
                {showMonthDropdown && !editMode && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMonthDropdown(false)} />
                    <div className="absolute top-[80px] left-0 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
                      {availableMonths.map(m => (
                        <div 
                          key={m} 
                          className="px-4 py-2.5 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 text-sm text-slate-200 transition-colors"
                          onClick={() => {
                            setSelectedMonth(m);
                            setShowMonthDropdown(false);
                          }}
                        >
                          {formatMonth(m)}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Conditional warning/success message when adding */}
                {!editMode && selectedClient && hasFetchedMonths && availableMonths.length === 0 && !isLoadingMonths && (
                  <p className="mt-2 text-xs text-emerald-400">✅ All purchases for this client already have submissions.</p>
                )}
              </div>

              {/* Submission ID Input */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Submission ID</label>
                <input
                  type="text"
                  value={submissionId}
                  onChange={e => setSubmissionId(e.target.value)}
                  placeholder="Enter 11 digit Submission ID"
                  maxLength={11}
                  disabled={!selectedClient || !selectedMonth}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
                  required
                />
              </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-700 mt-6">
                <button 
                  type="button" 
                  onClick={closeModal} 
                  className="px-5 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors font-medium border border-transparent hover:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedClient || !selectedMonth || !submissionId.trim() || isSubmitting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-[0_0_15px_rgba(37,99,235,0.2)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 min-w-[120px]"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toastMessage && (
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] p-5 rounded-2xl shadow-2xl flex items-center justify-center gap-4 border max-w-lg min-w-[320px] animate-in fade-in zoom-in-95 duration-200 ${toastMessage.type === 'success' ? 'bg-emerald-900/95 border-emerald-500/50 text-emerald-100' : 'bg-red-900/95 border-red-500/50 text-red-100'}`}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertCircle size={24} className="text-red-400" />}
          <span className="text-base font-semibold text-center">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
      )}
    </>
  );
}
