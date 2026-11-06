<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { can } from "@/composables/useAuth";
import { type Bill, type Collection, useBillingApi } from "@/composables/useBillingApi";
import { useClientsApi } from "@/composables/useClientsApi";
import { useExcelExport } from "@/composables/useExcelExport";
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
  cancelCollection
} = useBillingApi();

const { customerTypes, references, fetchCustomerTypes, fetchReferences } = useServicesApi();
const { assignableUsers, fetchAssignableUsers } = useClientsApi();

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
const validTabs = ["invoices", "collections", "dues", "missing"] as const;
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

watch(activeTab, () => {
  if (!isInitialized) return;
  saveFilters();
  updateUrlParams();
  currentPage.value = 1;
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
  try {
    await Promise.all([
      fetchBills({
        month: selectedMonth.value,
        customerTypeId: selectedCustomerTypeId.value,
        referenceId: selectedReferenceId.value,
        status: selectedStatusFilter.value,
        search: searchQuery.value
      }),
      fetchCollections({
        month: selectedMonth.value,
        paymentMethod: selectedPaymentMethod.value,
        referenceId: selectedReferenceId.value,
        search: searchQuery.value
      }),
      fetchMissingBills({
        month: selectedMonth.value,
        customerTypeId: selectedCustomerTypeId.value,
        referenceId: selectedReferenceId.value,
        search: searchQuery.value
      })
    ]);
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
  if (activeTab.value === "invoices" || activeTab.value === "dues") {
    const source = activeTab.value === "dues" ? dueClientsList.value : bills.value;
    exportRows = source.map((b) => ({
      "Invoice No": b.billNo,
      "Client Organization": b.clientName,
      "BIN Number": b.clientBin || "N/A",
      "Customer Type": b.customerTypeName || "Standard",
      Reference: b.referenceName || "N/A",
      "Tax Period": b.taxPeriod,
      "Bill Date": new Date(b.billDate).toLocaleDateString(),
      "Subtotal (Tk)": b.subtotal,
      "Discount (Tk)": b.discountAmount,
      "Previous Due (Tk)": b.previousDue,
      "Grand Total (Tk)": b.grandTotal,
      "Paid Amount (Tk)": b.paidAmount,
      "Due Amount (Tk)": b.dueAmount,
      Status: b.status.toUpperCase()
    }));
  } else if (activeTab.value === "collections") {
    exportRows = collections.value.map((c) => ({
      "Receipt No": c.receiptNo,
      "Client Organization": c.clientName,
      "Collection Date": new Date(c.collectionDate).toLocaleDateString(),
      "Payment Method": c.paymentMethod.toUpperCase(),
      "Collected Amount (Tk)": c.amount,
      "Reference No": c.referenceNo || "N/A",
      Notes: c.notes || "",
      Status: c.status.toUpperCase()
    }));
  } else if (activeTab.value === "missing") {
    exportRows = filteredMissingBills.value.map((m) => ({
      "Client Organization": m.companyName,
      "BIN Number": m.binNumber || "N/A",
      "Service Scope": m.vatServiceType,
      "Target Month": m.targetMonth,
      "Submission ID": m.submissionId || "Pending",
      Status: m.isSubmitted ? "Ready to Bill" : "Pending Submission",
      "Previous Due (Tk)": m.previousDue,
      "Service Fee (Tk)": m.monthlyServiceFee
    }));
  }

  exportSingleSheet(exportRows, "Billing Data", `IDP_Billing_${activeTab.value}_${selectedMonth.value}.xlsx`);
  toast.success("Excel report exported successfully");
};

const goToEditBill = (id: number) => {
  router.push(`/admin/billing/edit/${id}`);
};

// Print Report
const printReport = () => {
  window.print();
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

    <!-- TAB 1 & 3: INVOICES TABLE (Active for 'invoices', 'dues') -->
    <InvoicesTable
      v-if="activeTab === 'invoices' || activeTab === 'dues'"
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
      :can-delete="can('collections.delete')"
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
