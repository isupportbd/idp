import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiClient } from '../../api/client';
import { type Client, type Item, type UnitConversion, type Purchase, type SalesReportItem, formatMonth, formatDate } from './reports/types';
import { useAuthStore } from '../../stores/auth';

import PurchaseReport from './reports/PurchaseReport';
import SalesReport from './reports/SalesReport';
import StatementReport from './reports/StatementReport';
import ReturnReport from './reports/ReturnReport';

export default function TenantReports() {
  const { user } = useAuthStore();
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [unitConversions, setUnitConversions] = useState<UnitConversion[]>([]);
  const [clientSalesRates, setClientSalesRates] = useState<any[]>([]);
  // Client autocomplete
  const [clientSearchText, setClientSearchText] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');

  // Month
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonthYear, setSelectedMonthYear] = useState('');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);

  // Item filter
  const [itemSearchText, setItemSearchText] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [clientMonthItems, setClientMonthItems] = useState<Item[]>([]);

  // Unit Conversion
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);

  // Tabs
  const [currentTab, setCurrentTab] = useState<'purchases' | 'sales' | 'statement' | 'return'>('purchases');

  // Data
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [salesReport, setSalesReport] = useState<SalesReportItem[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [statementReport, setStatementReport] = useState<any[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [isStatementUnlocked, setIsStatementUnlocked] = useState(false);
  const [statementCountdown, setStatementCountdown] = useState(0);

  // eVAT Credentials
  const [eVatCredentials, setEVatCredentials] = useState<{ loginId: string, loginPassword?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<'username' | 'password' | null>(null);

  const handleCopyCredential = (text: string, field: 'username' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Change Month Modal
  const [showChangeMonthModal, setShowChangeMonthModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [newMonthSelection, setNewMonthSelection] = useState('');
  const [isSavingMonth, setIsSavingMonth] = useState(false);

  const currentConvFactor = useMemo(() => {
    if (!selectedUnitId) return 1;
    const c = unitConversions.find(u => u.id === selectedUnitId);
    return c && Number(c.factor) ? Number(c.factor) : 1;
  }, [selectedUnitId, unitConversions]);

  const selectedUnitName = useMemo(() => {
    if (!selectedUnitId) return 'Unit';
    const c = unitConversions.find(u => u.id === selectedUnitId);
    return c ? `${c.purchaseUnit} ➔ ${c.salesUnit}` : 'Unit';
  }, [selectedUnitId, unitConversions]);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);


  const filteredClients = clientSearchResults;

  const filteredItems = useMemo(() => {
    if (!itemSearchText) return clientMonthItems;
    const l = itemSearchText.toLowerCase();
    return clientMonthItems.filter(i => i.name.toLowerCase().includes(l) || (i.hsCode && i.hsCode.toLowerCase().includes(l)));
  }, [clientMonthItems, itemSearchText]);

  const hasMissingRates = useMemo(() => salesReport.some(i => i.rate === 0), [salesReport]);

  const vatNote22 = useMemo(() => purchases.filter(p => {
    const rawRebate: any = p.isRebate;
    const isRebate = rawRebate === true || rawRebate === 1 || String(rawRebate).toLowerCase() === 'true' || String(rawRebate) === '1';
    return p.vat && parseFloat(p.vat.toString()) > 0 && !isRebate;
  }), [purchases]);

  const vatNote15 = useMemo(() => purchases.filter(p => {
    const rawRebate: any = p.isRebate;
    const isRebate = rawRebate === true || rawRebate === 1 || String(rawRebate).toLowerCase() === 'true' || String(rawRebate) === '1';
    return p.vat && parseFloat(p.vat.toString()) > 0 && isRebate;
  }), [purchases]);

  const vatNote13 = useMemo(() => purchases.filter(p => !p.vat || parseFloat(p.vat.toString()) === 0), [purchases]);


  const fetchAll = useCallback(async () => {
    try {
      const unitsRes = await apiClient.api.settings['unit-conversions'].$get();
      if (unitsRes.ok) {
        const uData = await unitsRes.json() as any;
        setUnitConversions(uData.data || []);
      }
    } catch (e) { console.error('Fetch error', e); }
  }, []);

  // Debounced client search
  useEffect(() => {
    if (!clientSearchText || selectedClientId) {
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
  }, [clientSearchText, selectedClientId]);

  const fetchAvailableMonths = useCallback(async (clientId: number | '', preserveMonth: boolean = false) => {
    if (!clientId) { setAvailableMonths([]); setSelectedMonthYear(''); return; }
    try {
      const res = await apiClient.api.purchases.months.$get({
        query: { clientId: clientId.toString() }
      });
      if (res.ok) {
        const data = await res.json() as any;
        const months = data.data || [];
        setAvailableMonths(months);
        setSelectedMonthYear(prev => {
          if (preserveMonth && prev && months.includes(prev)) return prev;
          return months[0] || '';
        });
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchPurchases = useCallback(async (cId = selectedClientId, month = selectedMonthYear, itemId = selectedItemId) => {
    if (!cId || !month) { setPurchases([]); return; }
    setIsLoadingPurchases(true);

    try {
      // Parallel fetch: sales rates + purchases at the same time
      const [srRes, res] = await Promise.all([
        fetch(
          `${import.meta.env.VITE_API_URL || ''}/api/sales-rates/active/${cId}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        ),
        apiClient.api.purchases.$get({
          query: {
            clientId: cId.toString(),
            month,
            limit: '10000',
            ...(itemId && { itemId: itemId.toString() })
          }
        })
      ]);

      if (srRes.ok) {
        const allRates = await srRes.json() as any;
        setClientSalesRates(allRates.data || []);
      }
      if (res.ok) {
        const dataRes = await res.json() as any;
        const data = dataRes.data || dataRes || [];
        setPurchases(data);

        if (!itemId) {
          const map = new Map<number, Item>();
          for (const p of data) {
            if (p.itemId && !map.has(p.itemId)) map.set(p.itemId, { id: p.itemId, name: p.itemName, hsCode: p.hsCode });
          }
          setClientMonthItems(Array.from(map.values()));
        }
      }
    } catch (e) { console.error(e); }
    finally { setIsLoadingPurchases(false); }
  }, [selectedClientId, selectedMonthYear, selectedItemId]);

  const fetchSalesReport = useCallback(async (cId = selectedClientId, month = selectedMonthYear, itemId = selectedItemId) => {
    if (!cId || !month) { setSalesReport([]); return; }
    setIsLoadingSales(true);

    try {
      const query = new URLSearchParams({ clientId: cId.toString(), month });
      if (itemId) query.append('itemId', itemId.toString());
      
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/reports/sales?${query.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (res.ok) {
        const data = await res.json() as any;
        setSalesReport(data.data || []);
      } else {
        setSalesReport([]);
      }
    } catch (e) { 
      console.error(e); 
      setSalesReport([]); 
    }
    finally { setIsLoadingSales(false); }
  }, [selectedClientId, selectedMonthYear, selectedItemId]);

  const fetchStatementReport = useCallback(async (cId = selectedClientId, month = selectedMonthYear) => {
    if (!cId || !month) { setStatementReport([]); return; }
    setIsLoadingStatement(true);

    try {
      const query = new URLSearchParams({ clientId: cId.toString(), month });
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/reports/statement?${query.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json() as any;
        setStatementReport(data.data || []);
      } else {
        setStatementReport([]);
      }
    } catch (e) { 
      console.error(e); 
      setStatementReport([]); 
    }
    finally { setIsLoadingStatement(false); }
  }, [selectedClientId, selectedMonthYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const fetchCreds = async () => {
      if (!selectedClientId) {
        setEVatCredentials(null);
        return;
      }
      try {
        const baseUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${baseUrl}/api/client-credentials?clientId=${selectedClientId}&limit=1`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.success && data.data && data.data.length > 0) {
            setEVatCredentials(data.data[0]);
          } else {
            setEVatCredentials(null);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchCreds();
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) { 
      setClientMonthItems([]); setItemSearchText(''); setSelectedItemId(''); 
      return; 
    }

    setIsStatementUnlocked(false);
    setStatementCountdown(0);

    // Fetch primary reports simultaneously when client or month changes
    fetchPurchases();
    fetchSalesReport();
  }, [selectedClientId, selectedMonthYear, fetchPurchases, fetchSalesReport]);

  // Lazy-load Statement Report
  const lastFetchedStatement = useRef({ clientId: '', month: '' });
  useEffect(() => {
    if (currentTab === 'statement' && selectedClientId && selectedMonthYear && isStatementUnlocked) {
      if (
        lastFetchedStatement.current.clientId !== selectedClientId.toString() ||
        lastFetchedStatement.current.month !== selectedMonthYear
      ) {
        lastFetchedStatement.current = { clientId: selectedClientId.toString(), month: selectedMonthYear };
        fetchStatementReport();
      }
    }
  }, [currentTab, selectedClientId, selectedMonthYear, isStatementUnlocked, fetchStatementReport]);

  const selectClient = async (client: Client) => {
    setSelectedClient(client);
    setSelectedClientId(client.id);
    setClientSearchText(client.name);
    setShowClientDropdown(false);
    setClientSearchResults([]);
    setSelectedItemId(''); setItemSearchText('');
    fetchAvailableMonths(client.id);
  };

  const clearClient = () => {
    setSelectedClient(null);
    setSelectedClientId(''); setClientSearchText(''); setAvailableMonths([]);
    setSelectedMonthYear(''); setPurchases([]); setSalesReport([]); setClientMonthItems([]);
    setClientSearchResults([]);
  };

  const selectItem = (item: Item) => {
    setSelectedItemId(item.id);
    setItemSearchText(item.name);
    setShowItemDropdown(false);
    if (currentTab === 'purchases') fetchPurchases(selectedClientId, selectedMonthYear, item.id);
    else if (currentTab === 'sales') fetchSalesReport(selectedClientId, selectedMonthYear, item.id);
  };

  const clearItem = () => {
    setSelectedItemId(''); setItemSearchText(''); setShowItemDropdown(false);
    if (currentTab === 'purchases') fetchPurchases(selectedClientId, selectedMonthYear, '');
    else if (currentTab === 'sales') fetchSalesReport(selectedClientId, selectedMonthYear, '');
  };

  const openChangeMonthModal = (p: Purchase) => {
    setEditingPurchase(p);
    setNewMonthSelection(p.month);
    setShowChangeMonthModal(true);
  };

  const saveNewMonth = async () => {
    if (!editingPurchase || !newMonthSelection) return;
    setIsSavingMonth(true);
    try {
      const res = await apiClient.api.purchases[':id'].month.$put({
        param: { id: editingPurchase.id.toString() },
        json: { newMonth: newMonthSelection }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success) {
          // Pass true to preserve the current month selection!
          await fetchAvailableMonths(selectedClientId, true);
          await fetchPurchases();
          setShowChangeMonthModal(false);
        } else alert(data.message || 'Failed');
      } else {
        const err = await res.json() as any;
        alert(err.message || 'Failed');
      }
    } catch (e) { alert('Error saving month'); }
    finally { setIsSavingMonth(false); }
  };

  const downloadPurchaseExcel = () => {
    const cf = currentConvFactor;
    const wb = XLSX.utils.book_new();
    const headers = ['Serial', 'Item', 'HS Code', 'Total Qty', 'BE No', 'BE Date', 'Station', 'Ass. Value', 'Base Value', 'SD', 'VAT', 'AT'];
    const makeRows = (list: Purchase[]) => list.map((p, i) => ({
      'Serial': i + 1, 'Item': p.itemName || '-', 'HS Code': p.hsCode || '-',
      'Total Qty': +(p.totalQty * cf).toFixed(2), 'BE No': p.beNo || '-',
      'BE Date': formatDate(p.beDate), 'Station': p.office || '-',
      'Ass. Value': +Number(p.assValue).toFixed(2), 'Base Value': +Number(p.baseValueOfVat).toFixed(2),
      'SD': +Number(p.sd).toFixed(2), 'VAT': +Number(p.vat).toFixed(2), 'AT': +Number(p.at).toFixed(2),
    }));
    const addSheet = (name: string, list: Purchase[]) => {
      if (list.length === 0) return;
      const ws = XLSX.utils.json_to_sheet(makeRows(list), { header: headers });
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    addSheet('Note 22', vatNote22);
    addSheet('Note 15', vatNote15);
    addSheet('Note 13', vatNote13);
    XLSX.writeFile(wb, `Purchase_Details_${selectedClient?.name || 'Client'}_${formatMonth(selectedMonthYear)}.xlsx`);
  };

  const TABS = [
    { id: 'purchases', label: 'Purchase Report' },
    { id: 'sales', label: 'Sales Report' },
    { id: 'return', label: 'Return Report' },
    ...(user?.role === 'admin' ? [{ id: 'statement', label: 'Statement' }] : []),
  ] as const;

  return (
    <div className="w-full max-w-screen-2xl mx-auto pb-10">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-6 pb-4 border-b border-slate-700">
        {/* Client Autocomplete */}
        <div className="relative min-w-[240px] flex-1 max-w-xs">
          <input
            type="text" value={clientSearchText}
            onChange={e => {
              setClientSearchText(e.target.value);
              setSelectedClientId('');
              if (e.target.value) setShowClientDropdown(true);
              else setShowClientDropdown(false);
            }}
            onFocus={() => { if (clientSearchText) setShowClientDropdown(true); }}
            onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
            placeholder="Filter by Client..."
            className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 pr-8"
          />
          {clientSearchText && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs" onMouseDown={clearClient}>✕</button>
          )}
          {showClientDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
              {!clientSearchText ? (
                <div className="px-4 py-3 text-slate-400 text-sm italic">Type to search for a client...</div>
              ) : isSearchingClients ? (
                <div className="px-4 py-3 text-slate-400 text-sm italic">Searching...</div>
              ) : filteredClients.length > 0 ? filteredClients.map(c => (
                <div key={c.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => selectClient(c)}>
                  <div className="font-medium text-slate-200 text-sm">{c.name}</div>
                  {c.bin && <div className="text-xs text-slate-400">BIN: {c.bin}</div>}
                </div>
              )) : <div className="px-4 py-3 text-slate-400 text-sm italic">No clients found</div>}
            </div>
          )}
        </div>

        {/* Month Dropdown */}
        <div className="relative w-44">
          <input
            type="text" readOnly value={selectedMonthYear ? formatMonth(selectedMonthYear) : ''}
            placeholder={selectedClientId ? 'Select month...' : 'Select client first'}
            disabled={!selectedClientId}
            onMouseDown={() => selectedClientId && setShowMonthDropdown(v => !v)}
            onBlur={() => setTimeout(() => setShowMonthDropdown(false), 200)}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">▼</span>
          {showMonthDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
              {availableMonths.length > 0 ? availableMonths.map(m => (
                <div key={m} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 text-sm text-slate-200" onMouseDown={() => { setSelectedMonthYear(m); setShowMonthDropdown(false); }}>
                  {formatMonth(m)}
                </div>
              )) : <div className="px-4 py-3 text-slate-400 text-sm italic">No months available</div>}
            </div>
          )}
        </div>

        {/* Unit Conversion */}
        <div className="relative w-52">
          <input
            type="text" readOnly value={selectedUnitName}
            onMouseDown={() => setShowUnitDropdown(v => !v)}
            onBlur={() => setTimeout(() => setShowUnitDropdown(false), 200)}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none cursor-pointer pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">▼</span>
          {showUnitDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
              <div className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 border-b border-slate-700/50" onMouseDown={() => { setSelectedUnitId(null); setShowUnitDropdown(false); }}>Unit</div>
              {unitConversions.map(u => (
                <div key={u.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 border-b border-slate-700/50 last:border-0" onMouseDown={() => { setSelectedUnitId(u.id); setShowUnitDropdown(false); }}>
                  {u.purchaseUnit} ➔ {u.salesUnit}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Item Filter */}
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <input
            type="text" value={itemSearchText}
            onChange={e => {
              setItemSearchText(e.target.value);
              if (!e.target.value && selectedItemId) clearItem();
              if (e.target.value) setShowItemDropdown(true);
              else setShowItemDropdown(false);
            }}
            onFocus={() => { if (itemSearchText) setShowItemDropdown(true); }}
            onBlur={() => setTimeout(() => setShowItemDropdown(false), 200)}
            placeholder="Filter by Item (Optional)..."
            disabled={!selectedClientId || !selectedMonthYear}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed pr-8"
          />
          {itemSearchText && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs" onMouseDown={clearItem}>✕</button>
          )}
          {showItemDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
              {filteredItems.length > 0 ? filteredItems.map(i => (
                <div key={i.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => selectItem(i)}>
                  <div className="font-medium text-slate-200 text-sm">{i.name}</div>
                  {i.hsCode && <div className="text-xs text-slate-400">HS: {i.hsCode}</div>}
                </div>
              )) : <div className="px-4 py-3 text-slate-400 text-sm italic">No items found</div>}
            </div>
          )}
        </div>

        {/* Download button (purchase tab) */}
        {currentTab === 'purchases' && purchases.length > 0 && (
          <button
            onClick={downloadPurchaseExcel}
            title="Download Excel"
            className="w-9 h-9 rounded-lg border border-slate-600 bg-slate-800 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 flex items-center justify-center transition-all flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>

      {!selectedClient ? (
        <div className="bg-slate-800 border border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center py-20 text-slate-400 text-center">
          <div className="text-6xl mb-4 opacity-50">📊</div>
          <h3 className="text-xl font-semibold text-slate-300 mb-2">Select a client and month to view reports</h3>
          <p>Please use the filters above to generate the report.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-700 bg-slate-900/50 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id as any)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${currentTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-slate-800 rounded-b-xl border-x border-b border-slate-700 p-6 min-h-[400px]">
            {/* Purchase Report Tab */}
            {currentTab === 'purchases' && (
              isLoadingPurchases ? (
                <div className="flex flex-col items-center justify-center py-16 text-emerald-400 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-medium">Loading Purchase Report...</p>
                </div>
              ) : purchases.length > 0 ? (
                <PurchaseReport
                  purchases={purchases}
                  clientSalesRates={clientSalesRates}
                  selectedMonthYear={selectedMonthYear}
                  currentConvFactor={currentConvFactor}
                  openChangeMonthModal={openChangeMonthModal}
                />
              ) : (
                <div className="text-center py-16 text-slate-400">
                  <h4 className="text-lg font-semibold text-slate-300 mb-2">Purchase Report</h4>
                  <p>No purchase data found for this client and month.</p>
                </div>
              )
            )}

            {/* Sales Report Tab */}
            {currentTab === 'sales' && (
              isLoadingSales ? (
                <div className="flex flex-col items-center justify-center py-16 text-blue-400 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-medium">Loading Sales Report...</p>
                </div>
              ) : salesReport.length > 0 ? (
                <SalesReport 
                  salesReport={salesReport} 
                  currentConvFactor={currentConvFactor} 
                  hasMissingRates={hasMissingRates} 
                />
              ) : (
                <div className="text-center py-16 text-slate-400">
                  <h4 className="text-lg font-semibold text-slate-300 mb-2">Sales Report</h4>
                  <p>No sales data found for this client and month.</p>
                </div>
              )
            )}

            {/* Statement Report Tab */}
            {currentTab === 'statement' && (
              !isStatementUnlocked ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                  {statementCountdown > 0 ? (
                    <div className="flex flex-col items-center space-y-4">
                      <div className="text-7xl font-black text-blue-500 animate-pulse">{statementCountdown}</div>
                      <p className="text-slate-400 font-medium tracking-wide">Generating Statement...</p>
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        setStatementCountdown(5);
                        
                        // Trigger fetch immediately in the background
                        if (selectedClientId && selectedMonthYear) {
                          if (
                            lastFetchedStatement.current.clientId !== selectedClientId.toString() ||
                            lastFetchedStatement.current.month !== selectedMonthYear
                          ) {
                            lastFetchedStatement.current = { clientId: selectedClientId.toString(), month: selectedMonthYear };
                            fetchStatementReport();
                          }
                        }

                        let count = 5;
                        const interval = setInterval(() => {
                          count--;
                          if (count <= 0) {
                            clearInterval(interval);
                            setIsStatementUnlocked(true);
                            setStatementCountdown(0);
                          } else {
                            setStatementCountdown(count);
                          }
                        }, 1000);
                      }}
                      className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:scale-105 active:scale-95 flex flex-col items-center"
                    >
                      <span className="text-lg">View Statement Report</span>
                    </button>
                  )}
                  <p className="text-sm text-slate-500 mt-4">Clicking this will generate the final statement for the month</p>
                </div>
              ) : isLoadingStatement ? (
                <div className="flex flex-col items-center justify-center py-16 text-blue-400 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-medium">Loading Statement...</p>
                </div>
              ) : statementReport.length > 0 ? (
                <StatementReport statementReport={statementReport} currentConvFactor={currentConvFactor} />
              ) : (
                <div className="text-center py-16 text-slate-400">
                  <h4 className="text-lg font-semibold text-slate-300 mb-2">Statement</h4>
                  <p>No statement data found for this client and month.</p>
                </div>
              )
            )}

            {/* Return Report Tab */}
            {currentTab === 'return' && (
              <ReturnReport 
                purchases={purchases}
                salesReport={salesReport}
                eVatCredentials={eVatCredentials}
                copiedField={copiedField}
                handleCopyCredential={handleCopyCredential}
              />
            )}
          </div>
        </div>
      )}

      {/* Change Month Modal */}
      {showChangeMonthModal && editingPurchase && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowChangeMonthModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100">Change Month</h3>
              <button className="text-slate-500 hover:text-white transition-colors" onClick={() => setShowChangeMonthModal(false)}>✕</button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-sm text-slate-400 mb-2">Select New Month</label>
              <input
                type="month"
                min={editingPurchase?.month}
                value={newMonthSelection}
                onChange={e => setNewMonthSelection(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800">
              <button className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg font-medium transition-colors" onClick={() => setShowChangeMonthModal(false)} disabled={isSavingMonth}>Cancel</button>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50" onClick={saveNewMonth} disabled={isSavingMonth || !newMonthSelection}>
                {isSavingMonth ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
