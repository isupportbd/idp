import { useMemo, useCallback } from 'react';
import { Edit2 } from 'lucide-react';
import { type Purchase, fmt, formatDate } from './types';

interface PurchaseReportProps {
  purchases: Purchase[];
  clientSalesRates: any[];
  selectedMonthYear: string;
  currentConvFactor: number;
  openChangeMonthModal: (p: Purchase) => void;
}

export default function PurchaseReport({
  purchases,
  clientSalesRates,
  selectedMonthYear,
  currentConvFactor,
  openChangeMonthModal
}: PurchaseReportProps) {
  
  // Derived purchase groups
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

  const getPurchaseSummary = useCallback((list: Purchase[]) => {
    const groups: Record<string, any> = {};

    const sortedRates = [...clientSalesRates].sort((a, b) => new Date(b.activationDate).getTime() - new Date(a.activationDate).getTime());

    let reportMonthEnd = new Date();
    if (selectedMonthYear) {
      const [yearStr, monthStr] = selectedMonthYear.split('-');
      reportMonthEnd = new Date(parseInt(yearStr), parseInt(monthStr), 0);
    }

    list.forEach(p => {
      const pDate = new Date(p.beDate);

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

  const renderPurchaseSummary = (title: string, list: Purchase[]) => {
    if (list.length === 0) return null;
    const summary = getPurchaseSummary(list);
    return (
      <div className="mb-8">
        <h4 className="text-lg font-bold text-emerald-400 mb-3 text-center">Purchase Summary: ({title})</h4>
        <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-lg border border-slate-700 mb-4">
          <table className="w-full text-sm whitespace-nowrap">
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
      </div>
    );
  };

  const renderPurchaseDetails = (title: string, list: Purchase[]) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-8">
        <h4 className="text-lg font-bold text-blue-400 mb-3 text-center">Purchase Details: ({title})</h4>
        <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-lg border border-slate-700">
          <table className="w-full text-sm whitespace-nowrap">
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
    <div>
      {/* Summaries first */}
      {renderPurchaseSummary('Note: 13', vatNote13)}
      {renderPurchaseSummary('Note: 15', vatNote15)}
      {renderPurchaseSummary('Note: 22', vatNote22)}
      
      {/* Details next */}
      {renderPurchaseDetails('Note: 13', vatNote13)}
      {renderPurchaseDetails('Note: 15', vatNote15)}
      {renderPurchaseDetails('Note: 22', vatNote22)}
      
      {purchases.length === 0 && (
        <div className="text-center text-slate-400 py-10 bg-slate-800/30 rounded-xl border border-slate-700">
          No purchase data found.
        </div>
      )}
    </div>
  );
}
