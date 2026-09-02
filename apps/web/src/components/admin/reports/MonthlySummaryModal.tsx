import { useState } from 'react';
import { Loader2, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatMonth } from './types';

interface MonthlySummaryModalProps {
  onClose: () => void;
}

export default function MonthlySummaryModal({ onClose }: MonthlySummaryModalProps) {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDownload = async () => {
    if (!selectedMonth) return;
    setIsDownloading(true);
    setErrorMsg('');

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${baseUrl}/api/reports/monthly-summary?month=${selectedMonth}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch monthly summary');
      }

      const summaryData = data.data as any[];

      if (summaryData.length === 0) {
        throw new Error('No purchase data found for the selected month.');
      }

      // Prepare Excel data
      const excelData = summaryData.map(row => ({
        'Client Name': row.clientName,
        'BIN': row.clientBin || 'N/A',
        'Total Purchased (Metric Tons)': row.totalNetWt
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Auto-size columns
      const wscols = [
        { wch: 40 }, // Client Name
        { wch: 20 }, // BIN
        { wch: 30 }  // Total Purchased
      ];
      ws['!cols'] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, "Monthly Summary");
      
      // Download file
      XLSX.writeFile(wb, `Monthly_Client_Summary_${formatMonth(selectedMonth)}.xlsx`);
      
      onClose(); // Close modal on success
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while downloading.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/50">
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            Monthly Summary
          </h3>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-400 leading-relaxed">
            Select a month to download an Excel report showing the total purchases (in Metric Tons) across all clients.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={!selectedMonth || isDownloading}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {isDownloading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Generating Excel...</>
            ) : (
              'Download Excel'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
