import { useMemo, useState, useEffect } from 'react';
import { KeyRound, CheckCircle2, Copy, FileText, Loader2 } from 'lucide-react';
import { type Purchase, type SalesReportItem, fmt } from './types';

interface ReturnReportProps {
  purchases: Purchase[];
  salesReport: SalesReportItem[];
  eVatCredentials: { loginId: string; loginPassword?: string } | null;
  copiedField: 'username' | 'password' | null;
  handleCopyCredential: (text: string, field: 'username' | 'password') => void;
  clientId?: string | number;
  month?: string;
}

export default function ReturnReport({
  purchases,
  salesReport,
  eVatCredentials,
  copiedField,
  handleCopyCredential,
  clientId,
  month
}: ReturnReportProps) {
  
  const [hideEmptyNotes, setHideEmptyNotes] = useState(true);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [isLoadingSubmissionId, setIsLoadingSubmissionId] = useState(false);

  useEffect(() => {
    if (!clientId || !month) {
      setSubmissionId(null);
      return;
    }
    
    const fetchSubmissionId = async () => {
      setIsLoadingSubmissionId(true);
      try {
        const baseUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${baseUrl}/api/submissions/submission?clientId=${clientId}&month=${month}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json() as any;
          setSubmissionId(data.data);
        } else {
          setSubmissionId(null);
        }
      } catch (err) {
        console.error(err);
        setSubmissionId(null);
      } finally {
        setIsLoadingSubmissionId(false);
      }
    };
    
    fetchSubmissionId();
  }, [clientId, month]);

  const showRow = (v1: number, v2 = 0, v3 = 0) => {
    if (!hideEmptyNotes) return true;
    return Math.abs(v1) > 0.001 || Math.abs(v2) > 0.001 || Math.abs(v3) > 0.001;
  };

  // Note 3: Exempted Sales
  const returnNote3Value = useMemo(() => {
    return salesReport
      .filter(item => String(item.note) === '3')
      .reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
  }, [salesReport]);

  // Note 4: Standard Rated Sales
  const returnNote4 = useMemo(() => {
    let value = 0;
    let vat = 0;
    salesReport
      .filter(item => String(item.note) === '4')
      .forEach(item => {
        const itemValue = Number(item.totalValue) || 0;
        value += itemValue;
        vat += itemValue * (Number(item.vatRate) / 100);
      });
    return { value, sd: 0, vat };
  }, [salesReport]);

  // Note 8: Retail/Wholesale/Trade Based Supply
  const returnNote8 = useMemo(() => {
    let value = 0;
    let vat = 0;
    salesReport
      .filter(item => String(item.note) === '8')
      .forEach(item => {
        const itemValue = Number(item.totalValue) || 0;
        value += itemValue;
        vat += itemValue * (Number(item.vatRate) / 100);
      });
    return { value, sd: 0, vat };
  }, [salesReport]);

  // Note 9: Total Sales Value & Total Payable Taxes
  const returnNote9 = useMemo(() => {
    return {
      value: returnNote3Value + returnNote4.value + returnNote8.value,
      sd: returnNote4.sd + returnNote8.sd,
      vat: returnNote4.vat + returnNote8.vat
    };
  }, [returnNote3Value, returnNote4, returnNote8]);

  // Note 13: Purchase where VAT is 0
  const returnNote13Value = useMemo(() => {
    return purchases
      .filter(p => !p.vat || parseFloat(p.vat.toString()) === 0)
      .reduce((sum, p) => sum + (Number(p.baseValueOfVat) || 0), 0);
  }, [purchases]);

  // Note 15: Purchase where VAT > 0 and Rebate taken
  const returnNote15 = useMemo(() => {
    let value = 0;
    let vat = 0;
    purchases
      .filter(p => {
        const rawRebate: any = p.isRebate;
        const isRebate = rawRebate === true || rawRebate === 1 || String(rawRebate).toLowerCase() === 'true' || String(rawRebate) === '1';
        return p.vat && parseFloat(p.vat.toString()) > 0 && isRebate;
      })
      .forEach(p => {
        value += Number(p.baseValueOfVat) || 0;
        vat += Number(p.vat) || 0;
      });
    return { value, vat };
  }, [purchases]);

  // Note 22: Purchase where VAT > 0 and NO Rebate taken
  const returnNote22 = useMemo(() => {
    let value = 0;
    let vat = 0;
    purchases
      .filter(p => {
        const rawRebate: any = p.isRebate;
        const isRebate = rawRebate === true || rawRebate === 1 || String(rawRebate).toLowerCase() === 'true' || String(rawRebate) === '1';
        return p.vat && parseFloat(p.vat.toString()) > 0 && !isRebate;
      })
      .forEach(p => {
        value += Number(p.baseValueOfVat) || 0;
        vat += Number(p.vat) || 0;
      });
    return { value, vat };
  }, [purchases]);

  // Note 23: Total Input Tax Credit
  const returnNote23 = useMemo(() => {
    return {
      value: returnNote13Value + returnNote15.value + returnNote22.value,
      vat: returnNote15.vat
    };
  }, [returnNote13Value, returnNote15, returnNote22]);

  // Note 27: FFS AT (Advance Tax) mapped to VAT column
  const returnNote27VAT = useMemo(() => {
    return purchases
      .filter(p => {
        const rawFfs: any = p.isFfs;
        return rawFfs === true || rawFfs === 1 || String(rawFfs).toLowerCase() === 'true' || String(rawFfs) === '1';
      })
      .reduce((sum, p) => sum + (Number(p.at) || 0), 0);
  }, [purchases]);

  // Note 32: Sales VAT for items that had FFS at purchase
  const returnNote32VAT = useMemo(() => {
    const ffsItemIds = new Set<string>();
    purchases.forEach(p => {
      const rawFfs: any = p.isFfs;
      const isFfs = rawFfs === true || rawFfs === 1 || String(rawFfs).toLowerCase() === 'true' || String(rawFfs) === '1';
      if (isFfs && p.itemId != null) {
        ffsItemIds.add(String(p.itemId));
      }
    });

    let vat = 0;
    salesReport.forEach(item => {
      // Must match itemId AND must be Note 8 (Trade supply). Note 4 sales of the same item are excluded.
      if (item.itemId != null && ffsItemIds.has(String(item.itemId)) && String(item.note) === '8') {
        const itemValue = Number(item.totalValue) || 0;
        vat += itemValue * (Number(item.vatRate) / 100);
      }
    });
    return vat;
  }, [purchases, salesReport]);

  // Note 30: Advance Tax Paid at Import Stage (Decreasing Adjustment)
  const returnNote30VAT = useMemo(() => {
    return purchases.reduce((sum, p) => sum + (Number(p.at) || 0), 0);
  }, [purchases]);

  // Note 33: Total Decreasing Adjustment
  const returnNote33VAT = useMemo(() => {
    return returnNote30VAT + returnNote32VAT;
  }, [returnNote30VAT, returnNote32VAT]);

  // Note 34: Net Payable VAT
  const returnNote34VAT = useMemo(() => {
    return (returnNote9.vat || 0) - (returnNote23.vat || 0) + (returnNote27VAT || 0) - (returnNote33VAT || 0);
  }, [returnNote9, returnNote23, returnNote27VAT, returnNote33VAT]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Controls Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        
        {/* Left Side: Credentials */}
        <div className="flex items-center gap-4">
          <div className="text-emerald-400 bg-emerald-400/10 p-2 rounded-lg">
            <KeyRound size={18} />
          </div>

          {(!eVatCredentials?.loginId) ? (
            <div className="text-slate-400 text-sm font-medium flex items-center gap-2">
              <span className="text-base">📭</span> No Credential Found
            </div>
          ) : (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium text-xs uppercase tracking-wider">User:</span>
                <div className="flex items-center justify-between bg-slate-900/60 border border-slate-700/50 rounded px-2.5 py-1.5 w-36">
                  <span className="text-blue-400 font-mono font-semibold truncate">
                    {eVatCredentials.loginId}
                  </span>
                  <button onClick={() => handleCopyCredential(eVatCredentials.loginId, 'username')} className={`${copiedField === 'username' ? 'text-emerald-500' : 'text-slate-500 hover:text-emerald-400'} transition-colors shrink-0`} title="Copy Login ID">
                    {copiedField === 'username' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium text-xs uppercase tracking-wider">Pass:</span>
                <div className="flex items-center justify-between bg-slate-900/60 border border-slate-700/50 rounded px-2.5 py-1.5 w-36">
                  <span className={`${eVatCredentials.loginPassword ? 'text-slate-200 tracking-widest' : 'text-slate-500 tracking-normal'} font-mono font-semibold truncate mt-0.5`}>
                    {eVatCredentials.loginPassword ? '••••••••••••' : <span className="text-xs tracking-normal">N/A</span>}
                  </span>
                  {eVatCredentials.loginPassword && (
                    <button onClick={() => handleCopyCredential(eVatCredentials.loginPassword || '', 'password')} className={`${copiedField === 'password' ? 'text-emerald-500' : 'text-slate-500 hover:text-emerald-400'} transition-colors shrink-0`} title="Copy Password">
                      {copiedField === 'password' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Sub ID & Toggle */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 font-medium text-xs uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={14} /> Sub ID:
            </span>
            {isLoadingSubmissionId ? (
              <div className="flex items-center justify-center min-w-[120px] bg-slate-900/60 border border-slate-700/50 rounded py-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              </div>
            ) : submissionId ? (
              <span className="text-blue-400 font-mono font-semibold bg-slate-900/60 border border-slate-700/50 px-3 py-1.5 rounded min-w-[120px] inline-block text-center">
                {submissionId}
              </span>
            ) : (
              <span className="text-slate-500 font-mono text-xs bg-slate-900/60 border border-slate-700/50 px-3 py-1.5 rounded min-w-[120px] inline-block text-center italic mt-0.5">
                Not Found
              </span>
            )}
          </div>
          
          <label className="flex items-center cursor-pointer gap-2.5 text-sm font-medium text-slate-300 hover:text-white transition-colors">
            <div className="relative flex items-center">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={hideEmptyNotes} 
                onChange={(e) => setHideEmptyNotes(e.target.checked)} 
              />
              <div className={`block w-10 h-5 rounded-full transition-colors ${hideEmptyNotes ? 'bg-red-500' : 'bg-slate-700'}`}></div>
              <div className={`absolute left-1 bg-white w-3 h-3 rounded-full transition-transform shadow-sm ${hideEmptyNotes ? 'transform translate-x-5' : ''}`}></div>
            </div>
            Hide Empty Notes
          </label>
        </div>
      </div>

      {/* PART 3 */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700">
        <div className="py-2 px-4 border-b border-slate-700 text-center">
          <h4 className="text-lg font-semibold text-emerald-400">PART - 3: SUPPLY - OUTPUT TAX</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left w-[40%] border border-slate-700">Nature of Supply</th>
                <th className="px-4 py-3 text-center w-[1%] whitespace-nowrap border border-slate-700">Note</th>
                <th className="px-4 py-3 text-right border border-slate-700">Value (a)</th>
                <th className="px-4 py-3 text-right border border-slate-700">SD (b)</th>
                <th className="px-4 py-3 text-right border border-slate-700">VAT (c)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {showRow(returnNote3Value) && <tr><td className="px-4 py-3 border border-slate-700">Exempted Goods/Service</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 3</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote3Value)}</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td></tr>}
              {showRow(returnNote4.value, returnNote4.sd, returnNote4.vat) && <tr><td className="px-4 py-3 border border-slate-700">Standard Rated Goods/Service</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 4</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote4.value)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote4.sd)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote4.vat)}</td></tr>}
              {showRow(returnNote8.value, returnNote8.sd, returnNote8.vat) && <tr><td className="px-4 py-3 border border-slate-700">Retail/Wholesale/Trade Based Supply</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 8</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote8.value)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote8.sd)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote8.vat)}</td></tr>}
              {showRow(returnNote9.value, returnNote9.sd, returnNote9.vat) && <tr className="bg-slate-700/30 font-bold text-blue-400"><td className="px-4 py-3 border border-slate-700">Total Sales Value & Total Payable Taxes</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 9</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote9.value)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote9.sd)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote9.vat)}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* PART 4 */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700">
        <div className="py-2 px-4 border-b border-slate-700 text-center">
          <h4 className="text-lg font-semibold text-emerald-400">PART - 4: PURCHASE - INPUT TAX</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left w-[40%] border border-slate-700">Nature of Supply</th>
                <th className="px-4 py-3 text-center w-[1%] whitespace-nowrap border border-slate-700">Note</th>
                <th className="px-4 py-3 text-right border border-slate-700">Value (a)</th>
                <th className="px-4 py-3 text-right border border-slate-700">VAT (b)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {showRow(returnNote13Value) && <tr><td className="px-4 py-3 border border-slate-700">Exempted Goods/Service (Import)</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 13</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote13Value)}</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td></tr>}
              {showRow(returnNote15.value, returnNote15.vat) && <tr><td className="px-4 py-3 border border-slate-700">Standard Rated Goods/Service (Import)</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 15</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote15.value)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote15.vat)}</td></tr>}
              {showRow(returnNote22.value) && <tr><td className="px-4 py-3 border border-slate-700">Goods/Service Not Admissible for Credit (Import)</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 22</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote22.value)}</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td></tr>}
              {showRow(returnNote23.value, returnNote23.vat) && <tr className="bg-slate-700/30 font-bold text-blue-400"><td className="px-4 py-3 border border-slate-700">Total Input Tax Credit</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 23</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote23.value)}</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote23.vat)}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* PART 5 */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700">
        <div className="py-2 px-4 border-b border-slate-700 text-center">
          <h4 className="text-lg font-semibold text-emerald-400">PART - 5: INCREASING ADJUSTMENTS</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left w-[40%] border border-slate-700">Nature of Supply</th>
                <th className="px-4 py-3 text-center w-[1%] whitespace-nowrap border border-slate-700">Note</th>
                <th className="px-4 py-3 text-right border border-slate-700">Value</th>
                <th className="px-4 py-3 text-right border border-slate-700">VAT</th>
                <th className="px-4 py-3 text-right border border-slate-700">SD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {showRow(returnNote27VAT) && <tr><td className="px-4 py-3 border border-slate-700">Any Other Adjustments</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 27</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote27VAT)}</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* PART 6 */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700">
        <div className="py-2 px-4 border-b border-slate-700 text-center">
          <h4 className="text-lg font-semibold text-emerald-400">PART - 6: DECREASING ADJUSTMENTS</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left w-[40%] border border-slate-700">Nature of Supply</th>
                <th className="px-4 py-3 text-center w-[1%] whitespace-nowrap border border-slate-700">Note</th>
                <th className="px-4 py-3 text-right border border-slate-700">Value</th>
                <th className="px-4 py-3 text-right border border-slate-700">VAT</th>
                <th className="px-4 py-3 text-right border border-slate-700">SD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {showRow(returnNote30VAT) && <tr><td className="px-4 py-3 border border-slate-700">Advance Tax Paid at Import Stage</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 30</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote30VAT)}</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td></tr>}
              {showRow(returnNote32VAT) && <tr><td className="px-4 py-3 border border-slate-700">Any Other Adjustments</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 32</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote32VAT)}</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td></tr>}
              {showRow(returnNote33VAT) && <tr className="bg-slate-700/30 font-bold text-blue-400"><td className="px-4 py-3 border border-slate-700">Total Decreasing Adjustment</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 33</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote33VAT)}</td><td className="px-4 py-3 text-right border border-slate-700">0.00</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* PART 7 */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700">
        <div className="py-2 px-4 border-b border-slate-700 text-center">
          <h4 className="text-lg font-semibold text-emerald-400">PART - 7: NET TAX CALCULATION</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left w-[40%] border border-slate-700">Nature of Supply</th>
                <th className="px-4 py-3 text-center w-[1%] whitespace-nowrap border border-slate-700">Note</th>
                <th className="px-4 py-3 text-right border border-slate-700">VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {showRow(returnNote34VAT) && <tr className="bg-fuchsia-900/20 font-bold text-fuchsia-400"><td className="px-4 py-3 border border-slate-700">Net Payable VAT for the Tax Period</td><td className="px-4 py-3 text-center whitespace-nowrap border border-slate-700">Note: 34</td><td className="px-4 py-3 text-right border border-slate-700">{fmt(returnNote34VAT)}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
