<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ClientSearchSelect from "@/components/common/ClientSearchSelect.vue";
import MonthNavigator from "@/components/MonthNavigator.vue";
import { useExcelExport } from "@/composables/useExcelExport";
import { usePulseListener } from "@/composables/usePulseListener";

const { exportSingleSheet } = useExcelExport();

interface UnitConversion {
  id: number;
  purchaseUnit: string;
  salesUnit: string;
  factor: number;
}

interface StatementRow {
  clientId: number;
  companyName: string;
  binNumber: string;
  customerTypeName: string;
  referenceName: string;
  month: string;
  totalQty: number;
  beCount: number;
  submissionId: string;
  submissionStatus: string;
}

interface ClientSummary {
  client: {
    id: number;
    companyName: string;
    binNumber: string;
    customerTypeName: string;
    referenceName: string;
  };
  totalQty: number;
  totalBeCount: number;
  submittedCount: number;
  monthCount: number;
  rows: StatementRow[];
}

// Current date defaults
const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getDefaultFromMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Filter State
const fromMonth = ref(getDefaultFromMonth());
const toMonth = ref(getCurrentMonth());
const selectedClientId = ref<number | null>(null);

// Unit Conversions
const unitConversions = ref<UnitConversion[]>([]);
const selectedUnitId = ref<number | null>(null);
const showUnitDropdown = ref(false);

// Date Range Validation
const dateRangeError = computed(() => {
  if (fromMonth.value && toMonth.value && fromMonth.value > toMonth.value) {
    return "Start month cannot be later than end month (e.g. Oct 2026 to Nov 2026)";
  }
  return null;
});

// Query & Loading State
const isLoading = ref(false);
const statementRows = ref<StatementRow[]>([]);
const clientSummaries = ref<ClientSummary[]>([]);

// Unit conversion helper
const selectedUnitConversion = computed(() => {
  if (!selectedUnitId.value) return null;
  return unitConversions.value.find((u) => u.id === selectedUnitId.value) || null;
});

const currentConvFactor = computed(() => {
  return selectedUnitConversion.value?.factor || 1;
});

const selectedUnitName = computed(() => {
  const conv = selectedUnitConversion.value;
  return conv ? `${conv.purchaseUnit} ➔ ${conv.salesUnit}` : "Unit (Default)";
});

const formatQty = (qty: number): string => {
  const val = (Number(qty) || 0) * currentConvFactor.value;
  return val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const formatMonthDisplay = (m: string): string => {
  if (!m) return "";
  const parts = m.split("-").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return m;
  const d = new Date(parts[0], parts[1] - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

// Totals
const grandTotalQty = computed(() => {
  return statementRows.value.reduce((acc, row) => acc + (Number(row.totalQty) || 0), 0);
});

const grandTotalBeCount = computed(() => {
  return statementRows.value.reduce((acc, row) => acc + (Number(row.beCount) || 0), 0);
});

const grandTotalSubmissions = computed(() => {
  return statementRows.value.filter((row) => !!row.submissionId).length;
});

// Fetch Units Master Data
const fetchMasterData = async () => {
  try {
    const ucRes = await axios.get("/api/superadmin/unit-conversions", { params: { all: "true" } });
    if (ucRes.data?.data) {
      unitConversions.value = ucRes.data.data.map((u: any) => ({
        id: u.id,
        purchaseUnit: u.purchaseUnit,
        salesUnit: u.salesUnit,
        factor: Number(u.factor || 1)
      }));
    }
  } catch (err) {
    console.error("Failed to load units:", err);
  }
};

// Fetch Statement Data for the single selected client
const loadStatementData = async () => {
  if (!selectedClientId.value) {
    statementRows.value = [];
    clientSummaries.value = [];
    isLoading.value = false;
    return;
  }

  if (!fromMonth.value || !toMonth.value || dateRangeError.value) {
    statementRows.value = [];
    clientSummaries.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const params = {
      fromMonth: fromMonth.value,
      toMonth: toMonth.value,
      clientId: selectedClientId.value
    };

    const res = await axios.get("/api/statements", { params });
    if (res.data?.success) {
      statementRows.value = res.data.data || [];
      clientSummaries.value = res.data.clientSummaries || [];
    } else {
      statementRows.value = [];
      clientSummaries.value = [];
    }
  } catch (err) {
    console.error("Failed to load statements:", err);
    statementRows.value = [];
    clientSummaries.value = [];
  } finally {
    isLoading.value = false;
  }
};

// Clear Filters
const resetFilters = () => {
  fromMonth.value = getDefaultFromMonth();
  toMonth.value = getCurrentMonth();
  selectedClientId.value = null;
  selectedUnitId.value = null;
  statementRows.value = [];
  clientSummaries.value = [];
};

// Export to Excel (Client Month-by-month Statement)
const exportToExcel = async () => {
  if (statementRows.value.length === 0) return;

  // Using central useExcelExport composable
  const rows: any[] = [];
  const fromLabel = formatMonthDisplay(fromMonth.value).replace(/\s+/g, "_");
  const toLabel = formatMonthDisplay(toMonth.value).replace(/\s+/g, "_");
  const unitLabel = selectedUnitConversion.value ? ` (${selectedUnitConversion.value.salesUnit})` : "";

  const clientName = statementRows.value[0]?.companyName || "Client";
  const clientBin = statementRows.value[0]?.binNumber || "BIN Not Set";

  let sl = 1;
  for (const r of statementRows.value) {
    rows.push({
      SL: sl++,
      "Client Name": r.companyName,
      "BIN Number": r.binNumber || "BIN Not Set",
      Month: formatMonthDisplay(r.month),
      [`Total Qty${unitLabel}`]: Number(((Number(r.totalQty) || 0) * currentConvFactor.value).toFixed(3)),
      "B/E Count": r.beCount,
      "Submission ID": r.submissionId || "Not Submitted"
    });
  }

  // Subtotal / Total Row
  rows.push({
    SL: "",
    "Client Name": `TOTAL (${clientName})`,
    "BIN Number": clientBin,
    Month: `${statementRows.value.length} Months`,
    [`Total Qty${unitLabel}`]: Number((grandTotalQty.value * currentConvFactor.value).toFixed(3)),
    "B/E Count": grandTotalBeCount.value,
    "Submission ID": `${grandTotalSubmissions.value} of ${statementRows.value.length} Submitted`
  });

  const safeName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_");
  exportSingleSheet(rows, "Statement", `Statement_${safeName}_${fromLabel}_to_${toLabel}.xlsx`);
};

// Watchers
watch([fromMonth, toMonth, selectedClientId], () => {
  loadStatementData();
});

usePulseListener("purchase:uploaded", () => loadStatementData());
usePulseListener("submission:updated", () => loadStatementData());

onMounted(() => {
  fetchMasterData();
});
</script>

<template>
  <div class="statements-page">
    <!-- Header -->
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/dashboard" class="btn btn-sm btn-link text-muted p-0 text-decoration-none">
            <i class="bi bi-arrow-left"></i> Dashboard
          </router-link>
          <span class="text-muted">/</span>
          <span class="text-white small fw-medium">Statement</span>
        </div>
        <h4 class="text-white fw-bold mb-0">Client Purchase &amp; Submission Statement</h4>
      </div>

      <div class="d-flex align-items-center gap-2">
        <!-- 1. Reset Filters Button -->
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2 px-3"
          @click="resetFilters"
        >
          <i class="bi bi-arrow-counterclockwise"></i> Reset Filters
        </button>

        <!-- 2. View Summary Button (Navigates to dedicated Summary page) -->
        <router-link
          to="/admin/statements/summary"
          class="btn btn-sm btn-outline-primary d-flex align-items-center gap-2 px-3 fw-medium text-decoration-none"
        >
          <i class="bi bi-card-checklist"></i> View Summary
        </router-link>

        <!-- 3. Export Excel Button -->
        <button
          type="button"
          class="btn btn-sm btn-success d-flex align-items-center gap-2 px-3 fw-medium"
          :disabled="statementRows.length === 0 || isLoading"
          @click="exportToExcel"
        >
          <i class="bi bi-file-earmark-excel"></i> Export Excel
        </button>
      </div>
    </div>

    <!-- Toolbar / Filter Bar -->
    <div class="filter-panel p-3 rounded-3 mb-4">
      <div class="d-flex align-items-center flex-wrap gap-2">
        <!-- 1. Client / BIN Search -->
        <div class="flex-grow-1" style="min-width: 280px;">
          <ClientSearchSelect
            v-model="selectedClientId"
            placeholder="Type to search Client or BIN..."
            :remote="true"
          />
        </div>

        <!-- 2. From Month Navigator -->
        <div style="width: 175px; flex-shrink: 0;">
          <MonthNavigator v-model="fromMonth" />
        </div>

        <!-- 3. 'to' separator -->
        <div class="text-center px-1">
          <span class="text-muted small fw-medium">to</span>
        </div>

        <!-- 4. To Month Navigator -->
        <div style="width: 175px; flex-shrink: 0;">
          <MonthNavigator v-model="toMonth" />
        </div>

        <!-- 5. Unit Conversion Dropdown -->
        <div style="width: 145px; flex-shrink: 0;">
          <div class="position-relative">
            <div
              class="form-select unit-selector-btn d-flex align-items-center justify-content-between px-2 cursor-pointer"
              @click="showUnitDropdown = !showUnitDropdown"
              tabindex="0"
            >
              <span class="text-truncate text-white small fw-medium">
                {{ selectedUnitName }}
              </span>
            </div>
            <div
              v-if="showUnitDropdown"
              class="unit-dropdown-menu position-absolute top-100 start-0 w-100 mt-1 shadow-lg p-1 rounded-2"
            >
              <div
                class="unit-option-item p-2 rounded cursor-pointer small text-white"
                :class="{ 'active': selectedUnitId === null }"
                @mousedown="selectedUnitId = null; showUnitDropdown = false"
              >
                Unit (Default)
              </div>
              <div
                v-for="u in unitConversions"
                :key="u.id"
                class="unit-option-item p-2 rounded cursor-pointer small text-white"
                :class="{ 'active': selectedUnitId === u.id }"
                @mousedown="selectedUnitId = u.id; showUnitDropdown = false"
              >
                {{ u.purchaseUnit }} ➔ {{ u.salesUnit }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Date Range Error Alert -->
      <div v-if="dateRangeError" class="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 mt-3 mb-0 small">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>{{ dateRangeError }}</span>
      </div>
    </div>

    <!-- State 1: Prompt when no client is selected -->
    <div v-if="!selectedClientId" class="text-center py-5 rounded-3 border border-secondary border-opacity-25 bg-dark p-5">
      <i class="bi bi-buildings text-primary display-4 opacity-75"></i>
      <h5 class="text-white mt-3">Please Select a Client</h5>
      <p class="text-muted small mb-0">
        Search and select a client or BIN from the filter above to view their statement.
      </p>
    </div>

    <!-- State 2: Loading State -->
    <div v-else-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading statements...</span>
      </div>
      <p class="text-muted mt-2 small">Loading client statement records...</p>
    </div>

    <!-- State 3: Client selected but no data -->
    <div v-else-if="statementRows.length === 0" class="text-center py-5 rounded-3 border border-secondary border-opacity-25 bg-dark p-5">
      <i class="bi bi-file-earmark-x text-muted display-4"></i>
      <h5 class="text-white mt-3">No Statement Records Found</h5>
      <p class="text-muted small mb-0">
        No purchases or return submissions found for this client within the selected month range.
      </p>
    </div>

    <!-- State 4: Statement Table (Detailed month-by-month for selected client) -->
    <div v-else class="table-container rounded-3 border border-secondary border-opacity-25 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-dark table-hover mb-0 align-middle statement-table">
          <thead>
            <tr class="table-header-row text-uppercase">
              <th style="width: 30%; min-width: 250px;">Client Name</th>
              <th style="width: 17%; min-width: 160px;">BIN Number</th>
              <th style="width: 15%; min-width: 130px;">Month</th>
              <th class="text-end" style="width: 18%; min-width: 150px;">Total Quantity</th>
              <th class="text-center" style="width: 15%; min-width: 140px;">B/E Count</th>
              <th style="width: 18%; min-width: 160px;">Submission ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in statementRows" :key="row.month" class="statement-row">
              <!-- Client Name -->
              <td>
                <span v-if="idx === 0" class="fw-semibold text-white d-block">
                  {{ row.companyName }}
                </span>
                <span v-else class="ps-3 text-muted small opacity-50">
                  ↳ {{ row.companyName }}
                </span>
              </td>

              <!-- BIN Number -->
              <td>
                <span v-if="idx === 0" class="font-monospace text-info small fw-medium">
                  {{ row.binNumber || 'BIN Not Set' }}
                </span>
              </td>

              <!-- Month -->
              <td>
                <span class="fw-medium text-light">{{ formatMonthDisplay(row.month) }}</span>
              </td>

              <!-- Total Qty -->
              <td class="text-end">
                <span :class="row.totalQty > 0 ? 'text-white fw-semibold' : 'text-muted'">
                  {{ formatQty(row.totalQty) }}
                </span>
              </td>

              <!-- B/E Count -->
              <td class="text-center">
                <span v-if="row.beCount > 0" class="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25 px-2 py-1">
                  {{ row.beCount }} B/E
                </span>
                <span v-else class="text-muted small">-</span>
              </td>

              <!-- Submission ID -->
              <td>
                <span v-if="row.submissionId" class="font-monospace text-warning fw-semibold">
                  {{ row.submissionId }}
                </span>
                <span v-else class="text-muted small fst-italic">
                  Not Submitted
                </span>
              </td>
            </tr>
          </tbody>

          <!-- Table Footer / Total Row -->
          <tfoot>
            <tr class="grand-total-row">
              <td colspan="2" class="fw-bolder text-white fs-6">
                TOTAL
              </td>
              <td class="text-muted small fw-bold">
                {{ statementRows.length }} Months
              </td>
              <td class="text-end fw-bolder text-warning fs-6">
                {{ formatQty(grandTotalQty) }}
              </td>
              <td class="text-center fw-bolder text-warning fs-6">
                {{ grandTotalBeCount }} B/E
              </td>
              <td class="fw-bold text-white">
                <span class="text-success">{{ grandTotalSubmissions }}</span> of {{ statementRows.length }} Submitted
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.statements-page {
  width: 100%;
  padding-bottom: 2rem;
}

.filter-panel {
  background: #181b1f;
  border: 1px solid #30363d;
}

.unit-selector-btn {
  background-color: #181b1f;
  border: 1px solid #3b424b;
  height: 38px;
  border-radius: 6px;
  user-select: none;
}

.unit-selector-btn:hover {
  border-color: #3b8eed;
}

.unit-dropdown-menu {
  background-color: #212529;
  border: 1px solid #3b424b;
  z-index: 1050;
  max-height: 200px;
  overflow-y: auto;
}

.unit-option-item:hover,
.unit-option-item.active {
  background-color: #3b8eed;
  color: #fff !important;
}

.statement-table {
  font-size: 0.88rem;
}

.table-header-row th {
  background-color: #1a1e24;
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #30363d;
}

.statement-row td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #282e36;
}

.grand-total-row td {
  background-color: #0f1216 !important;
  border-top: 2px solid #3b8eed;
  padding: 0.85rem 1rem;
}
</style>
