import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '../../api/client';
import { type Client, formatMonth } from './reports/types';

export default function SubmissionsPage() {
  // Client Autocomplete State
  const [clientSearchText, setClientSearchText] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Month & Submission State
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [isLoadingMonths, setIsLoadingMonths] = useState(false);
  const [hasFetchedMonths, setHasFetchedMonths] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  
  // Submit State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Debounced client search
  useEffect(() => {
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
          setClientSearchResults(Array.isArray(data) ? data : data.data || []);
        }
      } catch (e) { console.error(e); }
      finally { setIsSearchingClients(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearchText, selectedClient]);

  // Fetch available months when client is selected
  useEffect(() => {
    if (!selectedClient) {
      setAvailableMonths([]);
      setHasFetchedMonths(false);
      setSelectedMonth('');
      return;
    }

    const fetchMonths = async () => {
      setIsLoadingMonths(true);
      setHasFetchedMonths(false);
      try {
        const baseUrl = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${baseUrl}/api/submissions/available-months?clientId=${selectedClient.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch months');
        
        const data = await response.json();
        setAvailableMonths(data.data || []);
        setHasFetchedMonths(true);
      } catch (err: any) {
        showToast('error', err.message || 'Error fetching available months');
        setAvailableMonths([]);
        setHasFetchedMonths(false);
      } finally {
        setIsLoadingMonths(false);
      }
    };

    fetchMonths();
  }, [selectedClient]);

  const handleClientSelect = (client: Client) => {
    setSelectedClient(client);
    setClientSearchText(client.name);
    setShowClientDropdown(false);
    setSubmissionId('');
  };

  const clearClient = () => {
    setSelectedClient(null);
    setClientSearchText('');
    setAvailableMonths([]);
    setHasFetchedMonths(false);
    setSelectedMonth('');
    setSubmissionId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !selectedMonth || !submissionId.trim()) return;

    setIsSubmitting(true);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          clientId: selectedClient.id,
          month: selectedMonth,
          submissionId: submissionId.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save submission');
      }

      showToast('success', 'Submission ID saved successfully!');
      
      // Remove the month from available months
      setAvailableMonths(prev => prev.filter(m => m !== selectedMonth));
      setSelectedMonth('');
      setSubmissionId('');

    } catch (err: any) {
      showToast('error', err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="max-w-6xl mx-auto p-4 md:p-8 relative z-10">
        <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <span className="text-blue-500">📝</span> Add New Submission
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row items-end gap-4">
            
            {/* Client Search */}
            <div className="relative flex-1">
              <label className="block text-sm font-medium text-slate-300 mb-2">Select Client</label>
              <div className="relative">
                <input
                  type="text"
                  value={clientSearchText}
                  onChange={e => {
                    setClientSearchText(e.target.value);
                    if (selectedClient) clearClient();
                    setShowClientDropdown(!!e.target.value);
                  }}
                  onFocus={() => { if (clientSearchText) setShowClientDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                  placeholder="Type to search client..."
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 pr-10"
                />
                {isSearchingClients && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                )}
                {clientSearchText && !isSearchingClients && (
                  <button type="button" onClick={clearClient} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    ✕
                  </button>
                )}
              </div>

              {showClientDropdown && clientSearchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-2xl max-h-60 overflow-y-auto z-50">
                  {clientSearchResults.map(client => (
                    <div
                      key={client.id}
                      onMouseDown={() => handleClientSelect(client)}
                      className="px-4 py-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0"
                    >
                      <div className="font-semibold text-slate-200">{client.name}</div>
                      {client.bin && <div className="text-xs text-slate-400 mt-1">BIN: {client.bin}</div>}
                    </div>
                  ))}
                </div>
              )}
              
              {showClientDropdown && clientSearchText && clientSearchResults.length === 0 && !isSearchingClients && (
                <div className="absolute top-full mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-4 py-3 text-slate-400 z-50">
                  No clients found
                </div>
              )}
            </div>

            {/* Month Dropdown */}
            <div className="w-full md:w-48 shrink-0">
              <label className="block text-sm font-medium text-slate-300 mb-2">Select Month</label>
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  disabled={!selectedClient || isLoadingMonths || availableMonths.length === 0}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                >
                  <option value="">
                    {!selectedClient 
                      ? "Client first" 
                      : isLoadingMonths 
                        ? "Loading..." 
                        : availableMonths.length === 0 
                          ? "No months" 
                          : "Select Month"}
                  </option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{formatMonth(m)}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  {isLoadingMonths ? (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  )}
                </div>
              </div>
            </div>

            {/* Submission ID */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-300 mb-2">Submission ID</label>
              <input
                type="text"
                value={submissionId}
                onChange={e => setSubmissionId(e.target.value)}
                disabled={!selectedClient || !selectedMonth}
                maxLength={11}
                placeholder="Enter Submission ID"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                required
              />
            </div>

            {/* Actions */}
            <div className="shrink-0">
              <button
                type="submit"
                disabled={!selectedClient || !selectedMonth || !submissionId.trim() || isSubmitting}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold shadow-[0_0_15px_rgba(37,99,235,0.2)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 w-full h-[50px]"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </form>

          {/* Conditional success message */}
          {selectedClient && hasFetchedMonths && availableMonths.length === 0 && !isLoadingMonths && (
            <p className="mt-4 text-sm text-emerald-400">✅ All purchases for this client already have submissions.</p>
          )}
        </div>
      </div>

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
