import { useState, useEffect, useRef, useMemo } from 'react';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/auth';

export default function TenantPurchases() {
  const { user } = useAuthStore();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  
  const [clientSearchText, setClientSearchText] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const [itemSearchText, setItemSearchText] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  const [lcNumberSearch, setLcNumberSearch] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    loadBaseData();
  }, []);

  const loadBaseData = async () => {
    try {
      const [clientsRes, itemsRes, monthsRes] = await Promise.all([
        apiClient.api.clients.$get({ query: { limit: '10000' } }),
        apiClient.api.items.$get(),
        apiClient.api.purchases.months.$get()
      ]);
      
      if (clientsRes.ok) {
        const cData = await clientsRes.json() as any;
        setClients(cData || []);
      }
      if (itemsRes.ok) {
        const iData = await itemsRes.json() as any;
        if (iData.success) setItems(iData.data);
      }
      if (monthsRes.ok) {
        const mData = await monthsRes.json() as any;
        if (mData.success) {
          setAvailableMonths(mData.data);
          if (mData.data.length > 0) {
            setSelectedMonth(mData.data[0]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load base data', error);
    }
  };

  useEffect(() => {
    if (selectedMonth) {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        fetchPurchases();
      }, 500);
    } else {
      setPurchases([]);
    }
  }, [selectedMonth, currentPage, selectedClientId, selectedItemId, lcNumberSearch]);

  const fetchPurchases = async () => {
    if (!selectedMonth) return;
    setIsLoading(true);
    try {
      const response = await apiClient.api.purchases.$get({
        query: {
          page: currentPage.toString(),
          limit: pageSize.toString(),
          month: selectedMonth,
          ...(selectedClientId && { clientId: selectedClientId.toString() }),
          ...(selectedItemId && { itemId: selectedItemId.toString() }),
          ...(lcNumberSearch && { lcNumber: lcNumberSearch })
        }
      });
      if (response.ok) {
        const data = await response.json() as any;
        if (data.success) {
          setPurchases(data.data);
          setTotalPages(data.pagination.totalPages);
          setCurrentPage(data.pagination.page);
        }
      }
    } catch (error) {
      console.error('Error fetching purchases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearOldPurchases = async () => {
    if (!selectedMonth) {
      alert("Please select a month first.");
      return;
    }
    
    if (window.confirm(`Are you sure you want to completely delete all purchases for ${formatMonth(selectedMonth)}? This action cannot be undone.`)) {
      try {
        setIsLoading(true);
        const res = await apiClient.api.purchases.months[':month'].$delete({
          param: { month: selectedMonth }
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.success) {
            alert(data.message);
            setSelectedMonth('');
            await loadBaseData();
          }
        } else {
          const errData = await res.json() as any;
          alert(errData.message || 'Failed to delete purchases.');
        }
      } catch (error: any) {
        console.error('Error deleting purchases:', error);
        alert(error.message || 'Failed to delete purchases.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const filteredClients = useMemo(() => {
    if (!clientSearchText) return clients;
    const lowerSearch = clientSearchText.toLowerCase();
    return clients.filter(c => 
      c.name.toLowerCase().includes(lowerSearch) || 
      (c.bin && c.bin.toLowerCase().includes(lowerSearch))
    );
  }, [clients, clientSearchText]);

  const filteredItems = useMemo(() => {
    if (!itemSearchText) return items;
    const lowerSearch = itemSearchText.toLowerCase();
    return items.filter(i => 
      i.name.toLowerCase().includes(lowerSearch) || 
      (i.hsCode && i.hsCode.toLowerCase().includes(lowerSearch))
    );
  }, [items, itemSearchText]);

  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', '-');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatNumber = (val: any) => {
    if (val === undefined || val === null || val === '') return '';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toFixed(2);
  };

  return (
    <div className="max-w-7xl mx-auto w-full pb-10">
      <div className="mb-6 flex flex-wrap gap-4 items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm relative z-20">
        
        {/* Client Filter */}
        <div className="relative flex-1 min-w-[200px]">
          <input 
            type="text" 
            value={clientSearchText} 
            onChange={e => {
              setClientSearchText(e.target.value);
              setSelectedClientId('');
              setCurrentPage(1);
            }} 
            onFocus={() => setShowClientDropdown(true)}
            onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            placeholder="Filter by Client..."
          />
          {clientSearchText && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" onClick={() => {
              setClientSearchText(''); setSelectedClientId(''); setCurrentPage(1);
            }}>✕</button>
          )}
          {showClientDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
              {filteredClients.length > 0 ? filteredClients.map(client => (
                <div key={client.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => {
                  setSelectedClientId(client.id);
                  setClientSearchText(client.name);
                  setShowClientDropdown(false);
                  setCurrentPage(1);
                }}>
                  <div className="font-medium text-slate-200">{client.name}</div>
                  <div className="text-xs text-slate-400">BIN: {client.bin || 'N/A'}</div>
                </div>
              )) : <div className="px-4 py-3 text-slate-400 italic text-sm">No clients found</div>}
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-slate-600 hidden sm:block"></div>

        {/* Item Filter */}
        <div className="relative flex-1 min-w-[200px]">
          <input 
            type="text" 
            value={itemSearchText} 
            onChange={e => {
              setItemSearchText(e.target.value);
              setSelectedItemId('');
              setCurrentPage(1);
            }} 
            onFocus={() => setShowItemDropdown(true)}
            onBlur={() => setTimeout(() => setShowItemDropdown(false), 200)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            placeholder="Filter by Item..."
          />
          {itemSearchText && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" onClick={() => {
              setItemSearchText(''); setSelectedItemId(''); setCurrentPage(1);
            }}>✕</button>
          )}
          {showItemDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
              {filteredItems.length > 0 ? filteredItems.map(item => (
                <div key={item.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => {
                  setSelectedItemId(item.id);
                  setItemSearchText(item.name);
                  setShowItemDropdown(false);
                  setCurrentPage(1);
                }}>
                  <div className="font-medium text-slate-200">{item.name}</div>
                  <div className="text-xs text-slate-400">HS: {item.hsCode || 'N/A'}</div>
                </div>
              )) : <div className="px-4 py-3 text-slate-400 italic text-sm">No items found</div>}
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-slate-600 hidden sm:block"></div>

        <input 
          type="text" 
          value={lcNumberSearch} 
          onChange={e => { setLcNumberSearch(e.target.value); setCurrentPage(1); }} 
          placeholder="LC No..." 
          className="flex-1 min-w-[150px] px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
        />

        <div className="w-px h-8 bg-slate-600 hidden lg:block"></div>

        <select 
          value={selectedMonth} 
          onChange={e => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
          className="bg-slate-900 border border-slate-600 text-slate-200 px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
        >
          <option value="">Select Month</option>
          {availableMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>

        {selectedMonth && user?.role !== 'user' && (
          <button 
            onClick={handleClearOldPurchases}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg font-semibold hover:bg-red-500 hover:text-white transition-colors ml-auto"
            title="Delete all data for selected month"
          >
            <span>🗑️</span> <span className="hidden xl:inline">Clear {formatMonth(selectedMonth)}</span>
          </button>
        )}
      </div>

      {!selectedMonth ? (
        <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed">
          <div className="text-5xl mb-4">📅</div>
          <h3 className="text-xl font-semibold text-slate-200 mb-2">Select a Month</h3>
          <p className="text-slate-400">Please select a month from the top right filter to view the purchase list.</p>
        </div>
      ) : isLoading && purchases.length === 0 ? (
        <div className="text-center py-20 text-slate-400">Loading purchases...</div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden z-10 relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">Month</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">Client Name</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">Client BIN</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">Office</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">BE No</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">BE Date</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">Item Name</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs">HS Code</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs text-right">Total Qty.</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs text-right">Base Value Of VAT</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs text-right">Unit Value</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs text-right">VAT</th>
                  <th className="px-4 py-3 font-semibold text-slate-400 uppercase text-xs text-right">AT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {purchases.map(purchase => (
                  <tr key={purchase.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="bg-amber-500/20 text-amber-300 px-2 py-1 rounded text-xs font-semibold border border-amber-500/20">{formatMonth(purchase.month)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-200">{purchase.clientName || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{purchase.clientBin || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{purchase.office}</td>
                    <td className="px-4 py-3 font-medium text-slate-200">{purchase.beNo}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(purchase.beDate)}</td>
                    <td className="px-4 py-3 text-slate-200">{purchase.itemName || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-xs font-semibold border border-emerald-500/20">{purchase.hsCode || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-300">{formatNumber(purchase.totalQty)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-300">{formatNumber(purchase.baseValueOfVat)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-300">{formatNumber(purchase.unitValue)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-300">{formatNumber(purchase.vat)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-300">{formatNumber(purchase.at)}</td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-slate-400 italic">No purchases found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-between items-center px-6 py-4 bg-slate-900 border-t border-slate-700">
              <button 
                onClick={() => setCurrentPage(c => c - 1)} 
                disabled={currentPage === 1} 
                className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 transition-all"
              >
                Previous
              </button>
              <span className="text-sm font-medium text-slate-400">Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(c => c + 1)} 
                disabled={currentPage === totalPages} 
                className="px-4 py-2 border border-slate-600 bg-slate-800 text-slate-200 rounded font-medium hover:bg-slate-700 hover:border-blue-500 disabled:opacity-50 transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
