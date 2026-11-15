export interface LedgerTransaction {
  id: string;
  type: "opening" | "bill" | "collection";
  date: string;
  taxPeriod: string;
  refNo: string;
  description: string;
  paymentMethod?: string;
  debit: number;
  credit: number;
  balance: number;
  status: string;
  billId?: number | null;
  receiptId?: number | null;
}

export interface ClientLedgerSummary {
  clientId: number;
  companyName: string;
  binNumber: string;
  mobile: string;
  referenceId: number | null;
  referenceName: string;
  openingBalance: number;
  totalBilled: number;
  totalPaid: number;
  closingBalance: number;
  transactions?: LedgerTransaction[];
}

export interface LedgerOverallSummary {
  totalClients: number;
  openingBalance: number;
  totalBilled: number;
  totalPaid: number;
  closingBalance: number;
}

export interface ReferenceOption {
  id: number;
  name: string;
}
