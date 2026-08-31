import { useState, useEffect, useMemo, useCallback } from 'react';
import { Edit2, Copy, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { apiClient } from '../../api/client';
import * as XLSX from 'xlsx';

interface Client { id: number; name: string; bin?: string; }
interface Item { id: number; name: string; hsCode?: string; }
interface UnitConversion { id: number; purchaseUnit: string; salesUnit: string; factor: number; }

interface Purchase {
  id: number;
  office: string;
  beNo: string;
  beDate: string;
  month: string;
  lcNumber: string;
  netWt: number;
  totalQty: number;
  assValue: number;
  baseValueOfVat: number;
  unitValue: number;
  cd: number; rd: number; sd: number; vat: number; at: number;
  isRebate: boolean;
  isFfs: boolean;
  clientName: string; clientBin: string;
  itemId?: number;
  itemName: string;
  hsCode: string; awHsCode: string;
}

interface SalesReportItem {
  itemId: number; itemName: string; hsCode: string;
  totalQty: number; rate: number; unitValue: number;
  totalValue: number; addition: number; vatRate: number; note: string;
}

interface ClientCredential {
  clientId: number; portalName: string; loginId: string; loginPassword: string;
}


const formatMonth = (yyyyMm: string) => {
  if (!yyyyMm) return '';
  const [year, month] = yyyyMm.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return `${date.toLocaleString('en-US', { month: 'short' })}-${year.slice(2)}`;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
};

const fmt = (val: any, decimals = 2) => {
  if (val === undefined || val === null || val === '') return '';
  const num = parseFloat(val);
  return isNaN(num) ? val : num.toFixed(decimals);
};

export default function TenantReports() {
  const [clients, setClients] = useState<Client[]>([]);
  const [unitConversions, setUnitConversions] = useState<UnitConversion[]>([]);
  const [currentCredential, setCurrentCredential] = useState<ClientCredential | null>(null);
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
  const [currentTab, setCurrentTab] = useState<'purchases' | 'sales' | 'vat' | 'vat_regular' | 'statement'>('purchases');

  // Data
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [salesReport, setSalesReport] = useState<SalesReportItem[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [statementReport, setStatementReport] = useState<any[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);

  // VAT
  const [isVatCalculated, setIsVatCalculated] = useState(false);
  const [isLoadingVat, setIsLoadingVat] = useState(false);
  
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [visiblePassword, setVisiblePassword] = useState(false);

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Change Month Modal
  const [showChangeMonthModal, setShowChangeMonthModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [newMonthSelection, setNewMonthSelection] = useState('');
  const [isSavingMonth, setIsSavingMonth] = useState(false);

  const currentConvFactor = useMemo(() => {
    if (!selectedUnitId) return 1;
    const c = unitConversions.find(u => u.id === selectedUnitId);
    return c ? c.factor : 1;
  }, [selectedUnitId, unitConversions]);

  const selectedUnitName = useMemo(() => {
    if (!selectedUnitId) return 'Unit';
    const c = unitConversions.find(u => u.id === selectedUnitId);
    return c ? `${c.purchaseUnit} ➔ ${c.salesUnit}` : 'Unit';
  }, [selectedUnitId, unitConversions]);

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId) || null, [clients, selectedClientId]);
  // currentCredential is fetched per-client when a client is selected (see selectClient)

  const filteredClients = useMemo(() => {
    if (!clientSearchText) return [];
    const l = clientSearchText.toLowerCase();
    return clients
      .filter(c => c.name.toLowerCase().includes(l) || (c.bin && c.bin.toLowerCase().includes(l)))
      .slice(0, 50);
  }, [clients, clientSearchText]);

  const filteredItems = useMemo(() => {
    if (!itemSearchText) return clientMonthItems;
    const l = itemSearchText.toLowerCase();
    return clientMonthItems.filter(i => i.name.toLowerCase().includes(l) || (i.hsCode && i.hsCode.toLowerCase().includes(l)));
  }, [clientMonthItems, itemSearchText]);

  // Derived purchase groups
  // Note 22: VAT > 0, NOT rebate (isFfs=true purchases are always isRebate=false, so they naturally land here)
  const vatNote22 = useMemo(() => purchases.filter(p => p.vat && parseFloat(p.vat.toString()) > 0 && !p.isRebate), [purchases]);
  // Note 15: VAT > 0, IS rebate (isFfs and isRebate are mutually exclusive — no need to exclude isFfs here)
  const vatNote15 = useMemo(() => purchases.filter(p => p.vat && parseFloat(p.vat.toString()) > 0 && p.isRebate), [purchases]);
  const vatNote13 = useMemo(() => purchases.filter(p => !p.vat || parseFloat(p.vat.toString()) === 0), [purchases]);

  // Purchase summary builder
  const getPurchaseSummary = useCallback((list: Purchase[]) => {
    const groups: Record<string, any> = {};
    
    // Sort rates descending by activation date
    const sortedRates = [...clientSalesRates].sort((a, b) => new Date(b.activationDate).getTime() - new Date(a.activationDate).getTime());
    
    // Fallback date: end of selected month
    let reportMonthEnd = new Date();
    if (selectedMonthYear) {
      const [yearStr, monthStr] = selectedMonthYear.split('-');
      reportMonthEnd = new Date(parseInt(yearStr), parseInt(monthStr), 0);
    }

    list.forEach(p => {
      const pDate = new Date(p.beDate);
      
      // Match rate
      let applicableRate = sortedRates.find(r => r.itemId === p.itemId && new Date(r.activationDate) <= pDate);
      if (!applicableRate) {
        applicableRate = sortedRates.find(r => r.itemId === p.itemId && new Date(r.activationDate) <= reportMonthEnd);
      }
      
      const key = `${p.hsCode}_${p.itemName}`;

      if (!groups[key]) {
        groups[key] = { hsCode: p.hsCode || '', itemName: p.itemName || '', netQty: 0, assValue: 0, baseValueOfVat: 0, sd: 0, vat: 0, at: 0, purchaseRate: 0, maxSalesRate: 0, additionPercent: 0, vatRate: 0, totalMaxSalesValue: 0 };
        if (applicableRate) {
          groups[key].additionPercent = Number(applicableRate.additionPercent) || 0;
          groups[key].vatRate = Number(applicableRate.vatRate) || 0;
        }
      }
      
      const pQty = Number(p.totalQty) || 0;
      const pBaseValueOfVat = Number(p.baseValueOfVat) || 0;
      
      const additionPercent = applicableRate ? (Number(applicableRate.additionPercent) || 0) : 0;
      const vatRate = applicableRate ? (Number(applicableRate.vatRate) || 0) : 0;
      
      let pPurchaseRate = 0;
      let pAddedBase = 0;
      let pMaxSalesRate = 0;
      if (pQty > 0) {
        pPurchaseRate = pBaseValueOfVat / pQty;
        pAddedBase = pPurchaseRate * (1 + additionPercent / 100);
        pMaxSalesRate = pAddedBase * (1 + vatRate / 100);
      }
      const pTotalMaxSalesValue = pMaxSalesRate * pQty;

      groups[key].netQty += pQty;
      groups[key].assValue += Number(p.assValue) || 0;
      groups[key].baseValueOfVat += pBaseValueOfVat;
      groups[key].sd += Number(p.sd) || 0;
      groups[key].vat += Number(p.vat) || 0;
      groups[key].at += Number(p.at) || 0;
      groups[key].totalMaxSalesValue += pTotalMaxSalesValue;
    });
    return Object.values(groups).map((g: any) => {
      if (g.netQty > 0) {
        g.purchaseRate = g.baseValueOfVat / g.netQty;
        g.maxSalesRate = g.totalMaxSalesValue / g.netQty;
      }
      return g;
    });
  }, [clientSalesRates, selectedMonthYear]);

  const activeSalesReport = useMemo(() => {
    if (currentTab === 'vat') return salesReport.filter((r: any) => r.isFfs);
    if (currentTab === 'vat_regular') return salesReport.filter((r: any) => !r.isFfs);
    return salesReport;
  }, [salesReport, currentTab]);

  const ffsItemIds = useMemo(() => new Set(salesReport.filter((r: any) => r.isFfs).map((r: any) => r.itemId)), [salesReport]);
  const regularItemIds = useMemo(() => new Set(salesReport.filter((r: any) => !r.isFfs).map((r: any) => r.itemId)), [salesReport]);

  const activePurchases = useMemo(() => {
    if (currentTab === 'vat') return purchases.filter((p: any) => ffsItemIds.has(p.itemId));
    if (currentTab === 'vat_regular') return purchases.filter((p: any) => regularItemIds.has(p.itemId));
    return purchases;
  }, [purchases, currentTab, ffsItemIds, regularItemIds]);

  const groupedSales = useMemo(() => {
    const g: Record<string, SalesReportItem[]> = {};
    activeSalesReport.forEach(item => {
      if (!g[item.note]) g[item.note] = [];
      g[item.note].push(item);
    });
    return g;
  }, [activeSalesReport]);

  const hasMissingRates = useMemo(() => activeSalesReport.some(i => i.rate === 0), [activeSalesReport]);

  // VAT calculations
  const totalVatNote4c = useMemo(() => activeSalesReport.reduce((s, i) => Number(i.vatRate) === 15 ? s + Number(i.totalValue) * 0.15 : s, 0), [activeSalesReport]);
  const totalVatNote8c = useMemo(() => activeSalesReport.reduce((s, i) => (Number(i.vatRate) === 7.5 || Number(i.vatRate) === 5) ? s + Number(i.totalValue) * Number(i.vatRate) / 100 : s, 0), [activeSalesReport]);
  const totalVatNote9c = totalVatNote4c + totalVatNote8c;
  const totalVatNote15b = useMemo(() => vatNote15.reduce((s, p) => s + (Number(p.vat) || 0), 0), [vatNote15]);
  const totalSalesValue = useMemo(() => activeSalesReport.reduce((s, i) => s + (Number(i.totalValue) || 0), 0), [activeSalesReport]);
  const totalSalesVat = useMemo(() => activeSalesReport.reduce((s, i) => s + Number(i.totalValue) * Number(i.vatRate) / 100, 0), [activeSalesReport]);
  const totalBaseValueOfVat = useMemo(() => activePurchases.reduce((s, p) => s + (Number(p.baseValueOfVat) || 0), 0), [activePurchases]);
  const totalAT = useMemo(() => activePurchases.reduce((s, p) => s + (Number(p.at) || 0), 0), [activePurchases]);
  const note27 = totalAT;
  const note32 = totalSalesVat;
  const calculatedVat65 = totalVatNote8c - note32 + note27 - totalAT;
  const calculatedVat34 = totalVatNote9c - totalVatNote15b - totalAT;

  // API calls
  const fetchAll = useCallback(async () => {
    try {
      const [clientsRes, unitsRes] = await Promise.all([
        apiClient.api.clients.$get({ query: { limit: '10000' } }),
        apiClient.api.settings['unit-conversions'].$get(),
      ]);
      if (clientsRes.ok) {
        const cData = await clientsRes.json() as any;
        setClients(Array.isArray(cData) ? cData : cData.data || []);
      }
      if (unitsRes.ok) {
        const uData = await unitsRes.json() as any;
        setUnitConversions(uData.data || []);
      }
    } catch (e) { console.error('Fetch error', e); }
  }, []);

  const fetchAvailableMonths = useCallback(async (clientId: number | '') => {
    if (!clientId) { setAvailableMonths([]); setSelectedMonthYear(''); return; }
    try {
      const res = await apiClient.api.purchases.months.$get({
        query: { clientId: clientId.toString() }
      });
      if (res.ok) {
        const data = await res.json() as any;
        const months = data.data || [];
        setAvailableMonths(months);
        setSelectedMonthYear(months[0] || '');
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchPurchases = useCallback(async (cId = selectedClientId, month = selectedMonthYear, itemId = selectedItemId) => {
    if (!cId || !month) { setPurchases([]); return; }
    setIsLoadingPurchases(true);
    try {
      // Use targeted endpoint — only fetch active rates for this specific client
      const srRes = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/sales-rates/active/${cId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (srRes.ok) {
        const allRates = await srRes.json() as any;
        setClientSalesRates(allRates.data || []);
      }

      const res = await apiClient.api.purchases.$get({
        query: {
          clientId: cId.toString(),
          month,
          limit: '10000',
          ...(itemId && { itemId: itemId.toString() })
        }
      });
      if (res.ok) {
        const dataRes = await res.json() as any;
        const data = dataRes.data || dataRes || [];
        setPurchases(data);

        // Extract unique items for item filter
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
      const res = await apiClient.api.reports.sales.$get({
        query: {
          clientId: cId.toString(),
          month,
          ...(itemId && { itemId: itemId.toString() })
        }
      });
      if (res.ok) {
        const data = await res.json() as any;
        setSalesReport(data.data || []);
      }
    } catch (e) { console.error(e); setSalesReport([]); }
    finally { setIsLoadingSales(false); }
  }, [selectedClientId, selectedMonthYear, selectedItemId]);

  const fetchStatementReport = useCallback(async (cId = selectedClientId, month = selectedMonthYear) => {
    if (!cId || !month) { setStatementReport([]); return; }
    setIsLoadingStatement(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/reports/statement?clientId=${cId}&month=${month}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json() as any;
        setStatementReport(data.data || []);
      }
    } catch (e) { console.error(e); setStatementReport([]); }
    finally { setIsLoadingStatement(false); }
  }, [selectedClientId, selectedMonthYear]);

  const calculateVat = async () => {
    setIsLoadingVat(true);
    await Promise.all([fetchPurchases(), fetchSalesReport()]);
    setIsVatCalculated(true);
    setIsLoadingVat(false);
  };

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    setIsVatCalculated(false);
    if (!selectedClientId) { setClientMonthItems([]); setItemSearchText(''); setSelectedItemId(''); }
    // vat and vat_regular tabs only re-use already-loaded purchases and salesReport — no new fetch needed
    if (currentTab === 'purchases') fetchPurchases();
    else if (currentTab === 'sales') fetchSalesReport();
    else if (currentTab === 'statement') fetchStatementReport();
  }, [selectedClientId, selectedMonthYear, currentTab]);

  // Client selection
  const selectClient = async (client: Client) => {
    setSelectedClientId(client.id);
    setClientSearchText(client.name);
    setShowClientDropdown(false);
    setSelectedItemId(''); setItemSearchText('');
    setCurrentCredential(null);
    fetchAvailableMonths(client.id);
    // Fetch credential for this specific client only
    try {
      const res = await apiClient.api['client-credentials'].$get({
        query: { clientId: client.id.toString() }
      });
      if (res.ok) {
        const data = await res.json() as any;
        setCurrentCredential((data.data || [])[0] || null);
      }
    } catch (e) { console.error('Failed to fetch credential', e); }
  };

  const clearClient = () => {
    setSelectedClientId(''); setClientSearchText(''); setAvailableMonths([]);
    setSelectedMonthYear(''); setPurchases([]); setSalesReport([]); setClientMonthItems([]);
    setCurrentCredential(null);
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
          await fetchPurchases();
          await fetchAvailableMonths(selectedClientId);
          setShowChangeMonthModal(false);
        } else alert(data.message || 'Failed');
      } else {
        const err = await res.json() as any;
        alert(err.message || 'Failed');
      }
    } catch (e) { alert('Error saving month'); }
    finally { setIsSavingMonth(false); }
  };

  // Excel exports
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
    { id: 'vat', label: 'VAT Report (Final Settlement)' },
    { id: 'vat_regular', label: 'VAT Report (Regular)' },
    { id: 'statement', label: 'Statement' },
  ] as const;

  // Render a purchase group section (summary + detail)
  const renderPurchaseSection = (title: string, list: Purchase[]) => {
    if (list.length === 0) return null;
    const summary = getPurchaseSummary(list);
    return (
      <div className="mb-8 bg-slate-800/30 border border-slate-700 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-slate-200 mb-3">Purchase Summary: ({title})</h4>
        <div className="overflow-x-auto overflow-y-auto max-h-80 rounded-lg border border-slate-700 mb-4">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Sl</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Total Qty</th>
                <th className="px-3 py-2 text-right">Ass. Value</th>
                <th className="px-3 py-2 text-right">Base Value</th>
                <th className="px-3 py-2 text-right">SD</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-right">AT</th>
                <th className="px-3 py-2 text-right">Purchase Rate</th>
                <th className="px-3 py-2 text-right">Max Sales Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {summary.map((s: any, i) => (
                <tr key={i} className="hover:bg-slate-700/30">
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-200">{s.itemName || '-'}</div>
                    {s.hsCode && <div className="text-slate-400 text-xs mt-0.5">[{s.hsCode}]</div>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.netQty * currentConvFactor)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.assValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.baseValueOfVat)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.sd)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.vat)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.at)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.purchaseRate / currentConvFactor)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(s.maxSalesRate / currentConvFactor, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="text-sm font-semibold text-slate-200 mb-3">Purchase Details: ({title})</h4>
        <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-lg border border-slate-700">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Serial</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Total Qty</th>
                <th className="px-3 py-2 text-left">BE_No</th>
                <th className="px-3 py-2 text-left">BE Date</th>
                <th className="px-3 py-2 text-left">Station</th>
                <th className="px-3 py-2 text-right">Ass. Value</th>
                <th className="px-3 py-2 text-right">Base Value</th>
                <th className="px-3 py-2 text-right">SD</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-right">AT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {list.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-700/30 group">
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-200">{p.itemName || '-'}</div>
                    {p.hsCode && <div className="text-slate-400 text-xs mt-0.5">[{p.hsCode}]</div>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(p.totalQty * currentConvFactor)}</td>
                  <td className="px-3 py-2 relative pr-10">
                    <span className="font-medium text-slate-200">{p.beNo || '-'}</span>
                    <button
                      onClick={() => openChangeMonthModal(p)}
                      title="Change Month"
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-400 p-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{formatDate(p.beDate)}</td>
                  <td className="px-3 py-2 text-slate-300">{p.office || '-'}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(p.assValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(p.baseValueOfVat)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(p.sd)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(p.vat)}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(p.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
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
                onClick={() => setCurrentTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                  currentTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Purchase Report Tab */}
            {currentTab === 'purchases' && (
              isLoadingPurchases ? (
                <div className="text-center py-16 text-blue-400">Loading purchase data...</div>
              ) : purchases.length > 0 ? (
                <div>
                  {renderPurchaseSection('Note: 22', vatNote22)}
                  {renderPurchaseSection('Note: 15', vatNote15)}
                  {renderPurchaseSection('Note: 13', vatNote13)}
                </div>
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
                <div className="text-center py-16 text-blue-400">Loading Sales Report...</div>
              ) : salesReport.length > 0 ? (
                <div>
                  {hasMissingRates && (
                    <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
                      <strong>⚠️ Warning:</strong> Some items do not have an active Sales Rate configured. Their calculations show as 0. Please go to <b>Sales Rates</b> to configure them.
                    </div>
                  )}
                  {Object.entries(groupedSales).map(([noteName, items]) => (
                    <div key={noteName} className="mb-6 bg-slate-800/30 border border-slate-700 rounded-xl p-5">
                      <h4 className="text-sm font-semibold text-slate-200 mb-3">Sales Summary: (Note: {noteName})</h4>
                      <div className="overflow-x-auto rounded-lg border border-slate-700">
                        <table className="w-full text-xs whitespace-nowrap">
                          <thead className="bg-slate-900 text-slate-400 uppercase tracking-wide">
                            <tr>
                              <th className="px-3 py-2 text-left">Sl.</th>
                              <th className="px-3 py-2 text-left">Item</th>
                              <th className="px-3 py-2 text-right">Total Qty</th>
                              <th className="px-3 py-2 text-right">Rate</th>
                              <th className="px-3 py-2 text-right">U. Value</th>
                              <th className="px-3 py-2 text-right">Total Value</th>
                              <th className="px-3 py-2 text-right">VAT</th>
                              <th className="px-3 py-2 text-right">Addition</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {items.map((item, idx) => (
                              <tr key={`${item.itemId}-${idx}`} className="hover:bg-slate-700/30">
                                <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-slate-200">{item.itemName || '-'}</div>
                                  {item.hsCode && <div className="text-slate-400 text-xs mt-0.5">[{item.hsCode}]</div>}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-300">{fmt(item.totalQty * currentConvFactor)}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{fmt(item.rate / currentConvFactor)}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{fmt(item.unitValue / currentConvFactor)}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{fmt(item.totalValue)}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{fmt(item.totalValue * item.vatRate / 100)}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{fmt(item.addition)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400">
                  <h4 className="text-lg font-semibold text-slate-300 mb-2">Sales Report</h4>
                  <p>No sales data found for this client and month.</p>
                </div>
              )
            )}

            {/* VAT Report (Final Settlement) */}
            {currentTab === 'vat' && (
              salesReport.length > 0 && !salesReport.some((r: any) => r.isFfs) ? (
                <div className="text-center py-16 text-slate-400">
                  <h4 className="text-xl font-bold text-slate-300 mb-2">Not Applicable</h4>
                  <p>এই মাসের জন্য এই রিপোর্টটি (Final Settlement) প্রযোজ্য নয়।</p>
                </div>
              ) : (
                <div>
                  <div className="text-center mb-4 mt-2">
                    <p className="text-slate-400 text-sm font-bold mb-3">From Jul 2025</p>
                    <button
                      onClick={calculateVat}
                      disabled={isLoadingVat || !selectedClientId || !selectedMonthYear}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                    >
                      {isLoadingVat ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Calculating...</> : '⚡ Calculate'}
                    </button>
                  </div>

                  {isVatCalculated && currentCredential && (
                    <div className="max-w-2xl mx-auto mb-4 mt-6 bg-slate-800/50 border border-slate-700 rounded-lg py-4 px-6 text-center">
                      <div className="font-bold text-emerald-500 mb-4 text-[1.1rem]">eVAT Login Details</div>
                      <div className="flex justify-center gap-8 text-[1.05rem]">
                        <div className="flex items-center gap-3">
                          <strong className="text-slate-400">User ID:</strong>
                          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                            <span className="font-mono font-bold tracking-wide text-blue-400">{currentCredential.loginId}</span>
                            <button onClick={() => handleCopy(currentCredential.loginId)} className={`${copiedText === currentCredential.loginId ? 'text-emerald-500' : 'text-slate-500 hover:text-white'} transition-colors ml-1`} title="Copy User ID">
                              {copiedText === currentCredential.loginId ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <strong className="text-slate-400">Password:</strong>
                          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                            <span className="font-mono font-bold tracking-wide text-slate-200">
                              {visiblePassword ? currentCredential.loginPassword : '••••••••'}
                            </span>
                            <button onClick={() => setVisiblePassword(!visiblePassword)} className="text-slate-500 hover:text-white transition-colors ml-1" title={visiblePassword ? "Hide Password" : "Show Password"}>
                              {visiblePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button onClick={() => handleCopy(currentCredential.loginPassword)} className={`${copiedText === currentCredential.loginPassword ? 'text-emerald-500' : 'text-slate-500 hover:text-white'} transition-colors`} title="Copy Password">
                              {copiedText === currentCredential.loginPassword ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isVatCalculated && (
                    <div className="max-w-2xl mx-auto overflow-x-auto rounded-lg border border-slate-700">
                      <table className="w-full text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="px-4 py-3 text-left w-36">Note</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 8(c)</td><td className="px-4 py-3 text-slate-300">VAT (7.5% / 5%)</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalVatNote8c)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 9(b)</td><td className="px-4 py-3 text-slate-300">Total Sales Value</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalSalesValue)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 23(a)</td><td className="px-4 py-3 text-slate-300">Total Base Value of VAT</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalBaseValueOfVat)}</td></tr>
                        <tr><td className="px-4 py-3 font-bold text-blue-400">Note: 27</td><td className="px-4 py-3 font-bold text-blue-400">Any Other Adjustment</td><td className="px-4 py-3 text-right font-bold text-blue-400">{fmt(note27)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 30</td><td className="px-4 py-3 text-slate-300">Total of AT</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalAT)}</td></tr>
                        <tr><td className="px-4 py-3 font-bold text-yellow-400">Note: 32</td><td className="px-4 py-3 font-bold text-yellow-400">Any Other Adjustment</td><td className="px-4 py-3 text-right font-bold text-yellow-400">{fmt(note32)}</td></tr>
                        <tr className="border-t-2 border-slate-600">
                          <td className="px-4 py-4 font-bold text-emerald-400 text-base">Note: 65</td>
                          <td className="px-4 py-4 font-bold text-emerald-400 text-base">Closing Balance</td>
                          <td className="px-4 py-4 text-right font-bold text-emerald-400 text-base">{fmt(calculatedVat65)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )
            )}

            {/* VAT Report (Regular) */}
            {currentTab === 'vat_regular' && (
              salesReport.length > 0 && salesReport.every((r: any) => r.isFfs) ? (
                <div className="text-center py-16 text-slate-400">
                  <h4 className="text-xl font-bold text-slate-300 mb-2">Not Applicable</h4>
                  <p>এই মাসের জন্য এই রিপোর্টটি (Regular VAT) প্রযোজ্য নয়।</p>
                </div>
              ) : (
                <div>
                  <div className="text-center mb-4 mt-2">
                    <button
                      onClick={calculateVat}
                      disabled={isLoadingVat || !selectedClientId || !selectedMonthYear}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                    >
                      {isLoadingVat ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Calculating...</> : '⚡ Calculate'}
                    </button>
                  </div>

                {isVatCalculated && currentCredential && (
                  <div className="max-w-2xl mx-auto mb-4 mt-6 bg-slate-800/50 border border-slate-700 rounded-lg py-4 px-6 text-center">
                    <div className="font-bold text-emerald-500 mb-4 text-[1.1rem]">eVAT Login Details</div>
                    <div className="flex justify-center gap-8 text-[1.05rem]">
                      <div className="flex items-center gap-3">
                        <strong className="text-slate-400">User ID:</strong>
                        <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                          <span className="font-mono font-bold tracking-wide text-blue-400">{currentCredential.loginId}</span>
                          <button onClick={() => handleCopy(currentCredential.loginId)} className={`${copiedText === currentCredential.loginId ? 'text-emerald-500' : 'text-slate-500 hover:text-white'} transition-colors ml-1`} title="Copy User ID">
                            {copiedText === currentCredential.loginId ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <strong className="text-slate-400">Password:</strong>
                        <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                          <span className="font-mono font-bold tracking-wide text-slate-200">
                            {visiblePassword ? currentCredential.loginPassword : '••••••••'}
                          </span>
                          <button onClick={() => setVisiblePassword(!visiblePassword)} className="text-slate-500 hover:text-white transition-colors ml-1" title={visiblePassword ? "Hide Password" : "Show Password"}>
                            {visiblePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          <button onClick={() => handleCopy(currentCredential.loginPassword)} className={`${copiedText === currentCredential.loginPassword ? 'text-emerald-500' : 'text-slate-500 hover:text-white'} transition-colors`} title="Copy Password">
                            {copiedText === currentCredential.loginPassword ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isVatCalculated && (
                  <div className="max-w-2xl mx-auto overflow-x-auto rounded-lg border border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="px-4 py-3 text-left w-36">Note</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 4(c)</td><td className="px-4 py-3 text-slate-300">Total VAT on Standard Rate (15%)</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalVatNote4c)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 8(c)</td><td className="px-4 py-3 text-slate-300">Total VAT on Truncated Rate (5%, 7.5%)</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalVatNote8c)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 9(c)</td><td className="px-4 py-3 text-slate-300">Total Output VAT (Note 4c + 8c)</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalVatNote9c)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 15(b)</td><td className="px-4 py-3 text-slate-300">Total Input VAT (Rebatable)</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalVatNote15b)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 23(a)</td><td className="px-4 py-3 text-slate-300">Total Base Value of VAT</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalBaseValueOfVat)}</td></tr>
                        <tr><td className="px-4 py-3 font-medium text-slate-300">Note: 30</td><td className="px-4 py-3 text-slate-300">Total of AT</td><td className="px-4 py-3 text-right text-slate-200 font-medium">{fmt(totalAT)}</td></tr>
                        <tr className="border-t-2 border-slate-600">
                          <td className="px-4 py-4 font-bold text-emerald-400 text-base">Note: 34</td>
                          <td className="px-4 py-4 font-bold text-emerald-400 text-base">Closing Balance</td>
                          <td className="px-4 py-4 text-right font-bold text-emerald-400 text-base">{fmt(calculatedVat34)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )
            )}

            {/* Statement Report */}
            {currentTab === 'statement' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-center">Date</th>
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 text-right">Total Price</th>
                      <th className="px-4 py-3 text-right">Vatable Value</th>
                      <th className="px-4 py-3 text-right">VAT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {isLoadingStatement ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading statement...</td></tr>
                    ) : statementReport.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No data available for this month</td></tr>
                    ) : (
                      statementReport.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-center text-slate-300 whitespace-nowrap">
                            {formatDate(row.startDate)} <span className="text-slate-500 mx-1">to</span> {formatDate(row.endDate)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-200">{row.itemName || '-'}</td>
                          <td className="px-4 py-3 text-right text-slate-300 font-medium">{fmt(row.qty * currentConvFactor)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-medium">{fmt(row.salesRate / currentConvFactor)}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{fmt(row.totalSalesValue)}</td>
                          <td className="px-4 py-3 text-right text-slate-300">{fmt(row.vatableValue)}</td>
                          <td className="px-4 py-3 text-right font-bold text-yellow-400">{fmt(row.vat)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change Month Modal */}
      {showChangeMonthModal && (
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
