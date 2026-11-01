<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import axios from "axios";
import MonthNavigator from "@/components/MonthNavigator.vue";
import { pulse } from "@/plugins/pulse";

interface UnitConversion {
  id: number;
  purchaseUnit: string;
  salesUnit: string;
  factor: number;
}

interface ClientSummaryItem {
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
  rows: any[];
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

// Query & Loading State
const isLoading = ref(false);
const clientSummaries = ref<ClientSummaryItem[]>([]);

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
  return clientSummaries.value.reduce((acc, cs) => acc + (Number(cs.totalQty) || 0), 0);
});

const grandTotalBeCount = computed(() => {
  return clientSummaries.value.reduce((acc, cs) => acc + (Number(cs.totalBeCount) || 0), 0);
});

const grandTotalSubmissions = computed(() => {
  return clientSummaries.value.reduce((acc, cs) => acc + (Number(cs.submittedCount) || 0), 0);
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

// Fetch Summary Data for all matching clients
const loadSummaryData = async () => {
  if (!fromMonth.value || !toMonth.value || dateRangeError.value) {
    clientSummaries.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const params: Record<string, any> = {
      fromMonth: fromMonth.value,
      toMonth: toMonth.value
    };

    if (selectedCustomerTypeId.value !== "all") {
      params.customerTypeId = selectedCustomerTypeId.value;
    }
    if (selectedReferenceId.value !== "all") {
      params.referenceId = selectedReferenceId.value;
    }

    const res = await axios.get("/api/statements", { params });
    if (res.data?.success) {
      clientSummaries.value = res.data.clientSummaries || [];
    } else {
      clientSummaries.value = [];
    }
  } catch (err) {
    console.error("Failed to load statement summary:", err);
    clientSummaries.value = [];
  } finally {
    isLoading.value = false;
  }
};

// Reset Filters
const resetFilters = () => {
  fromMonth.value = getDefaultFromMonth();
  toMonth.value = getCurrentMonth();
  selectedCustomerTypeId.value = "all";
  selectedReferenceId.value = "all";
  selectedUnitId.value = null;
  loadSummaryData();
};

// Export to Excel (Summary list)
const exportToExcel = async () => {
  if (clientSummaries.value.length === 0) return;

  const XLSX = await import("xlsx");
  const rows: any[] = [];
  const fromLabel = formatMonthDisplay(fromMonth.value).replace(/\s+/g, "_");
  const toLabel = formatMonthDisplay(toMonth.value).replace(/\s+/g, "_");
  const unitLabel = selectedUnitConversion.value
    ? ` (${selectedUnitConversion.value.salesUnit})`
    : "";

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
};

// Watchers
watch([fromMonth, toMonth, selectedCustomerTypeId, selectedReferenceId], () => {
  loadSummaryData();
});

onMounted(() => {
  fetchMasterData();
  loadSummaryData();

  pulse.channel("auth").listen("purchase:uploaded", () => loadSummaryData());
  pulse.channel("auth").listen("submission:updated", () => loadSummaryData());
});
</script>

<template>
  <div class="statements-summary-page">
    <!-- Header -->
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/dashboard" class="btn btn-sm btn-link text-muted p-0 text-decoration-none">
            <i class="bi bi-arrow-left"></i> Dashboard
          </router-link>
          <span class="text-muted">/</span>
          <router-link to="/admin/statements" class="btn btn-sm btn-link text-muted p-0 text-decoration-none">
            Statement
          </router-link>
          <span class="text-muted">/</span>
          <span class="text-white small fw-medium">Summary</span>
        </div>
        <h4 class="text-white fw-bold mb-0">Clients Purchase &amp; Submission Summary</h4>
      </div>

      <div class="d-flex align-items-center gap-2">
        <!-- 1. Back to Single Statement -->
        <router-link
          to="/admin/statements"
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2 px-3 text-decoration-none"
        >
          <i class="bi bi-arrow-left"></i> Client Statement
        </router-link>

        <!-- 2. Reset Filters -->
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2 px-3"
          @click="resetFilters"
        >
          <i class="bi bi-arrow-counterclockwise"></i> Reset Filters
        </button>

        <!-- 3. Export Summary Excel -->
        <button
          type="button"
          class="btn btn-sm btn-success d-flex align-items-center gap-2 px-3 fw-medium"
          :disabled="clientSummaries.length === 0 || isLoading"
          @click="exportToExcel"
        >
          <i class="bi bi-file-earmark-excel"></i> Export Summary Excel
        </button>
      </div>
    </div>

    <!-- Toolbar / Filter Bar (No individual client selector needed here) -->
    <div class="filter-panel p-3 rounded-3 mb-4">
      <div class="d-flex align-items-center flex-wrap gap-2">
        <!-- 1. From Month Navigator -->
        <div style="width: 155px; flex-shrink: 0;">
          <MonthNavigator v-model="fromMonth" />
        </div>

        <!-- 2. 'to' separator -->
        <div class="text-center px-1">
          <span class="text-muted small fw-medium">to</span>
        </div>

        <!-- 3. To Month Navigator -->
        <div style="width: 155px; flex-shrink: 0;">
          <MonthNavigator v-model="toMonth" />
        </div>

        <!-- 4. Unit Conversion Dropdown -->
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

        <!-- 5. Client Type Filter -->
        <div style="width: 135px; flex-shrink: 0;">
          <select v-model="selectedCustomerTypeId" class="form-select filter-select w-100">
            <option value="all">All Types</option>
            <option v-for="ct in customerTypes" :key="ct.id" :value="ct.id">
              {{ ct.typeName }}
            </option>
          </select>
        </div>

        <!-- 6. Reference Filter -->
        <div style="width: 175px; flex-shrink: 0;">
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

    <!-- State 1: Loading State -->
    <div v-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading summary...</span>
      </div>
      <p class="text-muted mt-2 small">Loading client summary records...</p>
    </div>

    <!-- State 2: Empty State -->
    <div v-else-if="clientSummaries.length === 0" class="text-center py-5 rounded-3 border border-secondary border-opacity-25 bg-dark p-5">
      <i class="bi bi-file-earmark-x text-muted display-4"></i>
      <h5 class="text-white mt-3">No Records Found</h5>
      <p class="text-muted small mb-0">
        No purchases or return submissions found for the selected month range or filter criteria.
      </p>
    </div>

    <!-- State 3: Summary Table -->
    <div v-else class="table-container rounded-3 border border-secondary border-opacity-25 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-dark table-hover mb-0 align-middle statement-table">
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.statements-summary-page {
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

.grand-total-row td {
  background-color: #0f1216 !important;
  border-top: 2px solid #3b8eed;
  padding: 0.85rem 1rem;
}
</style>
