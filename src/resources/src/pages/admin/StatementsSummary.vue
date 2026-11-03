<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { usePagination } from "@/composables/usePagination";
import axios from "axios";
import MonthNavigator from "@/components/MonthNavigator.vue";
import IdpSelect from "@/components/common/IdpSelect.vue";
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
  activityMonths?: number;
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


// Dropdown Options for IdpSelect
const customerTypeOptions = computed(() => [
  { value: "all", label: "All Types" },
  ...customerTypes.value.map((ct) => ({ value: ct.id, label: ct.typeName }))
]);

const referenceOptions = computed(() => [
  { value: "all", label: "All References" },
  ...clientReferences.value.map((ref) => ({ value: ref.id, label: ref.name }))
]);

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

// Pagination Setup
const totalSummariesCount = computed(() => clientSummaries.value.length);
const { currentPage, itemsPerPage, totalPages, paginateList } = usePagination("statements_summary", {
  defaultPerPage: 15,
  totalItems: totalSummariesCount
});

const paginatedSummaries = computed(() => paginateList(clientSummaries.value));

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
  currentPage.value = 1;
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

  let sl = 1;
  for (const cs of clientSummaries.value) {
    rows.push({
      "SL": sl++,
      "Client Name": cs.client.companyName,
      "BIN Number": cs.client.binNumber || "BIN Not Set",
      "Total Tax Period": cs.rows.length,
      "Total Activity Months": cs.activityMonths ?? cs.rows.filter((r) => (r.totalQty > 0 || r.beCount > 0)).length,
      [`Total Qty${unitLabel}`]: Number(((Number(cs.totalQty) || 0) * currentConvFactor.value).toFixed(3)),
      "Total B/E Count": cs.totalBeCount,
      "Submitted Months": cs.submittedCount
    });
  }

  // Grand Total Row
  rows.push({
    "SL": "",
    "Client Name": "GRAND TOTAL",
    "BIN Number": "",
    "Total Tax Period": "",
    "Total Activity Months": "", 
    [`Total Qty${unitLabel}`]: Number((grandTotalQty.value * currentConvFactor.value).toFixed(3)),
    "Total B/E Count": grandTotalBeCount.value,
    "Submitted Months": grandTotalSubmissions.value
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Set explicit generous column widths (no compressed text)
  ws["!cols"] = [
    { wch: 8 },  // SL
    { wch: 38 }, // Client Name
    { wch: 20 }, // BIN Number
    { wch: 18 }, // Total Tax Period
    { wch: 22 }, // Total Activity Months
    { wch: 18 }, // Total Qty
    { wch: 16 }, // Total B/E Count
    { wch: 18 }  // Submitted Months
  ];

  // Configure A4 Landscape page setup for clean printing
  ws["!pageSetup"] = {
    orientation: "landscape",
    paperSize: 9, // A4
    fitToWidth: 1,
    fitToHeight: 0
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Statement Summary");
  XLSX.writeFile(wb, `Statement_Summary_${fromLabel}_to_${toLabel}.xlsx`);
};

// Watchers
watch([fromMonth, toMonth, selectedCustomerTypeId, selectedReferenceId], () => {
  currentPage.value = 1;
  loadSummaryData();
});

onMounted(() => {
  fetchMasterData();
  loadSummaryData();

  pulse.channel("auth").listen("purchase:uploaded", () => loadSummaryData());
  pulse.channel("auth").listen("submission:updated", () => loadSummaryData());
});

onUnmounted(() => {
  pulse.channel("auth").stopListening("purchase:uploaded");
  pulse.channel("auth").stopListening("submission:updated");
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


    </div>

    <!-- Toolbar / Filter Bar with Action Buttons inline -->
    <div class="filter-panel p-2 px-3 rounded-3 mb-4">
      <div class="d-flex align-items-center flex-wrap gap-2">
        <!-- 1. From Month Navigator -->
        <div style="width: 175px; flex-shrink: 0;">
          <MonthNavigator v-model="fromMonth" />
        </div>

        <!-- 2. 'to' separator -->
        <div class="text-center px-1">
          <span class="text-muted small fw-medium">to</span>
        </div>

        <!-- 3. To Month Navigator -->
        <div style="width: 175px; flex-shrink: 0;">
          <MonthNavigator v-model="toMonth" />
        </div>

        <!-- 4. Unit Conversion Dropdown -->
        <div style="width: 140px; flex-shrink: 0;">
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
        <IdpSelect
          v-model="selectedCustomerTypeId"
          :options="customerTypeOptions"
          min-width="140px"
        />

        <!-- 6. Reference Filter -->
        <IdpSelect
          v-model="selectedReferenceId"
          :options="referenceOptions"
          min-width="170px"
        />

        <!-- 7. Compact Action Buttons (Reset & Excel) aligned inline -->
        <div class="d-flex align-items-center gap-2 ms-auto flex-shrink-0">
          <button
            type="button"
            class="btn btn-outline-secondary d-flex align-items-center justify-content-center p-0"
            style="width: 38px; height: 38px; border-radius: 6px;"
            title="Reset Filters"
            @click="resetFilters"
          >
            <i class="bi bi-arrow-counterclockwise fs-6"></i>
          </button>
          <button
            type="button"
            class="btn btn-success d-flex align-items-center gap-2 px-3 fw-medium"
            style="height: 38px; border-radius: 6px;"
            :disabled="clientSummaries.length === 0 || isLoading"
            title="Download Summary as Excel"
            @click="exportToExcel"
          >
            <i class="bi bi-file-earmark-excel"></i>
            <span>Excel</span>
          </button>
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
              <th style="width: 30%; min-width: 250px;">Client Name</th>
              <th style="width: 16%; min-width: 150px;">BIN Number</th>
              <th class="text-center" style="width: 14%; min-width: 120px;">Total Tax Period</th>
              <th class="text-center" style="width: 14%; min-width: 130px;">Total Activity Months</th>
              <th class="text-end" style="width: 14%; min-width: 140px;">Total Quantity</th>
              <th class="text-center" style="width: 12%; min-width: 120px;">Total B/E Count</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cs in paginatedSummaries" :key="cs.client.id" class="statement-row">
              <td class="fw-semibold text-white">
                {{ cs.client.companyName }}
              </td>
              <td class="font-monospace text-info small fw-medium">
                {{ cs.client.binNumber || 'BIN Not Set' }}
              </td>
              <td class="text-center text-light small fw-medium">
                {{ cs.rows.length }} Months
              </td>
              <td class="text-center text-light small fw-medium">
                {{ cs.activityMonths ?? cs.rows.filter((r) => (r.totalQty > 0 || r.beCount > 0)).length }} Months
              </td>
              <td class="text-end text-light small fw-medium">
                {{ formatQty(cs.totalQty) }}
              </td>
              <td class="text-center text-light small fw-medium">
                {{ cs.totalBeCount > 0 ? cs.totalBeCount + ' B/E' : '-' }}
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
              <td class="text-center text-muted small fw-bold">
                -
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

    <!-- Pagination Controls -->
    <div v-if="clientSummaries.length > 0" class="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-2">
      <div class="d-flex align-items-center gap-2">
        <span class="text-muted small">
          Showing <strong>{{ (currentPage - 1) * itemsPerPage + 1 }}</strong> to
          <strong>{{ Math.min(currentPage * itemsPerPage, clientSummaries.length) }}</strong> of
          <strong>{{ clientSummaries.length }}</strong> clients
        </span>
        <select
          v-model="itemsPerPage"
          class="form-select form-select-sm bg-dark border-secondary text-white ms-2"
          style="width: 80px;"
        >
          <option :value="15">15</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </div>

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
