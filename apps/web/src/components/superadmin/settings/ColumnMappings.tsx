import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { Save, AlertCircle } from 'lucide-react';

interface MappingRow {
  dbColumn: string;
  excelHeader: string;
}

const dbColumnsList = [
  { value: 'office', label: 'office' },
  { value: 'beNo', label: 'be_no' },
  { value: 'beDate', label: 'be_date' },
  { value: 'hsCode', label: 'hs_code' },
  { value: 'itemName', label: 'item_name' },
  { value: 'lcNumber', label: 'lc_number' },
  { value: 'netWt', label: 'net_wt' },
  { value: 'excessQty', label: 'excess_qty' },
  { value: 'totalQty', label: 'total_qty' },
  { value: 'assValue', label: 'ass_value' },
  { value: 'cd', label: 'cd' },
  { value: 'rd', label: 'rd' },
  { value: 'sd', label: 'sd' },
  { value: 'baseValueOfVat', label: 'base_value_of_vat' },
  { value: 'vat', label: 'vat' },
  { value: 'unitValue', label: 'unit_value' },
  { value: 'at', label: 'at' },
  { value: 'bin', label: 'bin' },
  { value: 'clientName', label: 'client_name' },
];

export default function ColumnMappings() {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mappings'],
    queryFn: async () => {
      const res = await (apiClient as any).api.superadmin.mappings.$get();
      return res.json();
    }
  });

  useEffect(() => {
    if (data?.data) {
      const dbData: MappingRow[] = data.data;
      const mappedRows: MappingRow[] = dbColumnsList.map(col => {
        const found = dbData.find(d => d.dbColumn === col.value);
        return {
          dbColumn: col.value,
          excelHeader: found ? found.excelHeader : ''
        };
      });
      setRows(mappedRows);
    } else if (!isLoading) {
      // Initialize empty rows if no data
      setRows(dbColumnsList.map(col => ({ dbColumn: col.value, excelHeader: '' })));
    }
  }, [data, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async (mappings: MappingRow[]) => {
      // Filter out empty rows
      const validMappings = mappings.filter(r => r.excelHeader.trim() !== '' && r.dbColumn !== '');
      const res = await (apiClient as any).api.superadmin.mappings.$post({ json: { mappings: validMappings } });
      if (!res.ok) throw new Error('Failed to save mappings');
      return res.json();
    },
    onSuccess: () => {
      setMessage({ text: 'Mappings saved successfully!', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['mappings'] });
      setTimeout(() => setMessage(null), 1500);
    },
    onError: () => {
      setMessage({ text: 'Failed to save mappings.', type: 'error' });
      setTimeout(() => setMessage(null), 1500);
    }
  });

  const handleInputChange = (index: number, value: string) => {
    const newRows = [...rows];
    newRows[index].excelHeader = value;
    setRows(newRows);
  };

  const handleSave = () => {
    saveMutation.mutate(rows);
  };

  if (isLoading) {
    return <div className="text-slate-400 p-8 text-center">Loading mappings...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-medium text-slate-100">Column Mappings</h3>
          <p className="text-sm text-slate-400 mt-1">Map database fields to exact Excel/CSV headers for uploads.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-300 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          <span>{saveMutation.isPending ? 'Saving...' : 'Save Mappings'}</span>
        </button>
      </div>

      {message && createPortal(
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[150] px-6 py-4 rounded-xl shadow-2xl flex items-center space-x-3 animate-in zoom-in-95 fade-in duration-200 ${message.type === 'success' ? 'bg-green-600/90 backdrop-blur-md text-white border border-green-500/50' : 'bg-red-600/90 backdrop-blur-md text-white border border-red-500/50'}`}>
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">{message.text}</span>
        </div>,
        document.body
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 border-b border-slate-700 text-slate-300">
            <tr>
              <th className="px-4 py-2.5 font-medium w-1/3">Database Field</th>
              <th className="px-4 py-2.5 font-medium">Excel/CSV Header</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row, index) => {
              const label = dbColumnsList.find(c => c.value === row.dbColumn)?.label || row.dbColumn;
              const isCalculated = ['totalQty', 'baseValueOfVat', 'unitValue'].includes(row.dbColumn);
              const isFromDb = row.dbColumn === 'itemName';
              const isRegexExtracted = row.dbColumn === 'excessQty';
              const isDisabled = isCalculated || isFromDb;
              
              return (
                <tr key={row.dbColumn} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-300">
                    {label}
                    {isCalculated && <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Auto-calculated</span>}
                    {isFromDb && <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">From DB</span>}
                    {isRegexExtracted && <span className="ml-2 text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Smart Extraction</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      className={`w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${isDisabled ? 'opacity-50 cursor-not-allowed bg-slate-900' : ''}`}
                      placeholder={isCalculated ? "Calculated by system automatically" : isFromDb ? "Fetched from Items Database" : "Type exact header (e.g. B/E No.)"}
                      value={isDisabled ? "" : row.excelHeader}
                      onChange={(e) => handleInputChange(index, e.target.value)}
                      disabled={isDisabled}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
