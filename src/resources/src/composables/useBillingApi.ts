import axios from "axios";
import { ref } from "vue";
import { useToast } from "./useToast";

export interface BillItem {
  id?: number;
  billId?: number;
  serviceItemId?: number | null;
  itemName: string;
  unit: string;
  qty: number;
  rateUsed: number;
  minimumChargeUsed?: number;
  calculatedAmount?: number;
  finalAmount: number;
  notes?: string | null;
}

export interface Bill {
  id: number;
  billNo: string;
  clientId: number;
  clientName: string;
  clientBin?: string;
  clientMobile?: string;
  clientAlternativeMobile?: string;
  customerTypeId?: number;
  customerTypeName?: string;
  referenceId?: number;
  referenceName?: string;
  taxPeriod: string;
  billDate: string;
  dueDate?: string | null;
  subtotal: number;
  discountAmount: number;
  previousDue: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  status: "paid" | "partial" | "unpaid" | "overdue" | "draft" | "cancelled";
  notes?: string | null;
  createdByName?: string;
  createdAt: string;
  items: BillItem[];
}

export interface Collection {
  id: number;
  receiptNo: string;
  billId?: number | null;
  billNo?: string | null;
  clientId: number;
  clientName: string;
  clientBin?: string;
  clientMobile?: string;
  clientAlternativeMobile?: string;
  collectionDate: string;
  amount: number;
  paymentMethod: "cash" | "bank" | "cheque" | "bkash" | "nagad" | "rocket" | "other";
  referenceNo?: string | null;
  notes?: string | null;
  receivedByName?: string | null;
  status: "completed" | "cancelled";
  createdAt: string;
}

export interface MissingBillItem {
  id: number;
  companyName: string;
  proprietorName?: string | null;
  binNumber?: string;
  mobile?: string;
  tinNumber?: string;
  customerTypeId?: number | null;
  customerTypeName?: string;
  referenceId?: number | null;
  referenceName?: string;
  vatServiceType: string;
  targetMonth: string;
  submissionId?: string | null;
  isSubmitted: boolean;
  previousDue: number;
  monthlyServiceFee: number;
}

export interface BillingStats {
  totalInvoicesCount: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalDueAmount: number;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
}

// Module-scoped persistent reactive state (SWR / Stale-While-Revalidate)
// Ensures that on route transitions, existing bills, collections, and missing bills data is rendered immediately
// (0ms latency, no empty table flash / prolonged loading spinner) while background revalidation occurs.
const cachedBills = ref<Bill[]>([]);
const cachedCollections = ref<Collection[]>([]);
const cachedMissingBills = ref<MissingBillItem[]>([]);
const cachedStats = ref<BillingStats>({
  totalInvoicesCount: 0,
  totalBilledAmount: 0,
  totalPaidAmount: 0,
  totalDueAmount: 0,
  paidCount: 0,
  unpaidCount: 0,
  partialCount: 0
});
const cachedTotalCollectionsAmount = ref(0);
const hasLoadedBillsOnce = ref(false);
const hasLoadedCollectionsOnce = ref(false);
const hasLoadedMissingBillsOnce = ref(false);

export function useBillingApi() {
  const toast = useToast();
  const bills = cachedBills;
  const collections = cachedCollections;
  const missingBills = cachedMissingBills;
  const stats = cachedStats;
  const loading = ref(false);
  const totalCollectionsAmount = cachedTotalCollectionsAmount;

  // 1. Fetch Invoices / Bills
  const fetchBills = async (
    params: {
      month?: string;
      clientId?: number | string;
      status?: string;
      search?: string;
      customerTypeId?: number | string;
      referenceId?: number | string;
      page?: number;
      limit?: number;
    } = {}
  ) => {
    if (!hasLoadedBillsOnce.value || bills.value.length === 0) {
      loading.value = true;
    }
    try {
      const res = await axios.get("/api/billing", { params });
      bills.value = res.data.data || [];
      if (res.data.stats) {
        stats.value = res.data.stats;
      }
      hasLoadedBillsOnce.value = true;
      return res.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch bills");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 2. Fetch Single Bill Details
  const fetchBillDetails = async (id: number) => {
    loading.value = true;
    try {
      const res = await axios.get(`/api/billing/${id}`);
      return res.data.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch bill details");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 3. Create Single Bill
  const createBill = async (payload: {
    clientId: number;
    referenceId?: number | null;
    taxPeriod: string;
    billDate: string;
    dueDate?: string | null;
    discountAmount?: number;
    notes?: string | null;
    status?: string;
    items: Array<{
      serviceItemId?: number | null;
      itemName: string;
      unit?: string;
      qty: number;
      rateUsed: number;
      minimumChargeUsed?: number;
      calculatedAmount?: number;
      finalAmount: number;
      notes?: string | null;
    }>;
  }) => {
    try {
      const res = await axios.post("/api/billing", payload);
      toast.success(res.data.message || "Invoice created successfully");
      return res.data.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create invoice");
      throw err;
    }
  };

  // 3.1 Update Bill
  const updateBill = async (
    id: number,
    payload: {
      billDate?: string;
      dueDate?: string | null;
      discountAmount?: number;
      notes?: string | null;
      status?: string;
      items?: Array<{
        serviceItemId?: number | null;
        itemName: string;
        unit?: string;
        qty: number;
        rateUsed: number;
        minimumChargeUsed?: number;
        calculatedAmount?: number;
        finalAmount: number;
        notes?: string | null;
      }>;
    }
  ) => {
    try {
      const res = await axios.put(`/api/billing/${id}`, payload);
      toast.success(res.data.message || "Invoice updated successfully");
      return res.data.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update invoice");
      throw err;
    }
  };

  // 4. Batch Generate Bills
  const batchGenerateBills = async (payload: { taxPeriod: string; billDate?: string; dueDate?: string | null; clientIds?: number[] }) => {
    loading.value = true;
    try {
      const res = await axios.post("/api/billing/batch", payload);
      toast.success(res.data.message || "Batch invoices generated successfully");
      return res.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to generate batch bills");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 5. Fetch Missing Bills
  const fetchMissingBills = async (
    params:
      | {
          month?: string;
          search?: string;
          customerTypeId?: number | string;
          referenceId?: number | string;
        }
      | string
  ) => {
    if (!hasLoadedMissingBillsOnce.value || missingBills.value.length === 0) {
      loading.value = true;
    }
    try {
      const queryParams = typeof params === "string" ? { month: params } : params;
      const res = await axios.get("/api/billing/missing", { params: queryParams });
      missingBills.value = res.data.data || [];
      hasLoadedMissingBillsOnce.value = true;
      return res.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch missing bills");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 6. Fetch Client Billing Overview
  const fetchClientBillingOverview = async (clientId: number, month?: string) => {
    try {
      const res = await axios.get("/api/billing/overview", {
        params: { clientId, month }
      });
      return res.data.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch client billing overview");
      throw err;
    }
  };

  // 7. Delete Bill
  const deleteBill = async (id: number) => {
    try {
      const res = await axios.delete(`/api/billing/${id}`);
      toast.success(res.data.message || "Invoice deleted successfully");
      return res.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete invoice");
      throw err;
    }
  };

  // 8. Fetch Collections
  const fetchCollections = async (
    params: {
      month?: string;
      clientId?: number | string;
      paymentMethod?: string;
      referenceId?: number | string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ) => {
    if (!hasLoadedCollectionsOnce.value || collections.value.length === 0) {
      loading.value = true;
    }
    try {
      const res = await axios.get("/api/billing/collections", { params });
      collections.value = res.data.data || [];
      totalCollectionsAmount.value = res.data.totalCollected || 0;
      hasLoadedCollectionsOnce.value = true;
      return res.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch collections");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 9. Create Collection
  const createCollection = async (payload: {
    clientId: number;
    billId?: number | null;
    collectionDate: string;
    amount: number;
    paymentMethod: string;
    referenceNo?: string | null;
    notes?: string | null;
  }) => {
    try {
      const res = await axios.post("/api/billing/collections", payload);
      toast.success(res.data.message || "Payment recorded successfully");
      return res.data.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to record payment");
      throw err;
    }
  };

  // 10. Fetch Collection Details
  const fetchCollectionDetails = async (id: number) => {
    loading.value = true;
    try {
      const res = await axios.get(`/api/billing/collections/${id}`);
      return res.data?.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch receipt details");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // 11. Cancel Collection
  const cancelCollection = async (id: number) => {
    try {
      const res = await axios.delete(`/api/billing/collections/${id}`);
      toast.success(res.data.message || "Receipt cancelled successfully");
      return res.data;
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to cancel receipt");
      throw err;
    }
  };

  return {
    bills,
    collections,
    missingBills,
    stats,
    totalCollectionsAmount,
    loading,
    fetchBills,
    fetchBillDetails,
    createBill,
    updateBill,
    batchGenerateBills,
    fetchMissingBills,
    fetchClientBillingOverview,
    deleteBill,
    fetchCollections,
    fetchCollectionDetails,
    createCollection,
    cancelCollection
  };
}
