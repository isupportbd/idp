import { ref } from "vue";
import axios from "axios";

export interface PayoutStaffOption {
  id: number;
  name: string;
  email: string;
  mobile?: string | null;
  roleName?: string | null;
  status?: string;
}

export interface PayoutExpenseHead {
  id: number;
  name: string;
  code?: string | null;
  category?: string | null;
  isPayable?: boolean;
}

export interface PayoutBankAccount {
  id: number;
  bankName: string;
  accountNumber?: string | null;
  accountHolderName?: string | null;
}

export interface PayoutMeta {
  staff: PayoutStaffOption[];
  expenseHeads: PayoutExpenseHead[];
  bankAccounts: PayoutBankAccount[];
  serviceItems: Array<{ id: number; itemName: string }>;
  staffExpenseHead: PayoutExpenseHead | null;
}

export interface StaffPayoutSummary {
  id: number;
  name: string;
  email?: string;
  mobile?: string | null;
  role?: string | null;
  zeroCount: number;
  regularCount: number;
  zeroRate?: number;
  regularRate?: number;
  currentBill: number;
  paidAmount: number;
  previousDue?: number;
  previousAdvance?: number;
  totalPayable: number;
  closingDue: number;
  advanceBalance: number;
  isSettled: boolean;
}

export interface PayoutDashboardSummary {
  staffCount: number;
  totalEarned: number;
  totalPaid: number;
  totalDue: number;
  totalAdvance: number;
  generalExpenseTotal: number;
  monthPayoutTotal: number;
}

export interface PayoutRow {
  id: number;
  payoutType: "staff" | "general_expense";
  userId?: number | null;
  staffName?: string | null;
  expenseHeadId?: number | null;
  headName?: string | null;
  category?: string | null;
  bankAccountId?: number | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  amount: number;
  paymentMethod: string;
  accountInfo?: string | null;
  referenceNo?: string | null;
  periodMonth?: string | null;
  paidAt: string;
  notes?: string | null;
  currentBillSnapshot?: number;
  previousDueSnapshot?: number;
  closingDueSnapshot?: number;
  advanceSnapshot?: number;
  smsStatus?: string | null;
  smsResponse?: string | null;
  staffMobile?: string | null;
  createdBy?: number | null;
}

export interface StaffLedgerPreview {
  userId: number;
  month: string;
  zeroCount: number;
  regularCount: number;
  zeroRate: number;
  regularRate: number;
  currentBill: number;
  previousMonth: string;
  previousDue: number;
  previousAdvance: number;
  paidAmount: number;
  paymentCount: number;
  totalPayable: number;
  closingDue: number;
  advanceBalance: number;
  isSettled: boolean;
}

/** One month of a staff member's running account. */
export interface MonthlyLedgerRow {
  month: string;
  zeroCount: number;
  regularCount: number;
  currentBill: number;
  previousDue: number;
  previousAdvance: number;
  paidAmount: number;
  paymentCount: number;
  totalPayable: number;
  closingDue: number;
  advanceBalance: number;
}

/** Self-service payload for `GET /api/payouts/me`. */
export interface MyEarningsData {
  month: string;
  zeroRate: number;
  regularRate: number;
  current: MonthlyLedgerRow;
  months: MonthlyLedgerRow[];
  payouts: PayoutRow[];
  rateCard: Array<{ serviceItemId: number; itemName: string | null; rate: number }>;
}

/** Bangladeshi Taka, comma-grouped, always 2 decimals. */
export function formatBdt(value: number | string | null | undefined): string {
  const n = Number(value ?? 0) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2026-08" -> "August 2026" */
export function formatMonth(month?: string | null): string {
  if (!month) return "—";
  const parts = String(month).split("-").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return String(month);
  return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function usePayoutsApi() {
  const meta = ref<PayoutMeta>({
    staff: [],
    expenseHeads: [],
    bankAccounts: [],
    serviceItems: [],
    staffExpenseHead: null
  });
  const dashboard = ref<{
    month: string;
    summary: PayoutDashboardSummary;
    staff: StaffPayoutSummary[];
    categories: Array<{ category: string; amount: number }>;
    recent: PayoutRow[];
  } | null>(null);
  const payouts = ref<PayoutRow[]>([]);
  const currentPayout = ref<PayoutRow | null>(null);
  const myEarnings = ref<MyEarningsData | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const fetchMeta = async () => {
    try {
      const res = await axios.get("/api/payouts/meta");
      meta.value = res.data?.data || {
        staff: [],
        expenseHeads: [],
        bankAccounts: [],
        serviceItems: [],
        staffExpenseHead: null
      };
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch payout metadata";
      throw err;
    }
  };

  const fetchDashboard = async (month?: string) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get("/api/payouts", { params: month ? { month } : {} });
      dashboard.value = res.data?.data || null;
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch payouts dashboard";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchList = async (params: { month?: string; payoutType?: string; userId?: number | string; search?: string } = {}) => {
    loading.value = true;
    error.value = null;
    try {
      const clean: Record<string, any> = {};
      if (params.month) clean.month = params.month;
      if (params.payoutType && params.payoutType !== "all") clean.payoutType = params.payoutType;
      if (params.userId && params.userId !== "all") clean.userId = params.userId;
      if (params.search && params.search.trim()) clean.search = params.search.trim();
      const res = await axios.get("/api/payouts/list", { params: clean });
      payouts.value = res.data?.data || [];
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch payouts";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchPayout = async (id: number) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`/api/payouts/${id}`);
      currentPayout.value = res.data?.data || null;
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch payout";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createPayout = async (payload: Record<string, any>) => {
    saving.value = true;
    error.value = null;
    try {
      const res = await axios.post("/api/payouts", payload);
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to record payout";
      throw err;
    } finally {
      saving.value = false;
    }
  };

  const fetchStaffLedger = async (userId: number, month?: string) => {
    try {
      const res = await axios.get("/api/payouts/ledger", { params: { userId, month } });
      return res.data?.data as StaffLedgerPreview | null;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch staff ledger";
      throw err;
    }
  };

  const fetchUserRates = async (userId: number) => {
    try {
      const res = await axios.get(`/api/payouts/users/${userId}/rates`);
      return res.data?.data || [];
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch rates";
      throw err;
    }
  };

  const saveUserRates = async (
    userId: number,
    rates: Array<{ serviceItemId: number; rate: number; effectiveFrom?: string }>
  ) => {
    saving.value = true;
    error.value = null;
    try {
      const res = await axios.post(`/api/payouts/users/${userId}/rates`, { rates });
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to save rates";
      throw err;
    } finally {
      saving.value = false;
    }
  };

  /** Self-service: my own commissions + payment history (no payouts.view needed). */
  const fetchMyEarnings = async (month?: string) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get("/api/payouts/me", { params: month ? { month } : {} });
      myEarnings.value = res.data?.data || null;
      return myEarnings.value;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch your earnings";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    meta,
    dashboard,
    payouts,
    currentPayout,
    myEarnings,
    loading,
    saving,
    error,
    fetchMeta,
    fetchDashboard,
    fetchList,
    fetchPayout,
    createPayout,
    fetchStaffLedger,
    fetchUserRates,
    saveUserRates,
    fetchMyEarnings
  };
}
