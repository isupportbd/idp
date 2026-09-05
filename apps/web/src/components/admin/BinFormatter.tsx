import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Copy, CheckCircle, Database, FileText, ArrowRight } from 'lucide-react';

export default function BinFormatter() {
  const [mode, setMode] = useState<'db' | 'manual'>('db');
  const [manualInput, setManualInput] = useState('');
  const [startIndex, setStartIndex] = useState(1);
  const [batchSize, setBatchSize] = useState(10);
  const [copied, setCopied] = useState(false);

  // Fetch clients from DB
  const { data, isLoading, error } = useQuery({
    queryKey: ['all-clients-bins'],
    queryFn: async () => {
      const res = await (apiClient as any).api.clients.$get({
        query: { limit: '5000' } // Fetch a large number to ensure we get all BINs
      });
      const json = await res.json();
      return json.data || [];
    },
    enabled: mode === 'db'
  });

  // Extract all BINs based on selected mode
  const allBins = useMemo(() => {
    if (mode === 'db') {
      if (!data) return [];
      return data.map((client: any) => client.bin).filter(Boolean);
    } else {
      // Split manual input by newlines, commas, or semicolons
      return manualInput
        .split(/[\n,;]+/)
        .map(b => b.trim())
        .filter(b => b.length > 0);
    }
  }, [mode, data, manualInput]);

  // Compute the final formatted string
  const formattedOutput = useMemo(() => {
    if (allBins.length === 0) return '';
    // Arrays are 0-indexed, but user input is 1-indexed
    const start = Math.max(0, startIndex - 1);
    const end = start + batchSize;
    const selectedBins = allBins.slice(start, end);
    return selectedBins.join(';');
  }, [allBins, startIndex, batchSize]);

  const handleCopy = () => {
    if (!formattedOutput) return;
    navigator.clipboard.writeText(formattedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
        <h2 className="text-2xl font-bold text-slate-100 mb-2">BIN Formatter</h2>
        <p className="text-slate-400">Extract and format BIN numbers easily for copying.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Input Settings */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-6">
          
          {/* Mode Selector */}
          <div className="flex bg-slate-900 rounded-xl p-1">
            <button
              onClick={() => setMode('db')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'db' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database size={16} />
              <span>Database</span>
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'manual' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText size={16} />
              <span>Manual Paste</span>
            </button>
          </div>

          {/* Mode specific content */}
          {mode === 'db' ? (
            <div className="p-4 bg-blue-900/20 border border-blue-500/20 rounded-xl">
              <h3 className="text-slate-200 font-medium mb-1">Database Mode</h3>
              {isLoading ? (
                <p className="text-blue-400 text-sm animate-pulse">Loading clients...</p>
              ) : error ? (
                <p className="text-red-400 text-sm">Failed to load clients.</p>
              ) : (
                <p className="text-slate-400 text-sm">
                  Successfully loaded <span className="text-blue-400 font-bold">{allBins.length}</span> BINs from the database.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Paste BINs here</label>
              <textarea
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Enter BINs separated by newline, comma, or semicolon..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500 min-h-[120px]"
              />
              <p className="text-xs text-slate-500 mt-2">
                Found {allBins.length} valid BINs from input.
              </p>
            </div>
          )}

          {/* Range Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-4">Select Range (1-indexed)</label>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <span className="text-xs text-slate-500 block mb-1">Start No.</span>
                <input
                  type="number"
                  min={1}
                  value={startIndex}
                  onChange={(e) => setStartIndex(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <ArrowRight className="text-slate-600 mt-5" />
              <div className="flex-1">
                <span className="text-xs text-slate-500 block mb-1">Batch Size</span>
                <input
                  type="number"
                  min={1}
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Will generate BINs from index {startIndex} to {startIndex + batchSize - 1}
            </p>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-slate-200">Formatted Output</h3>
            <span className="text-xs font-medium bg-slate-900 text-slate-400 px-3 py-1 rounded-full border border-slate-700">
              {formattedOutput ? formattedOutput.split(';').length : 0} Items Selected
            </span>
          </div>
          
          <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 p-4 relative overflow-hidden group">
            <textarea
              readOnly
              value={formattedOutput}
              placeholder="Output will appear here..."
              className="w-full h-full min-h-[200px] bg-transparent text-slate-300 focus:outline-none resize-none font-mono text-sm"
            />
            
            {formattedOutput && (
              <div className="absolute bottom-4 right-4">
                <button
                  onClick={handleCopy}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all shadow-lg ${
                    copied 
                      ? 'bg-emerald-500 text-white shadow-emerald-500/25' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25'
                  }`}
                >
                  {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
