import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileText, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function GlobalReports() {
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [conversionFactor, setConversionFactor] = useState<number>(1);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [adminSearchText, setAdminSearchText] = useState('');
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);

  // Fetch all admins
  const { data: tenantsData } = useQuery({
    queryKey: ['superadmin-tenants-list'],
    queryFn: async () => {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/superadmin/tenants`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    }
  });

  // Fetch unit conversions
  const { data: unitsData } = useQuery({
    queryKey: ['superadmin-unit-conversions'],
    queryFn: async () => {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/superadmin/unit-conversions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    }
  });

  // Fetch available months
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

  // Fetch report data based on selected admin and month
  const { data: reportData, isLoading } = useQuery({
    queryKey: ['superadmin-global-reports', selectedAdminId, selectedMonth],
    queryFn: async () => {
      if (!selectedAdminId || !selectedMonth) return { data: [] };
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/superadmin/global-reports?adminId=${selectedAdminId}&month=${selectedMonth}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    },
    enabled: !!selectedAdminId && !!selectedMonth
  });

  const formatMonth = (monthString: string) => {
    try {
      const [year, month] = monthString.split('-');
      return format(new Date(parseInt(year), parseInt(month) - 1), 'MMM yyyy');
    } catch (e) {
      return monthString;
    }
  };

  const downloadExcel = () => {
    if (!reportData?.data || reportData.data.length === 0) return;
    
    const exportData = reportData.data.map((item: any) => ({
      'Serial': item.sl,
      'Client Name': item.clientName || 'Unknown',
      'BIN': item.clientBin || 'N/A',
      'Total Quantity': Number(((item.totalQty || 0) * (conversionFactor || 1)).toFixed(2)),
      'Month': formatMonth(selectedMonth)
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Add column widths
    ws['!cols'] = [
      { wch: 8 },  // Serial
      { wch: 45 }, // Client Name
      { wch: 20 }, // BIN
      { wch: 20 }, // Total Quantity
      { wch: 15 }  // Month
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Global Report');
    XLSX.writeFile(wb, `Global_Report_${selectedMonth}.xlsx`);
  };

  const tenants = tenantsData?.data || [];
  const months = monthsData?.data || [];
  const reports = reportData?.data || [];
  const unitConversions = unitsData?.data || [];

  const filteredAdmins = tenants.filter((t: any) => {
    if (adminSearchText.length === 0) return true;
    const search = adminSearchText.toLowerCase();
    return (
      (t.name?.toLowerCase() || '').includes(search) || 
      (t.email?.toLowerCase() || '').includes(search) ||
      (t.mobile?.toLowerCase() || '').includes(search)
    );
  }).slice(0, 50);

  const clearAdmin = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setAdminSearchText('');
    setSelectedAdminId('');
    setShowAdminDropdown(false);
  };

  const selectAdmin = (admin: any) => {
    setSelectedAdminId(admin.id.toString());
    setAdminSearchText(`${admin.name} (${admin.email})`);
    setShowAdminDropdown(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-400" />
            Global Reports
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Generate summary reports for specific tenants and months
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-xs">
            <input
              type="text" 
              value={adminSearchText}
              onChange={e => { 
                setAdminSearchText(e.target.value); 
                setSelectedAdminId(''); 
                if (e.target.value.length > 0) setShowAdminDropdown(true); 
                else setShowAdminDropdown(false);
              }}
              onFocus={() => { if (adminSearchText.length > 0) setShowAdminDropdown(true); }}
              onBlur={() => setTimeout(() => setShowAdminDropdown(false), 200)}
              placeholder="Search Admin..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-8"
            />
            {adminSearchText && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs" onMouseDown={clearAdmin}>✕</button>
            )}
            {!adminSearchText && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">▼</span>
            )}
            {showAdminDropdown && (
              <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
                {filteredAdmins.length > 0 ? filteredAdmins.map((t: any) => (
                  <div key={t.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0" onMouseDown={() => selectAdmin(t)}>
                    <div className="font-medium text-slate-200 text-sm">{t.name}</div>
                    <div className="text-xs text-slate-400">{t.email}</div>
                  </div>
                )) : <div className="px-4 py-3 text-slate-400 text-sm italic">No admins found</div>}
              </div>
            )}
          </div>
          
          <div className="relative w-44">
            <input
              type="text" readOnly 
              value={selectedMonth ? formatMonth(selectedMonth) : ''}
              onMouseDown={() => selectedAdminId && setShowMonthDropdown(v => !v)}
              onBlur={() => setTimeout(() => setShowMonthDropdown(false), 200)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed pr-8"
              placeholder={selectedAdminId ? "Select Month..." : "Select Admin first"}
              disabled={!selectedAdminId}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">▼</span>
            {showMonthDropdown && (
              <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
                {months.length > 0 ? months.map((m: string) => (
                  <div key={m} className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 border-b border-slate-700/50 last:border-0" onMouseDown={() => { setSelectedMonth(m); setShowMonthDropdown(false); }}>
                    {formatMonth(m)}
                  </div>
                )) : <div className="px-4 py-3 text-slate-400 text-sm italic">No months available</div>}
              </div>
            )}
          </div>

          <div className="relative w-44">
            <input
              type="text" readOnly 
              value={conversionFactor === 1 ? 'Unit' : (unitConversions.find((u:any) => u.factor === conversionFactor) ? `${unitConversions.find((u:any) => u.factor === conversionFactor).purchaseUnit} ➔ ${unitConversions.find((u:any) => u.factor === conversionFactor).salesUnit}` : 'Unit')}
              onMouseDown={() => setShowUnitDropdown(v => !v)}
              onBlur={() => setTimeout(() => setShowUnitDropdown(false), 200)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer pr-8"
              placeholder="Unit"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">▼</span>
            {showUnitDropdown && (
              <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto z-50">
                <div className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 border-b border-slate-700/50" onMouseDown={() => { setConversionFactor(1); setShowUnitDropdown(false); }}>Unit</div>
                {unitConversions.map((u:any) => (
                  <div key={u.id} className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 border-b border-slate-700/50 last:border-0" onMouseDown={() => { setConversionFactor(u.factor); setShowUnitDropdown(false); }}>
                    {u.purchaseUnit} ➔ {u.salesUnit}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={downloadExcel}
            disabled={reports.length === 0}
            title="Download Excel"
            className="flex items-center justify-center p-2.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-colors border border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>



      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700 text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium w-[10%]">Serial</th>
                <th className="px-6 py-4 font-medium w-[35%]">Client</th>
                <th className="px-6 py-4 font-medium w-[20%]">BIN</th>
                <th className="px-6 py-4 font-medium text-right w-[20%]">Total Qty</th>
                <th className="px-6 py-4 font-medium text-right w-[15%]">Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {!selectedAdminId || !selectedMonth ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                      <FileText className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-slate-300 font-medium text-base">Select an Admin and Month</p>
                    <p className="text-slate-500 mt-1">Please use the filters above to generate the report.</p>
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-slate-400">Loading report data...</p>
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-slate-400 text-lg">No data found for the selected criteria.</p>
                  </td>
                </tr>
              ) : (
                reports.map((item: any) => (
                  <tr key={item.clientId} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-400">{item.sl}</td>
                    <td className="px-6 py-4 font-medium text-slate-200">{item.clientName || 'Unknown'}</td>
                    <td className="px-6 py-4 text-slate-400">{item.clientBin || '-'}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-200">
                      {((item.totalQty || 0) * (conversionFactor || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-400">{formatMonth(selectedMonth)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
