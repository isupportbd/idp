import React, { useState, useRef, useMemo } from 'react';
import { apiClient } from '../../api/client';

export default function UploadPurchases() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isRebate, setIsRebate] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  
  const [tempData, setTempData] = useState<any[]>([]);
  const [requiresMapping, setRequiresMapping] = useState(false);
  const [missingItems, setMissingItems] = useState<any[]>([]);
  
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [duplicateList, setDuplicateList] = useState<any[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.max(1, Math.ceil(tempData.length / pageSize));
  
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return tempData.slice(start, end);
  }, [tempData, currentPage, pageSize]);

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

  const formatMonthStr = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', '-');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const processFile = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await apiClient.api.upload.$post({
        form: { file: selectedFile }
      });
      
      const data = await response.json() as any;
      if (data.success) {
        setTempData(data.data);
        setCurrentPage(1);
      } else if (data.requiresItemMapping) {
        setRequiresMapping(true);
        setMissingItems(data.missingItems);
      } else {
        setUploadResult({ success: false, message: data.message });
      }
    } catch (error: any) {
      setUploadResult({
        success: false,
        message: error.message || 'An error occurred during processing.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelMapping = () => {
    setRequiresMapping(false);
    setMissingItems([]);
    setUploadResult({ success: false, message: 'Upload cancelled due to missing item mappings.' });
  };

  const saveMissingItems = async () => {
    try {
      setIsSaving(true);
      const response = await apiClient.api.items.bulk.$post({
        json: { items: missingItems }
      });
      
      const data = await response.json() as any;
      if (data.success) {
        setRequiresMapping(false);
        setMissingItems([]);
        await processFile();
      } else {
        setUploadResult({ success: false, message: data.message || 'Failed to save mappings.' });
      }
    } catch (error: any) {
      console.error('Error saving missing items:', error);
      setUploadResult({ success: false, message: 'Failed to save mappings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveToDatabase = async () => {
    if (!tempData || tempData.length === 0) return;

    setIsSaving(true);
    setUploadResult(null);

    try {
      const response = await apiClient.api.upload.save.$post({
        json: {
          data: tempData,
          month: selectedMonth,
          isRebate: isRebate
        }
      });
      
      const data = await response.json() as any;
      if (data.success) {
        setTempData([]);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (data.duplicatesList && data.duplicatesList.length > 0) {
          setDuplicateList(data.duplicatesList);
          setShowCompareModal(true);
          
          if (data.totalRowsProcessed > 0) {
            setUploadResult({ success: true, message: `${data.totalRowsProcessed} new records saved successfully. Please review the duplicates below.` });
          } else {
            setUploadResult(null);
          }
        } else {
          setUploadResult(data);
          setTimeout(() => setUploadResult(null), 1000);
        }
      } else {
        setUploadResult({ success: false, message: data.message || 'Failed to save data to database.' });
        setTimeout(() => setUploadResult(null), 1000);
      }
    } catch (error: any) {
      setUploadResult({
        success: false,
        message: error.response?.data?.message || 'An error occurred during save.'
      });
      setTimeout(() => setUploadResult(null), 1000);
    } finally {
      setIsSaving(false);
    }
  };

  const resetUpload = () => {
    setTempData([]);
    setSelectedFile(null);
    setUploadResult(null);
  };

  return (
    <div className="max-w-6xl mx-auto upload-container">
      <style dangerouslySetInnerHTML={{__html: `
        .colorful-theme {
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
          --bg-surface: #1e293b;
          --bg-surface-hover: #334155;
          --border-color: #475569;
          --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          --accent-light: #334155;
          --bg-header: #0f172a;
          --border-light: #334155;
        }

        .upload-container {
          width: 100%;
        }

        .premium-upload-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
          margin-bottom: 3rem;
          flex-wrap: nowrap;
        }

        .glass-panel {
          display: flex;
          align-items: center;
          background: var(--bg-surface-hover);
          border-radius: 16px;
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--border-color);
          padding: 0.5rem;
          flex: 1;
        }

        .input-group {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1.5rem;
          border-radius: 12px;
          transition: all 0.3s ease;
        }

        .input-group:hover {
          background: var(--accent-light);
        }

        .file-picker {
          cursor: pointer;
          flex: 1;
        }

        .icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 12px;
          box-shadow: inset 0 2px 4px rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.05);
          transition: all 0.3s ease;
          color: white;
        }

        .bg-blue { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
        .bg-purple { background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); }
        .bg-emerald { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }

        .file-picker:hover .icon-wrapper {
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .has-file .icon-wrapper {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        }

        .custom-icon { width: 24px; height: 24px; }
        
        .info-stack { display: flex; flex-direction: column; gap: 0.2rem; }
        .info-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
        .text-blue { color: #60a5fa; }
        .text-emerald { color: #34d399; }
        .text-purple { color: #c084fc; }

        .info-value {
          font-size: 1rem;
          color: var(--text-main);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 250px;
        }

        .divider {
          width: 2px;
          height: 48px;
          background: rgba(150, 150, 150, 0.4);
          margin: 0 1rem;
          border-radius: 2px;
        }

        .stylish-month-input {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 0.25rem 0.5rem;
          background: transparent;
          font-size: 1rem;
          color: var(--text-main);
          font-weight: 600;
          outline: none;
          font-family: inherit;
          cursor: pointer;
          margin: 0;
          color-scheme: dark;
        }

        .colorful-btn {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
          color: white;
          border: none;
          padding: 0 1.5rem;
          height: 48px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(225, 29, 72, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .colorful-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 15px 35px rgba(225, 29, 72, 0.5), inset 0 1px 0 rgba(255,255,255,0.2);
        }

        .colorful-btn:disabled {
          background: rgba(150, 150, 150, 0.25);
          box-shadow: none;
          cursor: not-allowed;
          color: var(--text-muted);
        }

        .btn-primary {
          background: #4CAF50; color: white; border: none; padding: 10px 24px;
          border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 600;
          transition: all 0.3s ease; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(16, 185, 129, 0.3); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-secondary {
          background: #ef4444; color: white; border: none; padding: 10px 24px;
          border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 600;
          transition: all 0.3s ease; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2);
        }
        .btn-secondary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(239, 68, 68, 0.3); }

        table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; background: var(--bg-surface); }
        th, td { border: 1px solid var(--border-light); padding: 8px; text-align: left; font-size: 0.9rem; color: var(--text-main); }
        th { background-color: var(--bg-header); font-weight: 700; }

        .result-box { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 9999; padding: 1rem 1.5rem; border-radius: 8px; font-weight: 500; box-shadow: var(--shadow-md); animation: slideIn 0.3s ease-out; min-width: 300px; }
        .result-box.success { background: #064e3b; color: #34d399; border: 1px solid #059669; }
        .result-box.error { background: #7f1d1d; color: #f87171; border: 1px solid #dc2626; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}} />

      {uploadResult && (
        <div className={`result-box ${uploadResult.success ? 'success' : 'error'} mb-6`}>
          <p>{uploadResult.message}</p>
          {uploadResult.totalRowsProcessed && <p>Total Rows Saved: {uploadResult.totalRowsProcessed}</p>}
        </div>
      )}

      {tempData.length === 0 && (
        <div className="premium-upload-bar colorful-theme">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" hidden />
          
          <div className="glass-panel overflow-x-auto">
            <div className={`input-group file-picker ${selectedFile ? 'has-file' : ''}`} onClick={() => fileInputRef.current?.click()}>
              <div className="icon-wrapper bg-blue shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="custom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
              </div>
              <div className="info-stack">
                <span className="info-label text-blue">Source File</span>
                <span className="info-value">{selectedFile ? selectedFile.name : 'Select Excel/CSV...'}</span>
              </div>
            </div>

            <div className="divider shrink-0"></div>

            <div className="input-group month-picker mx-auto shrink-0">
              <div className="icon-wrapper bg-emerald shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="custom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div className="info-stack">
                <span className="info-label text-emerald">Reporting Month</span>
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="stylish-month-input" style={{ colorScheme: 'dark' }} />
              </div>
            </div>
            
            <div className="divider shrink-0"></div>

            <div className="input-group rebate-group shrink-0 mr-4 cursor-pointer transition-all duration-300" 
                 style={{ opacity: (!selectedFile || !selectedMonth) ? '0.5' : '1', pointerEvents: (!selectedFile || !selectedMonth) ? 'none' : 'auto' }}
                 onClick={() => setIsRebate(!isRebate)}>
              <div className="icon-wrapper bg-purple shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="custom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="rebateCheck" checked={isRebate} onChange={() => {}} onClick={e => e.stopPropagation()} 
                       disabled={!selectedFile || !selectedMonth}
                       className="w-5 h-5 cursor-pointer accent-purple-500" />
                <label htmlFor="rebateCheck" className="text-white font-bold text-base cursor-pointer mb-0">Rebate</label>
              </div>
            </div>

            <button disabled={!selectedFile || !selectedMonth || isProcessing} onClick={processFile} className="colorful-btn shrink-0">
              <span className="btn-text">{isProcessing ? 'Processing...' : 'Add to Temp List'}</span>
            </button>
          </div>
        </div>
      )}

      {tempData.length > 0 && (
        <div className="colorful-theme mt-4">
          <div className="flex justify-between items-center mb-4 text-slate-200">
            <h3 className="text-xl font-semibold">Temp Data Preview ({tempData.length} rows)</h3>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <label>Rows per page:</label>
              <select value={pageSize} onChange={e => {setPageSize(Number(e.target.value)); setCurrentPage(1);}} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          
          <div className="overflow-x-auto border border-slate-700 rounded-lg mb-4">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Office</th>
                  <th className="whitespace-nowrap">Month</th>
                  <th className="whitespace-nowrap">BE No</th>
                  <th className="whitespace-nowrap">Date</th>
                  <th className="whitespace-nowrap">HS Code</th>
                  <th className="whitespace-nowrap">Item Name</th>
                  <th className="whitespace-nowrap">Net Wt</th>
                  <th className="whitespace-nowrap">Excess Qty</th>
                  <th className="whitespace-nowrap">Value</th>
                  <th className="whitespace-nowrap">CD</th>
                  <th className="whitespace-nowrap">RD</th>
                  <th className="whitespace-nowrap">SD</th>
                  <th className="whitespace-nowrap">VAT</th>
                  <th className="whitespace-nowrap">AT</th>
                  <th className="whitespace-nowrap">LC Number</th>
                  <th className="whitespace-nowrap">BIN</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row) => (
                  <tr key={row.tempId} className="hover:bg-slate-800/50">
                    <td className="whitespace-nowrap">{row.office}</td>
                    <td className="whitespace-nowrap">{formatMonthStr(selectedMonth)}</td>
                    <td className="whitespace-nowrap">{row.beNo}</td>
                    <td className="whitespace-nowrap">{formatDate(row.beDate)}</td>
                    <td className="whitespace-nowrap">{row.hsCode}</td>
                    <td className="whitespace-nowrap">{row.itemName}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.netWt)}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.excessQty)}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.assValue)}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.cd)}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.rd)}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.sd)}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.vat)}</td>
                    <td className="whitespace-nowrap">{formatNumber(row.at)}</td>
                    <td className="whitespace-nowrap">{row.lcNumber}</td>
                    <td className="whitespace-nowrap">{row.bin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end items-center gap-4 my-6">
            <button onClick={() => setCurrentPage(c => c - 1)} disabled={currentPage === 1} className="px-3 py-1.5 border border-slate-600 rounded bg-slate-800 text-slate-200 disabled:opacity-50">Previous</button>
            <span className="text-slate-400 text-sm">Page {currentPage} of {totalPages}</span>
            <button onClick={() => setCurrentPage(c => c + 1)} disabled={currentPage === totalPages} className="px-3 py-1.5 border border-slate-600 rounded bg-slate-800 text-slate-200 disabled:opacity-50">Next</button>
          </div>

          <div className="flex justify-end gap-4">
            <button onClick={resetUpload} className="btn-secondary" disabled={isSaving}>Cancel</button>
            <button onClick={saveToDatabase} className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Add to Database'}
            </button>
          </div>
        </div>
      )}

      {/* Missing Items Modal */}
      {requiresMapping && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Missing Item Mappings</h3>
            <p className="text-slate-400 mb-6">The following HS Codes were found in the uploaded file but are not mapped in the database. Please provide the formatted HS Code and Item Name.</p>
            
            <div className="space-y-4 mb-6">
              {missingItems.map((item, index) => (
                <div key={index} className="flex gap-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-1">HS Code</label>
                    <input type="text" value={item.hsCode} onChange={e => {
                      const newItems = [...missingItems];
                      newItems[index].hsCode = e.target.value;
                      setMissingItems(newItems);
                    }} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white" placeholder="e.g. 2701.19.00" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-slate-400 mb-1">Item Name</label>
                    <input type="text" value={item.name} onChange={e => {
                      const newItems = [...missingItems];
                      newItems[index].name = e.target.value;
                      setMissingItems(newItems);
                    }} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white" placeholder="Item Name" />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={cancelMapping} className="btn-secondary">Cancel</button>
              <button onClick={saveMissingItems} className="btn-primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Duplicate Records Found ({duplicateList.length})</h3>
              <button onClick={() => setShowCompareModal(false)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors">Close</button>
            </div>
            <p className="text-slate-400 mb-6 shrink-0">The following records already exist in the database. Please choose to replace them with the new uploaded data or ignore them.</p>
            
            <div className="overflow-y-auto flex-1 space-y-6 pr-2">
              {duplicateList.map((item, index) => (
                <div key={index} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
                    <h4 className="font-semibold text-white">Record {index + 1}</h4>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const newList = [...duplicateList];
                        newList.splice(index, 1);
                        setDuplicateList(newList);
                        if(newList.length === 0) {
                          setShowCompareModal(false);
                          setTempData([]);
                        }
                      }} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors">Ignore</button>
                      <button onClick={async () => {
                        try {
                          setIsSaving(true);
                          const response = await apiClient.api.upload.replace.$post({
                            json: { itemsToReplace: [item] }
                          });
                          const data = await response.json() as any;
                          if(data.success) {
                            const newList = [...duplicateList];
                            newList.splice(index, 1);
                            setDuplicateList(newList);
                            if(newList.length === 0) {
                              setShowCompareModal(false);
                              setTempData([]);
                            }
                          }
                        } finally {
                          setIsSaving(false);
                        }
                      }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors" disabled={isSaving}>Replace</button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-sm font-semibold text-slate-400 mb-2">Existing Data</h5>
                      <table className="w-full text-sm text-slate-300">
                        <tbody>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">Office</th><td>{item.existing.office}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">BE No</th><td>{item.existing.beNo}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">BE Date</th><td>{formatDate(item.existing.beDate)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">Total Qty</th><td>{formatNumber(item.existing.totalQty)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">Base Value of VAT</th><td>{formatNumber(item.existing.baseValueOfVat)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">VAT</th><td>{formatNumber(item.existing.vat)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">AT</th><td>{formatNumber(item.existing.at)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <h5 className="text-sm font-semibold text-blue-400 mb-2">Uploaded Data</h5>
                      <table className="w-full text-sm text-slate-300">
                        <tbody>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">Office</th><td className={item.existing.office !== item.newData.office ? 'text-amber-400 font-bold' : ''}>{item.newData.office}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">BE No</th><td className={item.existing.beNo !== item.newData.beNo ? 'text-amber-400 font-bold' : ''}>{item.newData.beNo}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">BE Date</th><td className={formatDate(item.existing.beDate) !== formatDate(item.newData.beDate) ? 'text-amber-400 font-bold' : ''}>{formatDate(item.newData.beDate)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">Total Qty</th><td className={formatNumber(item.existing.totalQty) !== formatNumber(item.newData.totalQty) ? 'text-amber-400 font-bold' : ''}>{formatNumber(item.newData.totalQty)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">Base Value of VAT</th><td className={formatNumber(item.existing.baseValueOfVat) !== formatNumber(item.newData.baseValueOfVat) ? 'text-amber-400 font-bold' : ''}>{formatNumber(item.newData.baseValueOfVat)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">VAT</th><td className={formatNumber(item.existing.vat) !== formatNumber(item.newData.vat) ? 'text-amber-400 font-bold' : ''}>{formatNumber(item.newData.vat)}</td></tr>
                          <tr><th className="text-left py-1 pr-4 text-slate-500 font-medium">AT</th><td className={formatNumber(item.existing.at) !== formatNumber(item.newData.at) ? 'text-amber-400 font-bold' : ''}>{formatNumber(item.newData.at)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
