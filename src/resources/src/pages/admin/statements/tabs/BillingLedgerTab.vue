<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, ref, watch } from "vue";
import { can } from "@/composables/useAuth";
import { useExcelExport } from "@/composables/useExcelExport";
import { usePulseListener } from "@/composables/usePulseListener";
import { useMasterDataStore } from "@/stores/masterData";
import LedgerFilterBar from "../components/LedgerFilterBar.vue";
import LedgerSummaryCards from "../components/LedgerSummaryCards.vue";
import LedgerTransactionsTable from "../components/LedgerTransactionsTable.vue";
import ReferenceSummaryTable from "../components/ReferenceSummaryTable.vue";
import type { ClientLedgerSummary, CustomerTypeOption, LedgerOverallSummary, LedgerTransaction, ReferenceOption } from "../types";

const masterStore = useMasterDataStore();
const { exportSingleSheet } = useExcelExport();

// Date defaults: By default previous month of current month
const getLastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Filter State: Defaults to previous month (fromMonth = lastMonth, toMonth = lastMonth)
const fromMonth = ref(getLastMonth());
const toMonth = ref(getLastMonth());
const selectedClientId = ref<number | null>(null);
const selectedCustomerTypeId = ref<string | number>("all");
const selectedReferenceId = ref<string | number>("all");

// Data State
const isLoading = ref(false);
const errorMessage = ref("");
const customerTypes = ref<CustomerTypeOption[]>([]);
const references = ref<ReferenceOption[]>([]);
const summary = ref<LedgerOverallSummary>({
  totalClients: 0,
  openingBalance: 0,
  totalBilled: 0,
  totalPaid: 0,
  closingBalance: 0
});
const clientSummaries = ref<ClientLedgerSummary[]>([]);
const transactions = ref<LedgerTransaction[]>([]);

// Permissions
const canExport = computed(() => can("statements.export") || can("billing.view") || true);

// Currently selected client summary object
const activeClientSummary = computed(() => {
  if (!selectedClientId.value) return null;
  return clientSummaries.value.find((c) => c.clientId === selectedClientId.value) || null;
});

const activeReferenceName = computed(() => {
  if (selectedReferenceId.value === "all") return "";
  const found = references.value.find((r) => String(r.id) === String(selectedReferenceId.value));
  return found ? found.name : "";
});

// Load Master Data (Customer Types & References)
const loadMasterData = async () => {
  try {
    // 1. References
    if (masterStore.references && masterStore.references.length > 0) {
      references.value = masterStore.references.map((r: any) => ({ id: r.id, name: r.name }));
    } else {
      const res = await axios.get("/api/services/references");
      const list = res.data?.data || res.data || [];
      references.value = list.map((r: any) => ({ id: r.id, name: r.name }));
    }

    // 2. Customer Types
    if (masterStore.customerTypes && masterStore.customerTypes.length > 0) {
      customerTypes.value = masterStore.customerTypes.map((t: any) => ({ id: t.id, name: t.typeName || t.name }));
    } else {
      const res = await axios.get("/api/superadmin/client-types");
      const list = res.data?.data || res.data || [];
      customerTypes.value = list.map((t: any) => ({ id: t.id, name: t.typeName || t.name }));
    }
  } catch (err) {
    console.error("Failed to load filter metadata:", err);
  }
};

// Fetch Ledger Data
const fetchLedger = async () => {
  if (!fromMonth.value || !toMonth.value) return;
  if (fromMonth.value > toMonth.value) {
    errorMessage.value = "Start month cannot be later than end month";
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";

  try {
    const params: Record<string, any> = {
      fromMonth: fromMonth.value,
      toMonth: toMonth.value
    };

    if (selectedClientId.value) {
      params.clientId = selectedClientId.value;
    }
    if (selectedCustomerTypeId.value && selectedCustomerTypeId.value !== "all") {
      params.customerTypeId = selectedCustomerTypeId.value;
    }
    if (selectedReferenceId.value && selectedReferenceId.value !== "all") {
      params.referenceId = selectedReferenceId.value;
    }

    const res = await axios.get("/api/statements/ledger", { params });
    if (res.data?.success && res.data?.data) {
      const d = res.data.data;
      summary.value = d.summary || {
        totalClients: 0,
        openingBalance: 0,
        totalBilled: 0,
        totalPaid: 0,
        closingBalance: 0
      };
      clientSummaries.value = d.clientSummaries || [];
      transactions.value = d.transactions || [];
    } else {
      clientSummaries.value = [];
      transactions.value = [];
    }
  } catch (err: any) {
    console.error("Failed to load client ledger statement:", err);
    errorMessage.value = err.response?.data?.message || "Failed to load client ledger statement";
    clientSummaries.value = [];
    transactions.value = [];
  } finally {
    isLoading.value = false;
  }
};

// Watchers
watch([fromMonth, toMonth, selectedClientId, selectedCustomerTypeId, selectedReferenceId], () => {
  fetchLedger();
});

// Realtime Pulse Listener
usePulseListener("billing.invoice.updated", () => fetchLedger());
usePulseListener("collection:created", () => fetchLedger());
usePulseListener("billing:updated", () => fetchLedger());

onMounted(() => {
  loadMasterData();
  fetchLedger();
});

// Reset Filters
const handleReset = () => {
  fromMonth.value = getLastMonth();
  toMonth.value = getLastMonth();
  selectedClientId.value = null;
  selectedCustomerTypeId.value = "all";
  selectedReferenceId.value = "all";
};

// Select client from reference summary table
const handleSelectClient = (clientId: number) => {
  selectedClientId.value = clientId;
};

// Back to overview list
const handleBackToOverview = () => {
  selectedClientId.value = null;
};

// Print
const handlePrint = () => {
  window.print();
};

// Export to Excel
const handleExport = () => {
  if (selectedClientId.value && activeClientSummary.value) {
    // Export single client transaction ledger
    const rows = transactions.value.map((t) => ({
      Date: t.date,
      "Tax Period": t.taxPeriod,
      Particulars: t.description,
      "Ref No": t.refNo,
      "Billed (Debit)": t.debit,
      "Paid (Credit)": t.credit,
      "Balance (Tk)": t.balance,
      Status: t.status
    }));

    const safeName = activeClientSummary.value.companyName.replace(/[^a-zA-Z0-9_-]/g, "_");
    exportSingleSheet(rows, "Client Ledger", `Ledger_${safeName}_${fromMonth.value}_to_${toMonth.value}.xlsx`);
  } else {
    // Export multi-client overview
    const rows = clientSummaries.value.map((cl, i) => ({
      "#": i + 1,
      Client: cl.companyName,
      BIN: cl.binNumber,
      Mobile: cl.mobile,
      Reference: cl.referenceName,
      "Opening (Tk)": cl.openingBalance,
      "Billed (Tk)": cl.totalBilled,
      "Paid (Tk)": cl.totalPaid,
      "Closing Due (Tk)": cl.closingBalance
    }));

    const refTag = activeReferenceName.value ? `_${activeReferenceName.value}` : "";
    exportSingleSheet(rows, "Client Ledger Summary", `Ledger_Overview${refTag}_${fromMonth.value}_to_${toMonth.value}.xlsx`);
  }
};
</script>

<template>
  <div class="billing-ledger-tab">
    <!-- Filter Bar -->
    <LedgerFilterBar
      v-model:client-id="selectedClientId"
      v-model:customer-type-id="selectedCustomerTypeId"
      v-model:reference-id="selectedReferenceId"
      v-model:from-month="fromMonth"
      v-model:to-month="toMonth"
      :customer-types="customerTypes"
      :references="references"
      :is-loading="isLoading"
      :can-export="canExport"
      @reset="handleReset"
      @export="handleExport"
      @print="handlePrint"
    />

    <!-- Error Alert -->
    <div v-if="errorMessage" class="alert alert-danger py-2 small mb-3 d-flex align-items-center gap-2">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Summary KPI Cards -->
    <LedgerSummaryCards :summary="summary" />

    <!-- Loading State -->
    <div v-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading statement...</span>
      </div>
      <div class="text-muted small mt-2">Computing running balances & transactions...</div>
    </div>

    <!-- Main Content Views -->
    <div v-else>
      <!-- View 1: Single Client Transaction Ledger -->
      <div v-if="selectedClientId">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
            @click="handleBackToOverview"
          >
            <i class="bi bi-arrow-left"></i>
            <span>Back to All Clients Overview</span>
          </button>
          <span class="badge bg-secondary bg-opacity-25 text-info border border-secondary border-opacity-25 px-2 py-1">
            Single Client Detailed Ledger
          </span>
        </div>

        <LedgerTransactionsTable
          :transactions="transactions"
          :client="activeClientSummary"
          :from-month="fromMonth"
          :to-month="toMonth"
        />
      </div>

      <!-- View 2: Multi-Client Overview Table (All or Reference Filtered) -->
      <div v-else>
        <ReferenceSummaryTable
          :client-summaries="clientSummaries"
          :summary="summary"
          :from-month="fromMonth"
          :to-month="toMonth"
          :selected-reference-name="activeReferenceName"
          @select-client="handleSelectClient"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  .ledger-filter-bar,
  .btn,
  .badge {
    display: none !important;
  }
  .card {
    border: 1px solid #000 !important;
    background: transparent !important;
    color: #000 !important;
  }
}
</style>
