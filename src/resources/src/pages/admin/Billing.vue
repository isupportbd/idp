<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { can } from "@/composables/useAuth";
import { type Bill, type Collection, useBillingApi } from "@/composables/useBillingApi";
import { useClientsApi } from "@/composables/useClientsApi";
import { useExcelExport } from "@/composables/useExcelExport";
import { useFirmApi } from "@/composables/useFirmApi";
import { usePagination } from "@/composables/usePagination";
import { useServicesApi } from "@/composables/useServicesApi";
import { useToast } from "@/composables/useToast";
import BillingStatsCards from "./billing/BillingStatsCards.vue";
import BillingToolbar from "./billing/BillingToolbar.vue";
import CollectionsTable from "./billing/CollectionsTable.vue";
import InvoicesTable from "./billing/InvoicesTable.vue";
import MissingBillsTable from "./billing/MissingBillsTable.vue";

const router = useRouter();
const { exportSingleSheet } = useExcelExport();
const route = useRoute();
const toast = useToast();

const openInvoiceInNewTab = (billId: number) => {
  window.open(`/admin/billing/invoices/${billId}`, "_blank");
};

const {
  bills,
  collections,
  missingBills,
  stats,
  totalCollectionsAmount,
  loading,
  fetchBills,
  fetchCollections,
  fetchMissingBills,
  batchGenerateBills,
  deleteBill,
  cancelCollection,
  reconcileBalances
} = useBillingApi();

const { customerTypes, references, fetchCustomerTypes, fetchReferences } = useServicesApi();
const { assignableUsers, fetchAssignableUsers } = useClientsApi();
const { company } = useFirmApi();

const BILLING_FILTER_KEY = "idp_billing_filters";

const getSavedFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = sessionStorage.getItem(BILLING_FILTER_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Billing.vue]", uiErr?.message || uiErr);
  }
  return {};
};

const savedFilters = getSavedFilters();

// Active View Tab
const validTabs = ["invoices", "collections", "dues", "missing", "periodic-dues"] as const;
type TabType = (typeof validTabs)[number];

const initialTab = (route.query.tab as TabType) || savedFilters.activeTab || "invoices";
const activeTab = ref<TabType>(validTabs.includes(initialTab) ? initialTab : "invoices");

// Period State
const getLastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};
const selectedMonth = ref((route.query.month as string) || savedFilters.selectedMonth || getLastMonth());

// Filters
const searchQuery = ref((route.query.search as string) || savedFilters.searchQuery || "");
const selectedCustomerTypeId = ref<number | "all">(savedFilters.selectedCustomerTypeId ?? "all");
const selectedReferenceId = ref<number | "all">(savedFilters.selectedReferenceId ?? "all");
const selectedStatusFilter = ref<string>(savedFilters.selectedStatusFilter || "all");
const selectedPaymentMethod = ref<string>(savedFilters.selectedPaymentMethod || "all");

const saveFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(
        BILLING_FILTER_KEY,
        JSON.stringify({
          activeTab: activeTab.value,
          selectedMonth: selectedMonth.value,
          searchQuery: searchQuery.value,
          selectedCustomerTypeId: selectedCustomerTypeId.value,
          selectedReferenceId: selectedReferenceId.value,
          selectedStatusFilter: selectedStatusFilter.value,
          selectedPaymentMethod: selectedPaymentMethod.value
        })
      );
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Billing.vue]", uiErr?.message || uiErr);
  }
};

// Update URL parameters when tab, month, or search changes without refreshing
const updateUrlParams = () => {
  const q: any = { ...route.query };
  q.tab = activeTab.value;
  q.month = selectedMonth.value;
  if (searchQuery.value && searchQuery.value.trim()) {
    q.search = searchQuery.value.trim();
  } else {
    delete q.search;
  }
  router.replace({ query: q });
};

// Consolidated Debounced Filter Handler (eliminates multiple un-debounced watchers)
let filterSyncTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

const onFilterChange = () => {
  if (!isInitialized) return;
  saveFilters();
  currentPage.value = 1;
  if (filterSyncTimer) clearTimeout(filterSyncTimer);
  filterSyncTimer = setTimeout(() => {
    filterSyncTimer = null;
    updateUrlParams();
    void loadData();
  }, 250);
};

watch(
  [selectedMonth, selectedCustomerTypeId, selectedReferenceId, selectedStatusFilter, selectedPaymentMethod, searchQuery],
  onFilterChange
);

watch(activeTab, (newTab) => {
  if (!isInitialized) return;
  saveFilters();
  updateUrlParams();
  currentPage.value = 1;
  if (newTab === "collections" && collections.value.length === 0) {
    void fetchCollections({
      month: selectedMonth.value,
      paymentMethod: selectedPaymentMethod.value,
      referenceId: selectedReferenceId.value,
      search: searchQuery.value
    });
  } else if (newTab === "missing" && missingBills.value.length === 0) {
    void fetchMissingBills({
      month: selectedMonth.value,
      customerTypeId: selectedCustomerTypeId.value,
      referenceId: selectedReferenceId.value,
      search: searchQuery.value
    });
  }
});

onBeforeRouteLeave((to) => {
  if (!to.path.startsWith("/admin/billing")) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.removeItem(BILLING_FILTER_KEY);
      }
    } catch (uiErr: any) {
      console.warn("[UI Component Warning: Billing.vue]", uiErr?.message || uiErr);
    }
  }
});

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && validTabs.includes(newTab as TabType) && activeTab.value !== newTab) {
      activeTab.value = newTab as TabType;
    }
  }
);

// Batch Generating State
const isBatchGenerating = ref(false);

// Load data based on active tab and filters
const loadData = async () => {
  const billsParams = {
    month: selectedMonth.value,
    customerTypeId: selectedCustomerTypeId.value,
    referenceId: selectedReferenceId.value,
    status: selectedStatusFilter.value,
    search: searchQuery.value
  };

  const collectionsParams = {
    month: selectedMonth.value,
    paymentMethod: selectedPaymentMethod.value,
    referenceId: selectedReferenceId.value,
    search: searchQuery.value
  };

  const missingParams = {
    month: selectedMonth.value,
    customerTypeId: selectedCustomerTypeId.value,
    referenceId: selectedReferenceId.value,
    search: searchQuery.value
  };

  try {
    if (activeTab.value === "collections") {
      await fetchCollections(collectionsParams);
      void Promise.all([fetchBills(billsParams), fetchMissingBills(missingParams)]).catch(() => {});
    } else if (activeTab.value === "missing") {
      await fetchMissingBills(missingParams);
      void Promise.all([fetchBills(billsParams), fetchCollections(collectionsParams)]).catch(() => {});
    } else {
      await fetchBills(billsParams);
      void Promise.all([fetchCollections(collectionsParams), fetchMissingBills(missingParams)]).catch(() => {});
    }
  } catch (err: any) {
    toast.error("Failed to load billing data");
  }
};

// Lookup data (customer types / references / users) is static for the page and
// does not depend on filters, so it is loaded once instead of on every keystroke.
const loadLookups = async () => {
  try {
    await Promise.all([fetchCustomerTypes(), fetchReferences(), fetchAssignableUsers()]);
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Billing.vue]", uiErr?.message || uiErr);
  }
};

onMounted(async () => {
  try {
    await Promise.all([loadLookups(), loadData()]);
  } finally {
    isInitialized = true;
  }
});

// Debounce filter-driven reloads so typing in the search box no longer fires
// the full request fan-out on every keystroke.
let loadTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleLoadData = () => {
  if (loadTimer) clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    loadTimer = null;
    void loadData();
  }, 300);
};

onBeforeUnmount(() => {
  if (loadTimer) clearTimeout(loadTimer);
  if (filterSyncTimer) clearTimeout(filterSyncTimer);
});

const referenceOptions = computed(() => [
  { value: "all", label: `All References (${references.value.length})` },
  ...references.value.map((r: any) => ({ value: r.id, label: r.name }))
]);

// Filtered Lists for Tabs
const dueClientsList = computed(() => {
  return bills.value.filter((b) => b.dueAmount > 0);
});

const periodicDueList = computed(() => {
  return bills.value.filter((b) => {
    const netBilled = Math.max(0, (Number(b.subtotal) || 0) - (Number(b.discountAmount) || 0));
    const paidTowardCurrent = Math.max(0, (Number(b.paidAmount) || 0) - (Number(b.previousDue) || 0));
    const periodicDue = Math.max(0, netBilled - paidTowardCurrent);
    return periodicDue > 0;
  });
});

// Filtered Missing Bills (Search + Filter Support)
const filteredMissingBills = computed(() => {
  let list = missingBills.value;
  if (selectedCustomerTypeId.value !== "all") {
    list = list.filter((m) => m.customerTypeId === selectedCustomerTypeId.value);
  }
  if (selectedReferenceId.value !== "all") {
    list = list.filter((m) => m.referenceId === selectedReferenceId.value);
  }
  if (searchQuery.value && searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (m) =>
        (m.companyName && m.companyName.toLowerCase().includes(q)) ||
        (m.proprietorName && m.proprietorName.toLowerCase().includes(q)) ||
        (m.binNumber && m.binNumber.toLowerCase().includes(q)) ||
        (m.mobile && m.mobile.toLowerCase().includes(q)) ||
        (m.tinNumber && m.tinNumber.toLowerCase().includes(q)) ||
        (m.referenceName && m.referenceName.toLowerCase().includes(q)) ||
        (m.customerTypeName && m.customerTypeName.toLowerCase().includes(q)) ||
        (m.submissionId && m.submissionId.toLowerCase().includes(q)) ||
        (m.vatServiceType && m.vatServiceType.toLowerCase().includes(q))
    );
  }
  return list;
});

// Pagination State (10 items per page with reload persistence)
const currentTabList = computed<any[]>(() => {
  if (activeTab.value === "periodic-dues") return periodicDueList.value;
  if (activeTab.value === "dues") return dueClientsList.value;
  if (activeTab.value === "collections") return collections.value;
  if (activeTab.value === "missing") return filteredMissingBills.value;
  return bills.value;
});

const currentTabListCount = computed(() => currentTabList.value.length);
const { currentPage, itemsPerPage, totalPages, paginateList } = usePagination("billing", {
  defaultPerPage: 10,
  totalItems: currentTabListCount,
  syncUrl: false
});

const paginatedList = computed<any[]>(() => paginateList(currentTabList.value));

// Navigate to Create Invoice (Full Page)
const goToCreateBill = (clientId?: number, month?: string) => {
  const query: any = {};
  if (clientId) query.clientId = clientId;
  if (month) query.month = month;
  else query.month = selectedMonth.value;
  query.tab = activeTab.value;
  router.push({ path: "/admin/billing/create", query });
};

// Navigate to Receive Payment (Full Page)
const goToCreateCollection = (clientId?: number, billId?: number) => {
  const query: any = {};
  if (clientId) query.clientId = clientId;
  if (billId) query.billId = billId;
  query.tab = activeTab.value;
  router.push({ path: "/admin/billing/collections/create", query });
};

// Batch Generate Missing Bills
const handleBatchGenerate = async () => {
  const eligibleCount = filteredMissingBills.value.filter((m) => m.isSubmitted).length;
  if (eligibleCount === 0) {
    toast.error("No eligible clients with finalized submissions found for this month");
    return;
  }

  if (!confirm(`Generate monthly bills for ${eligibleCount} eligible clients for ${selectedMonth.value}?`)) {
    return;
  }

  isBatchGenerating.value = true;
  try {
    const res = await batchGenerateBills({
      taxPeriod: selectedMonth.value,
      clientIds: filteredMissingBills.value.filter((m) => m.isSubmitted).map((m) => m.id)
    });
    await loadData();
    activeTab.value = "invoices";
  } catch (err: any) {
    // Toast handled in composable
  } finally {
    isBatchGenerating.value = false;
  }
};

// Delete / Cancel Actions
const handleDeleteBill = async (bill: Bill) => {
  if (!confirm(`Are you sure you want to delete invoice ${bill.billNo} for ${bill.clientName}?`)) {
    return;
  }
  try {
    await deleteBill(bill.id);
    await loadData();
  } catch (err: any) {
    // Handled
  }
};

const handleCancelReceipt = async (col: Collection) => {
  if (!confirm(`Are you sure you want to cancel payment receipt ${col.receiptNo}?`)) {
    return;
  }
  try {
    await cancelCollection(col.id);
    await loadData();
  } catch (err: any) {
    // Handled
  }
};

// Excel Export
const exportToExcel = async () => {
  let exportRows: any[] = [];
  const selectedRef = references.value.find((r) => r.id === selectedReferenceId.value);
  const refName = selectedRef?.name || (selectedReferenceId.value !== "all" ? `Ref #${selectedReferenceId.value}` : null);
  const hasRefFilter = !!refName;

  const tabLabels: Record<string, string> = {
    invoices: "Monthly Invoices",
    dues: "Due Invoices",
    "periodic-dues": "Periodic Dues",
    collections: "Payment Receipts",
    missing: "Missing Bills"
  };

  const metaRows: Array<[string, string]> = [
    ["Report:", tabLabels[activeTab.value] || "Billing Report"],
    ["Tax Period:", selectedMonth.value]
  ];
  if (hasRefFilter) {
    metaRows.push(["Reference:", refName]);
  }

  // Include Clean Quick Stats Summary directly into the Excel Sheet
  if (activeTab.value === "invoices" || activeTab.value === "dues" || activeTab.value === "periodic-dues") {
    metaRows.push(["Previous Due:", `${(stats.value.totalPreviousDueAmount || 0).toLocaleString()} Tk`]);
    metaRows.push(["Total Invoiced:", `${(stats.value.totalBilledAmount || 0).toLocaleString()} Tk (${stats.value.totalInvoicesCount || 0} Invoices)`]);
    metaRows.push(["Total Collections:", `${(totalCollectionsAmount.value || 0).toLocaleString()} Tk (${collections.value.length || 0} Receipts)`]);
    metaRows.push(["Closing Balance:", `${(stats.value.totalDueAmount || 0).toLocaleString()} Tk`]);
  } else if (activeTab.value === "collections") {
    metaRows.push(["Total Collected:", `${(totalCollectionsAmount.value || 0).toLocaleString()} Tk`]);
    metaRows.push(["Total Receipts:", `${collections.value.length} Receipts`]);
  }

  if (activeTab.value === "invoices" || activeTab.value === "dues" || activeTab.value === "periodic-dues") {
    let source: any[] = [];
    if (activeTab.value === "periodic-dues") source = periodicDueList.value;
    else if (activeTab.value === "dues") source = dueClientsList.value;
    else source = bills.value;

    if (searchQuery.value && searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      source = source.filter(
        (b) =>
          (b.billNo && b.billNo.toLowerCase().includes(q)) ||
          (b.clientName && b.clientName.toLowerCase().includes(q)) ||
          (b.clientBin && b.clientBin.toLowerCase().includes(q)) ||
          (b.referenceName && b.referenceName.toLowerCase().includes(q)) ||
          (b.customerTypeName && b.customerTypeName.toLowerCase().includes(q))
      );
    }

    // Build client collections pool to accurately map payments even if unallocated at bill row level
    const clientColsPool = new Map<number, number>();
    for (const c of collections.value) {
      if (c.status === "completed" || !c.status) {
        const cur = clientColsPool.get(c.clientId) || 0;
        clientColsPool.set(c.clientId, cur + (Number(c.amount) || 0));
      }
    }

    exportRows = source.map((b, idx) => {
      const billingAmount = Number(b.subtotal || 0);
      const discount = Number(b.discountAmount || 0);
      const totalPayable = Math.max(0, billingAmount - discount);
      const prevDue = Number(b.previousDue || 0);
      const netPayable = totalPayable + prevDue;

      // Allocate payment from bill or completed collections pool
      let paid = Number(b.paidAmount || 0);
      if (paid === 0 && clientColsPool.has(b.clientId)) {
        const available = clientColsPool.get(b.clientId) || 0;
        paid = Math.min(netPayable, available);
        clientColsPool.set(b.clientId, available - paid);
      }

      const curBalNum = netPayable - paid;
      const curBalFormatted =
        curBalNum > 0
          ? `${curBalNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Due)`
          : curBalNum < 0
          ? `${Math.abs(curBalNum).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Adv)`
          : "0.00";

      const clientOrgBin = b.clientBin ? `${b.clientName}\nBIN: ${b.clientBin}` : b.clientName;

      const row: Record<string, unknown> = {
        "ক্রমিক": idx + 1,
        "ক্লায়েন্ট নাম ও বিন": clientOrgBin,
        "কাস্টমার টাইপ": b.customerTypeName || "Standard",
        "বিলিং এমাউন্ট": billingAmount,
        "ডিসকাউন্ট": discount,
        "টোটাল পেয়েবল": totalPayable,
        "প্রিভিয়াস ডিউ": prevDue,
        "নেট পেয়েবল": netPayable,
        "পেইড": paid,
        "কারেন্ট ব্যালেন্স": curBalFormatted
      };

      return row;
    });

    // Add Totals row at bottom
    if (exportRows.length > 0) {
      const totalBilling = exportRows.reduce((acc, r) => acc + (Number(r["বিলিং এমাউন্ট"]) || 0), 0);
      const totalDisc = exportRows.reduce((acc, r) => acc + (Number(r["ডিসকাউন্ট"]) || 0), 0);
      const totalPayableSum = exportRows.reduce((acc, r) => acc + (Number(r["টোটাল পেয়েবল"]) || 0), 0);
      const totalPrevDueSum = exportRows.reduce((acc, r) => acc + (Number(r["প্রিভিয়াস ডিউ"]) || 0), 0);
      const totalNetPayableSum = exportRows.reduce((acc, r) => acc + (Number(r["নেট পেয়েবল"]) || 0), 0);
      const totalPaidSum = exportRows.reduce((acc, r) => acc + (Number(r["পেইড"]) || 0), 0);
      const netClosingDue = totalNetPayableSum - totalPaidSum;

      const totalClosingFormatted =
        netClosingDue > 0
          ? `${netClosingDue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Due)`
          : netClosingDue < 0
          ? `${Math.abs(netClosingDue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Adv)`
          : "0.00";

      const totalRow: Record<string, unknown> = {
        "ক্রমিক": "",
        "ক্লায়েন্ট নাম ও বিন": "Total =",
        "কাস্টমার টাইপ": "",
        "বিলিং এমাউন্ট": totalBilling,
        "ডিসকাউন্ট": totalDisc,
        "টোটাল পেয়েবল": totalPayableSum,
        "প্রিভিয়াস ডিউ": totalPrevDueSum,
        "নেট পেয়েবল": totalNetPayableSum,
        "পেইড": totalPaidSum,
        "কারেন্ট ব্যালেন্স": totalClosingFormatted
      };
      exportRows.push(totalRow);
    }
  } else if (activeTab.value === "collections") {
    let source = collections.value;
    if (searchQuery.value && searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      source = source.filter(
        (c) =>
          (c.receiptNo && c.receiptNo.toLowerCase().includes(q)) ||
          (c.clientName && c.clientName.toLowerCase().includes(q)) ||
          (c.referenceNo && c.referenceNo.toLowerCase().includes(q)) ||
          (c.paymentMethod && c.paymentMethod.toLowerCase().includes(q))
      );
    }

    exportRows = source.map((c, idx) => {
      const row: Record<string, unknown> = {
        "ক্রমিক": idx + 1,
        "রিসিট নং": c.receiptNo,
        "ক্লায়েন্ট নাম": c.clientName,
        "কালেকশন ডেট": new Date(c.collectionDate).toLocaleDateString("en-GB"),
        "পেমেন্ট মেথড": c.paymentMethod.toUpperCase(),
        "কালেক্টেড এমাউন্ট": Number(c.amount || 0),
        "রেফারেন্স নং": c.referenceNo || "—",
        "নোট": c.notes || "",
        "স্ট্যাটাস": c.status.toUpperCase()
      };
      return row;
    });

    if (exportRows.length > 0) {
      const totalRow: Record<string, unknown> = {
        "ক্রমিক": "",
        "রিসিট নং": "",
        "ক্লায়েন্ট নাম": "Total =",
        "কালেকশন ডেট": "",
        "পেমেন্ট মেথড": "",
        "কালেক্টেড এমাউন্ট": exportRows.reduce((acc, r) => acc + (Number(r["কালেক্টেড এমাউন্ট"]) || 0), 0),
        "রেফারেন্স নং": "",
        "নোট": "",
        "স্ট্যাটাস": ""
      };
      exportRows.push(totalRow);
    }
  } else if (activeTab.value === "missing") {
    exportRows = filteredMissingBills.value.map((m, idx) => {
      const clientOrgBin = m.binNumber ? `${m.companyName}\nBIN: ${m.binNumber}` : m.companyName;

      const row: Record<string, unknown> = {
        "ক্রমিক": idx + 1,
        "ক্লায়েন্ট নাম ও বিন": clientOrgBin,
        "সার্ভিস স্কোপ": m.vatServiceType || "Standard",
        "সাবমিশন আইডি": m.submissionId || "Pending",
        "স্ট্যাটাস": m.isSubmitted ? "Ready to Bill" : "Pending Submission",
        "প্রিভিয়াস ডিউ": Number(m.previousDue || 0),
        "সার্ভিস ফি": Number(m.monthlyServiceFee || 0)
      };

      return row;
    });

    if (exportRows.length > 0) {
      const totalRow: Record<string, unknown> = {
        "ক্রমিক": "",
        "ক্লায়েন্ট নাম ও বিন": "Total =",
        "সার্ভিস স্কোপ": "",
        "সাবমিশন আইডি": "",
        "স্ট্যাটাস": "",
        "প্রিভিয়াস ডিউ": exportRows.reduce((acc, r) => acc + (Number(r["প্রিভিয়াস ডিউ"]) || 0), 0),
        "সার্ভিস ফি": exportRows.reduce((acc, r) => acc + (Number(r["সার্ভিস ফি"]) || 0), 0)
      };
      exportRows.push(totalRow);
    }
  }

  if (exportRows.length === 0) {
    toast.error("No data available to export for current view");
    return;
  }

  const filePrefix = hasRefFilter
    ? `IDP_Billing_${activeTab.value}_${refName.replace(/\s+/g, "_")}_${selectedMonth.value}`
    : `IDP_Billing_${activeTab.value}_${selectedMonth.value}`;

  const colWidths =
    activeTab.value === "collections"
      ? [6, 16, 32, 14, 15, 16, 16, 12]
      : activeTab.value === "missing"
      ? [6, 42, 18, 16, 16, 16, 16]
      : [6, 48, 18, 16, 12, 16, 16, 17, 15, 20];

  exportSingleSheet(exportRows, "Billing Data", `${filePrefix}.xlsx`, {
    metaRows,
    colWidths,
    alignments: {
      "ক্রমিক": "center",
      "ক্লায়েন্ট নাম ও বিন": "left",
      "ক্লায়েন্ট নাম": "left",
      "রিসিট নং": "center",
      "কাস্টমার টাইপ": "left",
      "বিলিং ডেট": "center",
      "কালেকশন ডেট": "center",
      "পেমেন্ট মেথড": "center",
      "বিলিং এমাউন্ট": "right",
      "ডিসকাউন্ট": "right",
      "টোটাল পেয়েবল": "right",
      "প্রিভিয়াস ডিউ": "right",
      "নেট পেয়েবল": "right",
      "পেইড": "right",
      "কারেন্ট ব্যালেন্স": "right",
      "কালেক্টেড এমাউন্ট": "right",
      "সার্ভিস ফি": "right",
      "স্ট্যাটাস": "center",
      "সাবমিশন আইডি": "center"
    }
  });
  toast.success("Excel report exported successfully");
};

const goToEditBill = (id: number) => {
  router.push(`/admin/billing/edit/${id}`);
};

const goToEditCollection = (id: number) => {
  router.push(`/admin/billing/collections/edit/${id}`);
};

// Print Report
const printReport = () => {
  const selectedRef = references.value.find((r) => r.id === selectedReferenceId.value);
  const refName = selectedRef?.name || (selectedReferenceId.value !== "all" ? `Ref #${selectedReferenceId.value}` : null);
  const hasRefFilter = !!refName;

  const tabLabels: Record<string, string> = {
    invoices: "Monthly Invoices Report",
    dues: "Due Invoices Report",
    "periodic-dues": "Periodic Unsettled Bills Report",
    collections: "Payment Receipts & Collections Report",
    missing: "Missing Monthly Bills Report"
  };

  const reportTitle = tabLabels[activeTab.value] || "Billing & Invoicing Report";

  // Determine source list
  let sourceList: any[] = [];
  if (activeTab.value === "periodic-dues") sourceList = periodicDueList.value;
  else if (activeTab.value === "dues") sourceList = dueClientsList.value;
  else if (activeTab.value === "collections") sourceList = collections.value;
  else if (activeTab.value === "missing") sourceList = filteredMissingBills.value;
  else sourceList = bills.value;

  if (searchQuery.value && searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    if (activeTab.value === "collections") {
      sourceList = sourceList.filter(
        (c) =>
          (c.receiptNo && c.receiptNo.toLowerCase().includes(q)) ||
          (c.clientName && c.clientName.toLowerCase().includes(q)) ||
          (c.referenceNo && c.referenceNo.toLowerCase().includes(q)) ||
          (c.paymentMethod && c.paymentMethod.toLowerCase().includes(q))
      );
    } else {
      sourceList = sourceList.filter(
        (b) =>
          (b.billNo && b.billNo.toLowerCase().includes(q)) ||
          (b.clientName && b.clientName.toLowerCase().includes(q)) ||
          (b.clientBin && b.clientBin.toLowerCase().includes(q)) ||
          (b.referenceName && b.referenceName.toLowerCase().includes(q)) ||
          (b.customerTypeName && b.customerTypeName.toLowerCase().includes(q))
      );
    }
  }

  if (sourceList.length === 0) {
    toast.error("No data available to print for current view");
    return;
  }

  const formatTkStr = (amount?: number | null): string => {
    if (amount === undefined || amount === null) return "0.00";
    return Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  let tableHtml = "";

  if (activeTab.value === "invoices" || activeTab.value === "dues" || activeTab.value === "periodic-dues") {
    // Build client collections pool to accurately map payments
    const clientColsPool = new Map<number, number>();
    for (const c of collections.value) {
      if (c.status === "completed" || !c.status) {
        const cur = clientColsPool.get(c.clientId) || 0;
        clientColsPool.set(c.clientId, cur + (Number(c.amount) || 0));
      }
    }

    const processedRows = sourceList.map((b, idx) => {
      const billingAmount = Number(b.subtotal || 0);
      const discount = Number(b.discountAmount || 0);
      const totalPayable = Math.max(0, billingAmount - discount);
      const prevDue = Number(b.previousDue || 0);
      const netPayable = totalPayable + prevDue;

      let paid = Number(b.paidAmount || 0);
      if (paid === 0 && clientColsPool.has(b.clientId)) {
        const available = clientColsPool.get(b.clientId) || 0;
        paid = Math.min(netPayable, available);
        clientColsPool.set(b.clientId, available - paid);
      }

      const curBal = netPayable - paid;
      return {
        idx: idx + 1,
        clientName: b.clientName,
        clientBin: b.clientBin,
        customerType: b.customerTypeName || "Standard",
        billDate: b.billDate,
        billingAmount,
        discount,
        totalPayable,
        prevDue,
        netPayable,
        paid,
        curBal
      };
    });

    const subtotalSum = processedRows.reduce((acc, r) => acc + r.billingAmount, 0);
    const discountSum = processedRows.reduce((acc, r) => acc + r.discount, 0);
    const totalPayableSum = processedRows.reduce((acc, r) => acc + r.totalPayable, 0);
    const prevDueSum = processedRows.reduce((acc, r) => acc + r.prevDue, 0);
    const netPayableSum = processedRows.reduce((acc, r) => acc + r.netPayable, 0);
    const paidSum = processedRows.reduce((acc, r) => acc + r.paid, 0);
    const closingBalSum = netPayableSum - paidSum;

    tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 28px;" class="text-center">#</th>
            <th>Client Organization &amp; BIN</th>
            <th style="width: 90px;">Customer Type</th>
            <th style="width: 80px;" class="text-end">Billing Amt</th>
            <th style="width: 70px;" class="text-end">Discount</th>
            <th style="width: 80px;" class="text-end">Total Payable</th>
            <th style="width: 80px;" class="text-end">Prev Due</th>
            <th style="width: 85px;" class="text-end">Net Payable</th>
            <th style="width: 75px;" class="text-end">Paid</th>
            <th style="width: 95px;" class="text-end">Current Balance</th>
          </tr>
        </thead>
        <tbody>
          ${processedRows
            .map(
              (r) => `
            <tr>
              <td class="text-center">${r.idx}</td>
              <td>
                <div class="fw-bold" style="font-size: 10.5px;">${r.clientName}</div>
                ${r.clientBin ? `<div class="text-muted font-monospace" style="font-size: 9px;">BIN: ${r.clientBin}</div>` : ''}
              </td>
              <td>${r.customerType}</td>
              <td class="text-end font-monospace">${formatTkStr(r.billingAmount)}</td>
              <td class="text-end font-monospace">${r.discount > 0 ? formatTkStr(r.discount) : "0.00"}</td>
              <td class="text-end font-monospace fw-bold">${formatTkStr(r.totalPayable)}</td>
              <td class="text-end font-monospace">${formatTkStr(r.prevDue)}</td>
              <td class="text-end font-monospace fw-bold">${formatTkStr(r.netPayable)}</td>
              <td class="text-end font-monospace text-success fw-semibold">${formatTkStr(r.paid)}</td>
              <td class="text-end font-monospace fw-bold ${r.curBal > 0 ? 'text-danger' : (r.curBal < 0 ? 'text-primary' : 'text-success')}">
                ${r.curBal > 0 ? `${formatTkStr(r.curBal)} (Due)` : (r.curBal < 0 ? `${formatTkStr(Math.abs(r.curBal))} (Adv)` : "0.00")}
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3" class="text-end fw-bold">Total (${processedRows.length} Invoices):</td>
            <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(subtotalSum)}</td>
            <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(discountSum)}</td>
            <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(totalPayableSum)}</td>
            <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(prevDueSum)}</td>
            <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(netPayableSum)}</td>
            <td class="text-end font-monospace fw-bold text-success">৳ ${formatTkStr(paidSum)}</td>
            <td class="text-end font-monospace fw-bold text-danger">৳ ${closingBalSum > 0 ? `${formatTkStr(closingBalSum)} (Due)` : (closingBalSum < 0 ? `${formatTkStr(Math.abs(closingBalSum))} (Adv)` : "0.00")}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (activeTab.value === "collections") {
    const totalCollected = sourceList.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

    tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 30px;" class="text-center">#</th>
            <th style="width: 100px;">Receipt No</th>
            <th>Client Organization</th>
            <th style="width: 85px;" class="text-center">Date</th>
            <th style="width: 90px;" class="text-center">Method</th>
            <th style="width: 100px;">Ref No</th>
            <th style="width: 110px;" class="text-end">Collected (Tk)</th>
            <th style="width: 75px;" class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${sourceList
            .map(
              (c, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="font-monospace fw-bold">${c.receiptNo}</td>
              <td class="fw-bold">${c.clientName}</td>
              <td class="text-center font-monospace">${new Date(c.collectionDate).toLocaleDateString("en-GB")}</td>
              <td class="text-center">${c.paymentMethod.toUpperCase()}</td>
              <td class="font-monospace">${c.referenceNo || '—'}</td>
              <td class="text-end font-monospace fw-bold text-success">৳ ${formatTkStr(c.amount)}</td>
              <td class="text-center">
                <span class="badge ${c.status === 'completed' ? 'badge-success' : 'badge-danger'}">
                  ${c.status.toUpperCase()}
                </span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="6" class="text-end fw-bold">Total Collected (${sourceList.length} Receipts):</td>
            <td class="text-end font-monospace fw-bold text-success">৳ ${formatTkStr(totalCollected)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (activeTab.value === "missing") {
    const prevDueSum = sourceList.reduce((acc, m) => acc + (Number(m.previousDue) || 0), 0);
    const feeSum = sourceList.reduce((acc, m) => acc + (Number(m.monthlyServiceFee) || 0), 0);

    tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width: 30px;" class="text-center">#</th>
            <th>Client Organization</th>
            <th style="width: 120px;">BIN Number</th>
            ${!hasRefFilter ? '<th style="width: 120px;">Reference</th>' : ''}
            <th style="width: 110px;">Submission ID</th>
            <th style="width: 95px;" class="text-end">Prev Due</th>
            <th style="width: 95px;" class="text-end">Service Fee</th>
            <th style="width: 90px;" class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${sourceList
            .map(
              (m, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="fw-bold">${m.companyName}</td>
              <td class="font-monospace">${m.binNumber || '—'}</td>
              ${!hasRefFilter ? `<td>${m.referenceName || '—'}</td>` : ''}
              <td class="font-monospace">${m.submissionId || 'Pending'}</td>
              <td class="text-end font-monospace">${formatTkStr(m.previousDue)}</td>
              <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(m.monthlyServiceFee)}</td>
              <td class="text-center">
                <span class="badge ${m.isSubmitted ? 'badge-success' : 'badge-warning'}">
                  ${m.isSubmitted ? 'Ready to Bill' : 'Pending'}
                </span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="${!hasRefFilter ? '5' : '4'}" class="text-end fw-bold">Total (${sourceList.length} Clients):</td>
            <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(prevDueSum)}</td>
            <td class="text-end font-monospace fw-bold">৳ ${formatTkStr(feeSum)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  const firmName = company?.value?.companyName || "IDP - Intelligent Data Platform";
  const firmAddress = company?.value?.address || "";
  const firmPhone = company?.value?.phone || "";

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${reportTitle} - ${selectedMonth.value}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm 8mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      font-size: 10.5px;
      line-height: 1.35;
      margin: 0;
      padding: 0;
    }
    .print-header {
      border-bottom: 2px solid #1e293b;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
    }
    .header-table td {
      vertical-align: middle;
      padding: 0;
    }
    .firm-title {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
      margin: 0 0 2px 0;
    }
    .firm-subtitle {
      font-size: 9.5px;
      color: #64748b;
    }
    .report-title-box {
      text-align: right;
    }
    .report-title {
      font-size: 13px;
      font-weight: 700;
      color: #1e40af;
      margin: 0 0 2px 0;
    }
    .report-meta {
      font-size: 9.5px;
      color: #475569;
    }
    .print-summary-grid {
      display: table;
      width: 100%;
      table-layout: fixed;
      margin-bottom: 10px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #f8fafc;
    }
    .summary-cell {
      display: table-cell;
      padding: 6px 10px;
      border-right: 1px solid #e2e8f0;
      text-align: center;
      vertical-align: middle;
    }
    .summary-cell:last-child {
      border-right: none;
    }
    .summary-lbl {
      font-size: 8.5px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .summary-val {
      font-size: 12px;
      font-weight: 800;
      font-family: monospace;
      color: #0f172a;
    }
    .text-success { color: #15803d !important; }
    .text-danger { color: #b91c1c !important; }
    .text-muted { color: #64748b !important; }
    .fw-bold { font-weight: 700 !important; }
    .text-center { text-align: center !important; }
    .text-end { text-align: right !important; }
    .font-monospace {
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace !important;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    .report-table th {
      background-color: #f1f5f9 !important;
      color: #1e293b !important;
      font-weight: 700;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      border: 1px solid #94a3b8;
      padding: 5px 6px;
      vertical-align: middle;
    }
    .report-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      font-size: 9.5px;
      vertical-align: middle;
    }
    .report-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .report-table tfoot td {
      background-color: #f1f5f9 !important;
      border-top: 2px solid #0f172a !important;
      border-bottom: 2px solid #0f172a !important;
      font-size: 10px;
      padding: 6px 6px;
    }
    .badge {
      display: inline-block;
      padding: 1px 4px;
      font-size: 8px;
      font-weight: 700;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .badge-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge-warning { background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
    .badge-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="print-header">
    <table class="header-table">
      <tr>
        <td>
          <div class="firm-title">${firmName}</div>
          <div class="firm-subtitle">${firmAddress ? `${firmAddress} | ` : ''}${firmPhone ? `Phone: ${firmPhone}` : ''}</div>
        </td>
        <td class="report-title-box">
          <div class="report-title">${reportTitle}</div>
          <div class="report-meta">
            Tax Period: <strong>${selectedMonth.value}</strong>
            ${hasRefFilter ? ` | Ref: <strong>${refName}</strong>` : ''}
            | Date: <strong>${new Date().toLocaleDateString("en-GB")}</strong>
          </div>
        </td>
      </tr>
    </table>
  </div>

  ${
    activeTab.value === "invoices" || activeTab.value === "dues" || activeTab.value === "periodic-dues"
      ? `
    <div class="print-summary-grid">
      <div class="summary-cell">
        <div class="summary-lbl">Previous Due</div>
        <div class="summary-val">৳ ${formatTkStr(stats.value.totalPreviousDueAmount)}</div>
      </div>
      <div class="summary-cell">
        <div class="summary-lbl">Total Invoiced</div>
        <div class="summary-val">৳ ${formatTkStr(stats.value.totalBilledAmount)}</div>
      </div>
      <div class="summary-cell">
        <div class="summary-lbl">Total Collections</div>
        <div class="summary-val text-success">৳ ${formatTkStr(totalCollectionsAmount.value)}</div>
      </div>
      <div class="summary-cell">
        <div class="summary-lbl">Closing Balance</div>
        <div class="summary-val text-danger">৳ ${formatTkStr(stats.value.totalDueAmount)}</div>
      </div>
    </div>
  `
      : ""
  }

  ${
    activeTab.value === "collections"
      ? `
    <div class="print-summary-grid">
      <div class="summary-cell">
        <div class="summary-lbl">Total Collections</div>
        <div class="summary-val text-success">৳ ${formatTkStr(totalCollectionsAmount.value)}</div>
      </div>
      <div class="summary-cell">
        <div class="summary-lbl">Total Receipts</div>
        <div class="summary-val">${collections.value.length} Receipts</div>
      </div>
    </div>
  `
      : ""
  }

  ${tableHtml}
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      iframe.remove();
    }, 2000);
  }, 400);
};
</script>

<template>
  <div class="billing-page py-2">
    <!-- Header with Action Buttons -->
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">Billing & Collections</span>
        </div>
        <h4 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-cash-stack text-primary"></i>
          <span>Billing, Invoicing & Collections</span>
        </h4>
      </div>

      <div class="d-flex align-items-center gap-2 d-print-none flex-wrap">
        <!-- Export Excel -->
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 px-3"
          @click="exportToExcel"
        >
          <i class="bi bi-file-earmark-excel text-success"></i>
          <span>Export Excel</span>
        </button>

        <!-- Print -->
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 px-3"
          @click="printReport"
        >
          <i class="bi bi-printer text-info"></i>
          <span>Print</span>
        </button>

        <!-- Receive Payment (Full Page) -->
        <button
          v-if="can('collections.create')"
          type="button"
          class="btn btn-outline-success btn-sm d-flex align-items-center gap-1 px-3 fw-semibold shadow-sm"
          @click="goToCreateCollection()"
        >
          <i class="bi bi-wallet2"></i>
          <span>Receive Payment</span>
        </button>

        <!-- Create Invoice (Full Page) -->
        <button
          v-if="can('billing.create')"
          type="button"
          class="btn btn-primary btn-sm d-flex align-items-center gap-2 px-3 fw-semibold shadow-sm"
          @click="goToCreateBill()"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Create Invoice</span>
        </button>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <BillingStatsCards
      :active-tab="activeTab"
      :stats="stats"
      :total-collections-amount="totalCollectionsAmount"
      :collections-count="collections.length"
      :due-clients-count="dueClientsList.length"
      :periodic-due-count="periodicDueList.length"
      :missing-bills-count="filteredMissingBills.length"
      :missing-ready-count="filteredMissingBills.filter(m => m.isSubmitted).length"
      @update:active-tab="activeTab = $event"
    />

    <!-- Navigation Tabs & Toolbar -->
    <BillingToolbar
      :active-tab="activeTab"
      :bills-count="bills.length"
      :collections-count="collections.length"
      :dues-count="dueClientsList.length"
      :missing-count="searchQuery ? filteredMissingBills.length : missingBills.length"
      :selected-reference-id="selectedReferenceId"
      :reference-options="referenceOptions"
      :search-query="searchQuery"
      :selected-month="selectedMonth"
      @update:active-tab="activeTab = $event"
      @update:selected-reference-id="selectedReferenceId = $event"
      @update:search-query="searchQuery = $event"
      @update:selected-month="selectedMonth = $event"
    />

    <!-- TAB 1, 3 & 5: INVOICES TABLE (Active for 'invoices', 'dues', 'periodic-dues') -->
    <InvoicesTable
      v-if="activeTab === 'invoices' || activeTab === 'dues' || activeTab === 'periodic-dues'"
      :bills="(paginatedList as Bill[])"
      :loading="loading"
      :selected-month="selectedMonth"
      :can-edit="can('billing.edit')"
      :can-delete="can('billing.delete')"
      :can-collect="can('collections.create')"
      @view-invoice="openInvoiceInNewTab"
      @edit-invoice="goToEditBill"
      @create-collection="goToCreateCollection"
      @delete-invoice="handleDeleteBill"
    />

    <!-- TAB 2: COLLECTIONS & MONEY RECEIPTS -->
    <CollectionsTable
      v-else-if="activeTab === 'collections'"
      :collections="(paginatedList as Collection[])"
      :loading="loading"
      :selected-month="selectedMonth"
      :can-edit="can('collections.create') || can('collections.edit')"
      :can-delete="can('collections.delete')"
      @edit-receipt="goToEditCollection"
      @cancel-receipt="handleCancelReceipt"
    />

    <!-- TAB 4: MISSING BILLS WITH BATCH GENERATION -->
    <MissingBillsTable
      v-else-if="activeTab === 'missing'"
      :missing-bills="(paginatedList as any[])"
      :loading="loading"
      :selected-month="selectedMonth"
      :search-query="searchQuery"
      :current-page="currentPage"
      :items-per-page="itemsPerPage"
      :is-batch-generating="isBatchGenerating"
      :can-create="can('billing.create')"
      @batch-generate="handleBatchGenerate"
      @create-bill="goToCreateBill"
    />

    <!-- Pagination for Billing -->
    <div v-if="currentTabList.length > 0" class="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-2">
      <span class="text-muted small">
        Showing <strong>{{ (currentPage - 1) * itemsPerPage + 1 }}</strong> to
        <strong>{{ Math.min(currentPage * itemsPerPage, currentTabList.length) }}</strong> of
        <strong>{{ currentTabList.length }}</strong> records
      </span>

      <div v-if="totalPages > 1" class="d-flex align-items-center gap-1">
        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm"
          :disabled="currentPage <= 1"
          @click="currentPage--"
        >
          <i class="bi bi-chevron-left"></i> Prev
        </button>

        <template v-for="p in totalPages" :key="p">
          <button
            v-if="p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)"
            type="button"
            class="btn btn-sm"
            :class="currentPage === p ? 'btn-primary' : 'btn-dark border-secondary text-muted'"
            style="min-width: 32px;"
            @click="currentPage = p"
          >
            {{ p }}
          </button>
          <span
            v-else-if="p === currentPage - 3 || p === currentPage + 3"
            class="text-muted px-1"
          >
            ...
          </span>
        </template>

        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm"
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
        >
          Next <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.billing-page {
  width: 100%;
}

/* Teleported invoice row-actions menu: fixed so the table's `overflow: hidden`
   can't clip it. The dynamic top/left are applied inline. */
.invoice-actions-menu {
  position: fixed;
  min-width: 190px;
  z-index: 1080;
}

/* The global `.dropdown-item` rule forces a light colour with !important, so the
   danger action needs an equally important, more specific rule to stay red. */
.invoice-actions-menu .text-danger {
  color: #ff6b6b !important;
}

.invoice-actions-menu .text-danger:hover,
.invoice-actions-menu .text-danger:focus {
  color: #ff8787 !important;
  background-color: rgba(220, 53, 69, 0.14) !important;
}

.stat-pill {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  transition: all 0.2s ease;
}

.stat-pill:hover {
  background: #252b32;
  border-color: #0d6efd;
  transform: translateY(-2px);
}

.stat-pill-active {
  border-color: #0d6efd !important;
  background: #192434 !important;
}

.stat-label {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.stat-val {
  font-size: 1.65rem;
  font-weight: 800;
  line-height: 1.2;
}

.cursor-pointer {
  cursor: pointer;
}

.filter-panel {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
}

.tab-btn {
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  font-size: 0.82rem;
  font-weight: 600;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  height: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.tab-btn-active {
  background-color: #0d6efd !important;
  color: #ffffff !important;
  border: 1px solid #0d6efd !important;
  box-shadow: 0 2px 6px rgba(13, 110, 253, 0.35);
}

.tab-btn-inactive {
  background-color: #181b1f !important;
  color: #adb5bd !important;
  border: 1px solid #3b424b !important;
}

.tab-btn-inactive:hover {
  background-color: #242930 !important;
  color: #ffffff !important;
  border-color: #525b67 !important;
}

.tab-btn-warning-active {
  background-color: #ffc107 !important;
  color: #111417 !important;
  font-weight: 700 !important;
  border: 1px solid #ffc107 !important;
  box-shadow: 0 2px 6px rgba(255, 193, 7, 0.35);
}

.search-box {
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #6c757d;
  pointer-events: none;
  font-size: 0.8rem;
}

.idp-search-input {
  background-color: #181b1f !important;
  border: 1px solid #3b424b !important;
  color: #f8f9fa !important;
  padding-left: 36px !important;
  padding-right: 30px !important;
  border-radius: 6px;
  font-size: 0.86rem;
  height: 38px;
}

.idp-search-input:focus {
  border-color: #3b8eed !important;
  box-shadow: 0 0 0 0.15rem rgba(59, 142, 237, 0.25) !important;
}

.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #6c757d;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 0.85rem;
}

.clear-btn:hover {
  color: #f8f9fa;
}

.table-card {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  overflow: hidden;
}

.table-custom {
  width: 100%;
  border-collapse: collapse;
}

.table-custom thead th {
  background: #181b1f;
  color: #adb5bd;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #343a40;
  white-space: nowrap;
}

.table-custom tbody td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #2a3038;
  vertical-align: middle;
  white-space: nowrap;
}

.table-custom tbody tr:hover {
  background-color: #242930;
}

.search-slot {
  width: 220px;
  min-width: 220px;
  max-width: 220px;
  flex-shrink: 0;
}
</style>
