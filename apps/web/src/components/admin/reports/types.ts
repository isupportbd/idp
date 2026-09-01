export interface Client { id: number; name: string; bin?: string; }
export interface Item { id: number; name: string; hsCode?: string; }
export interface UnitConversion { id: number; purchaseUnit: string; salesUnit: string; factor: number; }

export interface Purchase {
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

export interface SalesReportItem {
  itemId: number; itemName: string; hsCode: string;
  totalQty: number; rate: number; unitValue: number;
  totalValue: number; addition: number; vatRate: number; note: string;
}

export const formatMonth = (yyyyMm: string) => {
  if (!yyyyMm) return '';
  const [year, month] = yyyyMm.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return `${date.toLocaleString('en-US', { month: 'short' })}-${year.slice(2)}`;
};

export const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
};

export const fmt = (val: any, decimals = 2) => {
  if (val === undefined || val === null || val === '') return '';
  const num = parseFloat(val);
  return isNaN(num) ? val : num.toFixed(decimals);
};
