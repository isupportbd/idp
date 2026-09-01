import { fmt, formatDate } from './types';

interface StatementReportProps {
  statementReport: any[];
  currentConvFactor: number;
}

export default function StatementReport({ statementReport, currentConvFactor }: StatementReportProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-base">
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
          {statementReport.length === 0 ? (
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
  );
}
