import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, Trash2, ChevronLeft, ChevronRight, AlertCircle, ShoppingCart, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function GlobalPurchases() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [lcSearch, setLcSearch] = useState('');
  const [debouncedLc, setDebouncedLc] = useState('');
  const [deleteMonthConfirm, setDeleteMonthConfirm] = useState('');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLc(lcSearch);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [lcSearch]);

  const { data: monthsData } = useQuery({
    queryKey: ['superadmin-global-purchases-months'],
    queryFn: async () => {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/superadmin/global-purchases/months`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    }
  });

  useEffect(() => {
    if (monthsData?.success && monthsData.data?.length > 0 && !selectedMonth) {
      setSelectedMonth(monthsData.data[0]);
    }
  }, [monthsData, selectedMonth]);

  const { data: purchasesData, isLoading } = useQuery({
    queryKey: ['superadmin-global-purchases', page, limit, selectedMonth, debouncedLc],
    queryFn: async () => {
      if (!selectedMonth) return { data: [], pagination: { totalPages: 1 } };
      
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        month: selectedMonth,
      });
      if (debouncedLc) queryParams.append('lcNumber', debouncedLc);
      
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/superadmin/global-purchases?${queryParams}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    },
    enabled: !!selectedMonth
  });

  const deleteMutation = useMutation({
    mutationFn: async (month: string) => {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/superadmin/global-purchases/months/${month}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setDeleteMonthConfirm('');
        queryClient.invalidateQueries({ queryKey: ['superadmin-global-purchases'] });
        queryClient.invalidateQueries({ queryKey: ['superadmin-global-purchases-months'] });
        setSelectedMonth('');
      } else {
        alert(data.error);
      }
    }
  });

  const handleDeleteMonth = () => {
    if (!deleteMonthConfirm) return;
    deleteMutation.mutate(deleteMonthConfirm);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch (e) {
      return dateString;
    }
  };

  const formatMonth = (monthString: string) => {
    try {
      const [year, month] = monthString.split('-');
      return format(new Date(parseInt(year), parseInt(month) - 1), 'MMM yyyy');
    } catch (e) {
      return monthString;
    }
  };

  const months = monthsData?.data || [];
  const purchases = purchasesData?.data || [];
  const pagination = purchasesData?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-blue-400" />
            Global Purchases
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            System-wide view of all purchases across all tenants
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Name, BIN, Item, LC..."
              value={lcSearch}
              onChange={(e) => setLcSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg pl-9 pr-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            />
          </div>
          
          <div className="relative z-10 w-48">
            <div 
              tabIndex={0}
              onBlur={() => setTimeout(() => setShowMonthDropdown(false), 200)}
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer flex justify-between items-center"
            >
              <span className={`truncate ${!selectedMonth ? 'text-slate-400' : ''}`}>
                {selectedMonth ? formatMonth(selectedMonth) : 'Select Month'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
            
            {showMonthDropdown && (
              <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                <div 
                  className="px-4 py-2.5 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 transition-colors text-slate-400 text-sm"
                  onMouseDown={() => {
                    setSelectedMonth('');
                    setPage(1);
                    setShowMonthDropdown(false);
                  }}
                >
                  Select Month
                </div>
                {months.map((m: string) => (
                  <div 
                    key={m} 
                    className="px-4 py-2.5 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors text-slate-200 text-sm" 
                    onMouseDown={() => { 
                      setSelectedMonth(m); 
                      setPage(1);
                      setShowMonthDropdown(false); 
                    }}
                  >
                    {formatMonth(m)}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {selectedMonth && (
            <button
              onClick={() => setDeleteMonthConfirm(selectedMonth)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Month Data</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden">

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium w-[26%]">Client</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap w-[16%]">BE No & Date</th>
                <th className="px-4 py-3 font-medium w-[14%]">Item</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap text-right w-[11%]">Total Qty</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap text-right w-[11%]">Base Value</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap text-right w-[11%]">VAT</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap text-right w-[11%]">AT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p className="text-slate-400">Loading purchases...</p>
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <ShoppingCart className="w-6 h-6 text-slate-500" />
                    </div>
                    <p className="text-slate-300 font-medium">No purchases found</p>
                    <p className="text-slate-500 text-sm mt-1">
                      {!selectedMonth ? 'Select a month to view purchases.' : 'Try adjusting your search criteria.'}
                    </p>
                  </td>
                </tr>
              ) : (
                purchases.map((purchase: any) => (
                  <tr key={purchase.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{purchase.clientName || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">BIN: {purchase.clientBin || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-blue-400">{purchase.beNo || '-'}</div>
                      <div className="text-xs text-slate-500">{formatDate(purchase.beDate)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-300">{purchase.itemName || '-'}</div>
                      {purchase.hsCode && <div className="text-xs text-slate-500 mt-0.5">[{purchase.hsCode}]</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-200">
                      {purchase.totalQty?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {purchase.baseValueOfVat?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {purchase.vat?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {purchase.at?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination?.totalPages > 1 && (
          <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Showing <span className="font-medium text-slate-200">{(page - 1) * limit + 1}</span> to <span className="font-medium text-slate-200">{Math.min(page * limit, pagination.total)}</span> of <span className="font-medium text-slate-200">{pagination.total}</span> results
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-sm font-medium text-slate-300 px-2">
                Page {page} of {pagination.totalPages}
              </div>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal using createPortal */}
      {deleteMonthConfirm && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 text-red-500 mb-4 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-center text-slate-100 mb-2">Delete Entire Month?</h3>
              <p className="text-slate-400 text-center mb-6">
                Are you absolutely sure you want to delete <strong className="text-slate-200">{formatMonth(deleteMonthConfirm)}</strong> data system-wide? This action will permanently remove all purchases for all tenants for this month.
              </p>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setDeleteMonthConfirm('')}
                  className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMonth}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete All'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
