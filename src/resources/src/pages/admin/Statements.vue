<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import axios from "axios";
import MonthNavigator from "@/components/MonthNavigator.vue";
import ClientSearchSelect, { type ClientOption } from "@/components/common/ClientSearchSelect.vue";
import { pulse } from "@/plugins/pulse";

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
  d.setMonth(d.getMonth() - 5); // Default 6 months range
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Filter State
const fromMonth = ref(getDefaultFromMonth());
const toMonth = ref(getCurrentMonth());
const selectedClientId = ref<number | null>(null);
const selectedCustomerTypeId = ref<string>("all");
const selectedReferenceId = ref<string>("all");

// Options Data
const customerTypes = ref<any[]>([]);
const clientReferences = ref<any[]>([]);
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

// View Mode: 'details' (month-by-month table) or 'summary' (client-wise grand total summary)
const viewMode = ref<"details" | "summary">("details");

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

// Grand Totals
const grandTotalQty = computed(() => {
  return statementRows.value.reduce((acc, row) => acc + (Number(row.totalQty) || 0), 0);
});

const grandTotalBeCount = computed(() => {
  return statementRows.value.reduce((acc, row) => acc + (Number(row.beCount) || 0), 0);
});

const grandTotalSubmissions = computed(() => {
  return statementRows.value.filter((row) => !!row.submissionId).length;
});

// Fetch Filter Master Data
const fetchMasterData = async () => {
  try {
    const [ctRes, crRes, ucRes] = await Promise.allSettled([
      axios.get("/api/services/customer-types"),
      axios.get("/api/services/references"),
      axios.get("/api/superadmin/unit-conversions", { params: { all: "true" } })
    ]);

    if (ctRes.status === "fulfilled" && ctRes.value.data?.data) {
      customerTypes.value = ctRes.value.data.data;
    }
    if (crRes.status === "fulfilled" && crRes.value.data?.data) {
      clientReferences.value = crRes.value.data.data;
    }
    if (ucRes.status === "fulfilled" && ucRes.value.data?.data) {
      unitConversions.value = ucRes.value.data.data.map((u: any) => ({
        id: u.id,
        purchaseUnit: u.purchaseUnit,
        salesUnit: u.salesUnit,
        factor: Number(u.factor || 1)
      }));
    }
  } catch (err) {
    console.error("Failed to load master data:", err);
  }
};

// Fetch Statement Data (Requires Client Selection to save server load)
const loadStatementData = async () => {
  if (!selectedClientId.value) {
    statementRows.value = [];
    clientSummaries.value = [];
    isLoading.value = false;
    return;
  }

  if (!fromMonth.value || !toMonth.value) return;

  if (dateRangeError.value) {
    statementRows.value = [];
    clientSummaries.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const params: Record<string, any> = {
      fromMonth: fromMonth.value,
      toMonth: toMonth.value,
      clientId: selectedClientId.value
    };

    if (selectedCustomerTypeId.value !== "all") {
      params.customerTypeId = selectedCustomerTypeId.value;
    }
    if (selectedReferenceId.value !== "all") {
      params.referenceId = selectedReferenceId.value;
    }

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

// Clear All Filters
const resetFilters = () => {
  fromMonth.value = getDefaultFromMonth();
  toMonth.value = getCurrentMonth();
  selectedClientId.value = null;
  selectedCustomerTypeId.value = "all";
  selectedReferenceId.value = "all";
  selectedUnitId.value = null;
  statementRows.value = [];
  clientSummaries.value = [];
};

// Export to Excel (Exports Summary if viewMode === 'summary', else Details)
const exportToExcel = async () => {
  if (clientSummaries.value.length === 0) return;

  const XLSX = await import("xlsx");
  const rows: any[] = [];
  const fromLabel = formatMonthDisplay(fromMonth.value).replace(/\s+/g, "_");
  const toLabel = formatMonthDisplay(toMonth.value).replace(/\s+/g, "_");
  const unitLabel = selectedUnitConversion.value
    ? ` (${selectedUnitConversion.value.salesUnit})`
    : "";

  if (viewMode.value === "summary") {
    // ── SUMMARY EXCEL EXPORT ──
    for (const cs of clientSummaries.value) {
      rows.push({
        "Client Name": cs.client.companyName,
        "BIN Number": cs.client.binNumber || "BIN Not Set",
        "Total Months": cs.rows.length,
        [`Total Qty${unitLabel}`]: Number(((Number(cs.totalQty) || 0) * currentConvFactor.value).toFixed(3)),
        "Total B/E Count": cs.totalBeCount,
        "Submissions": `${cs.submittedCount} / ${cs.rows.length} Submitted`
      });
    }

    // Grand Total Row
    rows.push({
      "Client Name": "GRAND TOTAL",
      "BIN Number": "",
      "Total Months": `${clientSummaries.value.length} Clients`,
      [`Total Qty${unitLabel}`]: Number((grandTotalQty.value * currentConvFactor.value).toFixed(3)),
      "Total B/E Count": grandTotalBeCount.value,
      "Submissions": `${grandTotalSubmissions.value} Total Submissions`
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement Summary");
    XLSX.writeFile(wb, `Statement_Summary_${fromLabel}_to_${toLabel}.xlsx`);
  } else {
    // ── DETAILS EXCEL EXPORT ──
    for (const cs of clientSummaries.value) {
      for (const r of cs.rows) {
        rows.push({
          "Client Name": r.companyName,
          "BIN Number": r.binNumber || "BIN Not Set",
          "Month": formatMonthDisplay(r.month),
          [`Total Qty${unitLabel}`]: Number(((Number(r.totalQty) || 0) * currentConvFactor.value).toFixed(3)),
          "B/E Count": r.beCount,
          "Submission ID": r.submissionId || "Not Submitted"
        });
      }

      // Add Client Subtotal Row
      rows.push({
        "Client Name": `Subtotal (${cs.client.companyName})`,
        "BIN Number": cs.client.binNumber || "",
        "Month": `${cs.rows.length} Months`,
        [`Total Qty${unitLabel}`]: Number(((Number(cs.totalQty) || 0) * currentConvFactor.value).toFixed(3)),
        "B/E Count": cs.totalBeCount,
        "Submission ID": `${cs.submittedCount} Submitted`
      });

      rows.push({});
    }

    // Grand Total Row
    rows.push({
      "Client Name": "GRAND TOTAL",
      "BIN Number": "",
      "Month": `${statementRows.value.length} Records`,
      [`Total Qty${unitLabel}`]: Number((grandTotalQty.value * currentConvFactor.value).toFixed(3)),
      "B/E Count": grandTotalBeCount.value,
      "Submission ID": `${grandTotalSubmissions.value} Submitted`
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement Details");
    XLSX.writeFile(wb, `Statement_Details_${fromLabel}_to_${toLabel}.xlsx`);
  }
};

// Watchers
watch([fromMonth, toMonth, selectedClientId, selectedCustomerTypeId, selectedReferenceId], () => {
  loadStatementData();
});

onMounted(() => {
  fetchMasterData();
  loadStatementData();

  // Real-time synchronization
  pulse.channel("auth").listen("purchase:uploaded", () => loadStatementData());
  pulse.channel("auth").listen("submission:updated", () => loadStatementData());
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

        <!-- 2. View Summary / View Details Button (placed after Reset Filters) -->
        <button
          type="button"
          class="btn btn-sm d-flex align-items-center gap-2 px-3 fw-medium"
          :class="viewMode === 'summary' ? 'btn-primary' : 'btn-outline-primary'"
          @click="viewMode = viewMode === 'summary' ? 'details' : 'summary'"
        >
          <i class="bi" :class="viewMode === 'summary' ? 'bi-list-ul' : 'bi-card-checklist'"></i>
          {{ viewMode === 'summary' ? 'View Details' : 'View Summary' }}
        </button>

        <!-- 3. Export Excel Button -->
        <button
          type="button"
          class="btn btn-sm btn-success d-flex align-items-center gap-2 px-3 fw-medium"
          :disabled="statementRows.length === 0 || isLoading"
          @click="exportToExcel"
        >
          <i class="bi bi-file-earmark-excel"></i>
          {{ viewMode === 'summary' ? 'Export Summary Excel' : 'Export Excel' }}
        </button>
      </div>
    </div>

    <!-- Toolbar / Filter Bar -->
    <div class="filter-panel p-3 rounded-3 mb-4">
      <div class="d-flex align-items-center flex-wrap gap-2">
        <!-- 1. Client / BIN Search -->
        <div class="flex-grow-1" style="min-width: 240px;">
          <ClientSearchSelect
            v-model="selectedClientId"
            placeholder="Type to search Client or BIN..."
            :remote="true"
          />
        </div>

        <!-- 2. From Month Navigator -->
        <div style="width: 150px; flex-shrink: 0;">
          <MonthNavigator v-model="fromMonth" />
        </div>

        <!-- 3. 'to' separator -->
        <div class="text-center px-1">
          <span class="text-muted small fw-medium">to</span>
        </div>

        <!-- 4. To Month Navigator -->
        <div style="width: 150px; flex-shrink: 0;">
          <MonthNavigator v-model="toMonth" />
        </div>

        <!-- 5. Unit Conversion Dropdown -->
        <div style="width: 135px; flex-shrink: 0;">
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

        <!-- 6. Client Type Filter (Compact fit for Types) -->
        <div style="width: 130px; flex-shrink: 0;">
          <select v-model="selectedCustomerTypeId" class="form-select filter-select w-100">
            <option value="all">All Types</option>
            <option v-for="ct in customerTypes" :key="ct.id" :value="ct.id">
              {{ ct.typeName }}
            </option>
          </select>
        </div>

        <!-- 7. Reference Filter (Wider fit for names e.g. Mr. Samu...) -->
        <div style="width: 165px; flex-shrink: 0;">
          <select v-model="selectedReferenceId" class="form-select filter-select w-100">
            <option value="all">All References</option>
            <option v-for="refItem in clientReferences" :key="refItem.id" :value="refItem.id">
              {{ refItem.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Date Range Error Alert -->
      <div v-if="dateRangeError" class="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 mt-3 mb-0 small">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>{{ dateRangeError }}</span>
      </div>
    </div>

    <!-- Prompt State: When no client is selected yet -->
    <div v-if="!selectedClientId" class="text-center py-5 rounded-3 border border-secondary border-opacity-25 bg-dark p-5">
      <i class="bi bi-buildings text-primary display-4 opacity-75"></i>
      <h5 class="text-white mt-3">Please Select a Client</h5>
      <p class="text-muted small mb-0">
        Search and select a client or BIN from the filter above to generate their statement.
      </p>
    </div>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading statements...</span>
      </div>
      <p class="text-muted mt-2 small">Loading statement records...</p>
    </div>

    <!-- Empty State: Client is selected but has no records -->
    <div v-else-if="clientSummaries.length === 0" class="text-center py-5 rounded-3 border border-secondary border-opacity-25 bg-dark p-5">
      <i class="bi bi-file-earmark-x text-muted display-4"></i>
      <h5 class="text-white mt-3">No Statement Records Found</h5>
      <p class="text-muted small mb-0">
        No purchases or return submissions found for this client within the selected month range.
      </p>
    </div>

    <!-- Statement Table (Summary View vs Details View) -->
    <div v-else class="table-container rounded-3 border border-secondary border-opacity-25 overflow-hidden">
      <div class="table-responsive">
        <!-- ── 1. SUMMARY VIEW (One row per client with grand totals) ── -->
        <table v-if="viewMode === 'summary'" class="table table-dark table-hover mb-0 align-middle statement-table">
          <thead>
            <tr class="table-header-row text-uppercase">
              <th style="width: 32%; min-width: 260px;">ক্লায়েন্ট নাম</th>
              <th style="width: 18%; min-width: 160px;">বিন নম্বর</th>
              <th class="text-center" style="width: 14%; min-width: 120px;">মোট মাস</th>
              <th class="text-end" style="width: 18%; min-width: 150px;">টোটাল কোয়ান্টিটি</th>
              <th class="text-center" style="width: 18%; min-width: 150px;">বিল অব এন্টির সংখ্যা</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cs in clientSummaries" :key="cs.client.id" class="statement-row">
              <td class="fw-semibold text-white">
                {{ cs.client.companyName }}
              </td>
              <td class="font-monospace text-info small fw-medium">
                {{ cs.client.binNumber || 'BIN Not Set' }}
              </td>
              <td class="text-center text-light small fw-medium">
                {{ cs.rows.length }} মাস
              </td>
              <td class="text-end fw-bold text-white">
                {{ formatQty(cs.totalQty) }}
              </td>
              <td class="text-center fw-bold text-white">
                <span v-if="cs.totalBeCount > 0" class="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25 px-2 py-1">
                  {{ cs.totalBeCount }} B/E
                </span>
                <span v-else class="text-muted small">-</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="grand-total-row">
              <td colspan="2" class="fw-bolder text-white fs-6">
                GRAND TOTAL
              </td>
              <td class="text-center text-muted small fw-bold">
                {{ clientSummaries.length }} Clients
              </td>
              <td class="text-end fw-bolder text-warning fs-6">
                {{ formatQty(grandTotalQty) }}
              </td>
              <td class="text-center fw-bolder text-warning fs-6">
                {{ grandTotalBeCount }} B/E
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- ── 2. DETAILS VIEW (Month-by-month table) ── -->
        <table v-else class="table table-dark table-hover mb-0 align-middle statement-table">
          <thead>
            <tr class="table-header-row text-uppercase">
              <th style="width: 30%; min-width: 260px;">ক্লায়েন্ট নাম</th>
              <th style="width: 17%; min-width: 160px;">বিন নম্বর</th>
              <th style="width: 17%; min-width: 140px;">মাস</th>
              <th class="text-end" style="width: 18%; min-width: 150px;">টোটাল কোয়ান্টিটি</th>
              <th class="text-center" style="width: 18%; min-width: 150px;">বিল অব এন্টির সংখ্যা</th>
              <th style="width: 18%; min-width: 160px;">সাবমিশন আইডি</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="cs in clientSummaries" :key="cs.client.id">
              <!-- Rows for this Client -->
              <tr v-for="(row, idx) in cs.rows" :key="`${cs.client.id}_${row.month}`" class="statement-row">
                <!-- 1. Client Name (only shown on first row of client, clean indentation for later rows) -->
                <td>
                  <span v-if="idx === 0" class="fw-semibold text-white d-block">
                    {{ row.companyName }}
                  </span>
                  <span v-else class="ps-3 text-muted small opacity-50">
                    ↳ {{ row.companyName }}
                  </span>
                </td>

                <!-- 2. BIN Number (Clean dedicated column) -->
                <td>
                  <span v-if="idx === 0" class="font-monospace text-info small fw-medium">
                    {{ row.binNumber || 'BIN Not Set' }}
                  </span>
                </td>

                <!-- 3. Month -->
                <td>
                  <span class="fw-medium text-light">{{ formatMonthDisplay(row.month) }}</span>
                </td>

                <!-- 4. Total Quantity -->
                <td class="text-end">
                  <span :class="row.totalQty > 0 ? 'text-white fw-semibold' : 'text-muted'">
                    {{ formatQty(row.totalQty) }}
                  </span>
                </td>

                <!-- 5. B/E Count -->
                <td class="text-center">
                  <span v-if="row.beCount > 0" class="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25 px-2 py-1">
                    {{ row.beCount }} B/E
                  </span>
                  <span v-else class="text-muted small">-</span>
                </td>

                <!-- 6. Submission ID -->
                <td>
                  <span v-if="row.submissionId" class="font-monospace text-warning fw-semibold">
                    {{ row.submissionId }}
                  </span>
                  <span v-else class="text-muted small fst-italic">
                    Not Submitted
                  </span>
                </td>
              </tr>

              <!-- Subtotal Row for Client -->
              <tr class="subtotal-row">
                <td colspan="2" class="fw-bold text-info">
                  <i class="bi bi-arrow-return-right me-1"></i> Subtotal: {{ cs.client.companyName }}
                </td>
                <td class="text-muted small fw-semibold">
                  {{ cs.rows.length }} Months
                </td>
                <td class="text-end fw-bold text-info">
                  {{ formatQty(cs.totalQty) }}
                </td>
                <td class="text-center fw-bold text-info">
                  {{ cs.totalBeCount }} B/E
                </td>
                <td class="text-muted small">
                  <span class="text-success fw-medium">{{ cs.submittedCount }}</span> / {{ cs.rows.length }} Submitted
                </td>
              </tr>
            </template>
          </tbody>

          <!-- Grand Total Footer -->
          <tfoot>
            <tr class="grand-total-row">
              <td colspan="2" class="fw-bolder text-white fs-6">
                GRAND TOTAL
              </td>
              <td class="text-muted small fw-bold">
                {{ statementRows.length }} Records
              </td>
              <td class="text-end fw-bolder text-warning fs-6">
                {{ formatQty(grandTotalQty) }}
              </td>
              <td class="text-center fw-bolder text-warning fs-6">
                {{ grandTotalBeCount }} B/E
              </td>
              <td class="fw-bold text-white">
                <span class="text-success">{{ grandTotalSubmissions }}</span> of {{ statementRows.length }} Submissions
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

.filter-select {
  background-color: #181b1f;
  border: 1px solid #3b424b;
  color: #f8f9fa;
  height: 38px;
  font-size: 0.85rem;
  border-radius: 6px;
}

.filter-select:focus {
  border-color: #3b8eed;
  box-shadow: 0 0 0 0.2rem rgba(59, 142, 237, 0.25);
  background-color: #181b1f;
  color: #fff;
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

.subtotal-row td {
  background-color: #15191e !important;
  border-top: 1px solid #30363d;
  border-bottom: 2px solid #374151;
  padding: 0.65rem 1rem;
}

.grand-total-row td {
  background-color: #0f1216 !important;
  border-top: 2px solid #3b8eed;
  padding: 0.85rem 1rem;
}
</style>
