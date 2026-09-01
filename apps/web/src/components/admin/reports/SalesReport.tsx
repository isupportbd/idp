import { useMemo } from 'react';
import { type SalesReportItem, fmt } from './types';

interface SalesReportProps {
  salesReport: SalesReportItem[];
  currentConvFactor: number;
  hasMissingRates: boolean;
}

export default function SalesReport({ salesReport, currentConvFactor, hasMissingRates }: SalesReportProps) {
  
  const groupedSales = useMemo(() => {
    const g: Record<string, SalesReportItem[]> = {};
    salesReport.forEach(item => {
      if (!g[item.note]) g[item.note] = [];
      g[item.note].push(item);
    });
    return g;
  }, [salesReport]);

  return (
    <div>
      {hasMissingRates && (
        <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
          <strong>⚠️ Warning:</strong> Some items do not have an active Sales Rate configured. Their calculations show as 0. Please go to <b>Sales Rates</b> to configure them.
        </div>
      )}

      {Object.entries(groupedSales).map(([noteName, items]) => (
        <div key={noteName} className="mb-6">
          <h4 className="text-lg font-bold text-emerald-400 mb-3 text-center">Sales Summary: (Note: {noteName})</h4>
          <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-lg border border-slate-700">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 uppercase tracking-wide">
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
                    <td className="px-3 py-2 text-right text-slate-300">{fmt(Number(item.totalValue) * Number(item.vatRate) / 100)}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{fmt(item.addition)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {salesReport.length === 0 && (
        <div className="text-center text-slate-400 py-10 bg-slate-800/30 rounded-xl border border-slate-700">
          No sales data found.
        </div>
      )}
    </div>
  );
}
