<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import ClientSearchSelect from "@/components/common/ClientSearchSelect.vue";
import IdpSelect from "@/components/common/IdpSelect.vue";
import SearchInput from "@/components/common/SearchInput.vue";
import StatusBadge from "@/components/common/StatusBadge.vue";
import MonthNavigator from "@/components/MonthNavigator.vue";
import { can } from "@/composables/useAuth";
import { useExcelExport } from "@/composables/useExcelExport";
import { usePagination } from "@/composables/usePagination";
import { usePulseListener } from "@/composables/usePulseListener";
import { useServicesApi } from "@/composables/useServicesApi";
import { type SubmissionItem, useSubmissionsApi } from "@/composables/useSubmissionsApi";
import { useToast } from "@/composables/useToast";
import { pulse } from "@/plugins/pulse";
import RecordSubmissionModal from "./submissions/RecordSubmissionModal.vue";
import SubmissionsStatsCards from "./submissions/SubmissionsStatsCards.vue";

const toast = useToast();
const { exportSingleSheet } = useExcelExport();

const { submissions, stats, submitters, loading, fetchSubmissions, recordSubmission, deleteSubmission, batchDeleteSubmissions } =
  useSubmissionsApi();

const { customerTypes, references, fetchCustomerTypes, fetchReferences } = useServicesApi();

// Tax Period Month (e.g. "2026-08")
const getLastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const SUBMISSIONS_FILTER_KEY = "idp_submissions_filters";

const getSavedFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = sessionStorage.getItem(SUBMISSIONS_FILTER_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Submissions.vue]", uiErr?.message || uiErr);
  }
  return {};
};

const savedFilters = getSavedFilters();

const selectedMonth = ref(savedFilters.selectedMonth || getLastMonth());
const searchQuery = ref(savedFilters.searchQuery || "");
const selectedCustomerTypeId = ref<number | "all">(savedFilters.selectedCustomerTypeId ?? "all");
const selectedReferenceId = ref<number | "all">(savedFilters.selectedReferenceId ?? "all");
const selectedSubmitterId = ref<number | "all">(savedFilters.selectedSubmitterId ?? "all");
const statusFilter = ref<"all" | "submitted" | "pending" | "late_submitted">(savedFilters.statusFilter || "all");

const saveFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(
        SUBMISSIONS_FILTER_KEY,
        JSON.stringify({
          selectedMonth: selectedMonth.value,
          searchQuery: searchQuery.value,
          selectedCustomerTypeId: selectedCustomerTypeId.value,
          selectedReferenceId: selectedReferenceId.value,
          selectedSubmitterId: selectedSubmitterId.value,
          statusFilter: statusFilter.value
        })
      );
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Submissions.vue]", uiErr?.message || uiErr);
  }
};

watch([selectedMonth, searchQuery, selectedCustomerTypeId, selectedReferenceId, selectedSubmitterId, statusFilter], saveFilters);

onBeforeRouteLeave((to) => {
  if (!to.path.startsWith("/admin/submissions")) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.removeItem(SUBMISSIONS_FILTER_KEY);
      }
    } catch (uiErr: any) {
      console.warn("[UI Component Warning: Submissions.vue]", uiErr?.message || uiErr);
    }
  }
});

const customerTypeOptions = computed(() => [
  { value: "all", label: `All Customer Types (${customerTypes.value.length})` },
  ...customerTypes.value.map((t) => ({ value: t.id, label: t.typeName }))
]);

const referenceOptions = computed(() => [
  { value: "all", label: `All References (${references.value.length})` },
  ...references.value.map((r) => ({ value: r.id, label: r.name }))
]);

const submitterOptions = computed(() => [
  { value: "all", label: `All Submitters (${submitters.value.length})` },
  ...submitters.value.map((u) => ({ value: u.id, label: `${u.name} (${u.count})` }))
]);

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value.trim() !== "" ||
    statusFilter.value !== "all" ||
    selectedCustomerTypeId.value !== "all" ||
    selectedReferenceId.value !== "all" ||
    selectedSubmitterId.value !== "all"
  );
});

const clearAllFilters = () => {
  searchQuery.value = "";
  statusFilter.value = "all";
  selectedCustomerTypeId.value = "all";
  selectedReferenceId.value = "all";
  selectedSubmitterId.value = "all";
  currentPage.value = 1;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.removeItem(SUBMISSIONS_FILTER_KEY);
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Submissions.vue]", uiErr?.message || uiErr);
  }
};

// Clicking a top KPI card resets every lower toolbar filter so the two never conflict.
const selectCardFilter = (filter: typeof statusFilter.value) => {
  statusFilter.value = filter;
  searchQuery.value = "";
  selectedCustomerTypeId.value = "all";
  selectedReferenceId.value = "all";
  selectedSubmitterId.value = "all";
  currentPage.value = 1;
};

// Multi-Selection State
const selectedIds = ref<number[]>([]);

// Modal State
const showModal = ref(false);
const isSaving = ref(false);

const form = ref({
  clientId: null as number | null,
  taxPeriod: selectedMonth.value,
  submissionId: "",
  remarks: ""
});

const selectedClientItem = computed(() => {
  return submissions.value.find((s) => s.id === form.value.clientId) || null;
});

let searchTimeout: any = null;
let isInitialized = false;

const loadSubmissionsList = async () => {
  try {
    await fetchSubmissions({
      month: selectedMonth.value,
      customerTypeId: selectedCustomerTypeId.value,
      referenceId: selectedReferenceId.value,
      submittedById: selectedSubmitterId.value,
      status: statusFilter.value,
      search: searchQuery.value.trim()
    });
  } catch (err: any) {
    toast.error("Failed to load submissions");
  }
};

const loadData = async () => {
  try {
    await Promise.all([loadSubmissionsList(), fetchCustomerTypes(), fetchReferences()]);
  } catch (err: any) {
    toast.error("Failed to load initial submissions data");
  } finally {
    isInitialized = true;
  }
};

usePulseListener("submission:updated", (data: any) => {
  if (!data) return;
  if (data.taxPeriod === selectedMonth.value) {
    loadSubmissionsList();
  }
});

usePulseListener("submission:deleted", (data: any) => {
  if (!data) return;
  if (data.taxPeriod === selectedMonth.value) {
    loadSubmissionsList();
  }
});

usePulseListener("submission:batch_deleted", () => {
  loadSubmissionsList();
});

onMounted(() => {
  loadData();
});

// Filtered Submissions (Instant Client-side Search & Responsive Filtering)
const filteredSubmissions = computed(() => {
  let list = submissions.value;
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (s) =>
        (s.companyName && s.companyName.toLowerCase().includes(q)) ||
        (s.binNumber && s.binNumber.toLowerCase().includes(q)) ||
        (s.mobile && s.mobile.includes(q)) ||
        (s.submissionId && s.submissionId.toLowerCase().includes(q)) ||
        (s.customerTypeName && s.customerTypeName.toLowerCase().includes(q)) ||
        (s.referenceName && s.referenceName.toLowerCase().includes(q)) ||
        (s.submittedByName && s.submittedByName.toLowerCase().includes(q))
    );
  }
  return list;
});

// Reusable Persistent Pagination (10 items per page)
const filteredSubmissionsCount = computed(() => filteredSubmissions.value.length);
const { currentPage, itemsPerPage, totalPages, paginateList } = usePagination("submissions", {
  defaultPerPage: 10,
  totalItems: filteredSubmissionsCount
});

const paginatedSubmissions = computed(() => paginateList(filteredSubmissions.value));

// Row shape kept identical to SubmissionItem so the template stays untouched.
type VisibleRow = SubmissionItem & { __index: number };

const isPrinting = ref(false);

const visibleRows = computed<VisibleRow[]>(() => {
  if (isPrinting.value) {
    return filteredSubmissions.value.map((item, index) => ({ ...item, __index: index }));
  }
  return paginatedSubmissions.value.map((item, index) => ({ ...item, __index: index }));
});

const handleBeforePrint = () => {
  isPrinting.value = true;
};
const handleAfterPrint = () => {
  isPrinting.value = false;
};

onMounted(() => {
  window.addEventListener("beforeprint", handleBeforePrint);
  window.addEventListener("afterprint", handleAfterPrint);
});

onUnmounted(() => {
  window.removeEventListener("beforeprint", handleBeforePrint);
  window.removeEventListener("afterprint", handleAfterPrint);
});

// Watch Search Query with Debounce
watch(searchQuery, () => {
  if (!isInitialized) return;
  selectedIds.value = [];
  currentPage.value = 1;
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadSubmissionsList();
  }, 250);
});

// Watch Filters
watch([selectedMonth, selectedCustomerTypeId, selectedReferenceId, selectedSubmitterId, statusFilter], () => {
  if (!isInitialized) return;
  selectedIds.value = [];
  currentPage.value = 1;
  loadSubmissionsList();
});

// Pending clients have no submission yet, so "Submitted By" is meaningless there.
// Freeze it by resetting to "all" whenever the Pending card is selected.
watch(statusFilter, (val) => {
  if (val === "pending" && selectedSubmitterId.value !== "all") {
    selectedSubmitterId.value = "all";
  }
});

// Selection Handlers
const isAllSelected = computed(() => {
  if (filteredSubmissions.value.length === 0) return false;
  return filteredSubmissions.value.every((s) => selectedIds.value.includes(s.id));
});

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedIds.value = [];
  } else {
    selectedIds.value = filteredSubmissions.value.map((s) => s.id);
  }
};

const toggleSelectRow = (id: number) => {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
};

// Modal Actions
const openRecordModal = (item?: SubmissionItem) => {
  if (item) {
    form.value = {
      clientId: item.id,
      taxPeriod: selectedMonth.value,
      submissionId: item.submissionId || "",
      remarks: item.remarks || ""
    };
  } else {
    form.value = {
      clientId: null,
      taxPeriod: selectedMonth.value,
      submissionId: "",
      remarks: ""
    };
  }
  showModal.value = true;
};

const handleSubmissionIdInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const cleaned = target.value.replace(/\D/g, "");
  form.value.submissionId = cleaned;
  target.value = cleaned;
};

const handleSaveSubmission = async () => {
  if (!form.value.clientId) {
    toast.error("Please select an active client");
    return;
  }
  const subId = form.value.submissionId.replace(/\D/g, "").trim();
  if (!subId) {
    toast.error("Submission ID is required");
    return;
  }

  isSaving.value = true;
  try {
    await recordSubmission({
      clientId: form.value.clientId,
      taxPeriod: form.value.taxPeriod || selectedMonth.value,
      submissionId: subId,
      remarks: form.value.remarks?.trim() || undefined
    });
    toast.success("Submission ID recorded successfully");
    showModal.value = false;
    await loadData();
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to record submission");
  } finally {
    isSaving.value = false;
  }
};

const handleClearSingle = async (item: SubmissionItem) => {
  if (!item.submissionRecordId) return;
  if (!confirm(`Are you sure you want to clear the submission record for ${item.companyName}?`)) {
    return;
  }
  try {
    await deleteSubmission(item.submissionRecordId);
    toast.success("Submission cleared");
    await loadData();
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to clear submission");
  }
};

const handleBatchClear = async () => {
  // Find submissionRecordIds for selected clients
  const targetRecordIds = submissions.value
    .filter((s) => selectedIds.value.includes(s.id) && s.submissionRecordId !== null)
    .map((s) => s.submissionRecordId as number);

  if (targetRecordIds.length === 0) {
    toast.info("None of the selected clients have recorded submissions to clear");
    return;
  }

  if (!confirm(`Clear recorded submissions for ${targetRecordIds.length} selected client(s)?`)) {
    return;
  }

  try {
    await batchDeleteSubmissions(targetRecordIds);
    toast.success(`${targetRecordIds.length} submission(s) cleared`);
    selectedIds.value = [];
    await loadData();
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to clear submissions");
  }
};

// 1. Export to Excel
const exportToExcel = async () => {
  const exportData = submissions.value.map((s, idx) => ({
    "Sl No.": idx + 1,
    "Client / Company Name": s.companyName,
    Address: s.address || "—",
    "BIN Number": s.binNumber || "—",
    Mobile: s.mobile || "—",
    "Customer Type": s.customerTypeName || "Standard",
    Reference: s.referenceName || "Direct",
    "Tax Period": s.taxPeriod,
    "Submission ID": s.submissionId || "Pending",
    Status: s.status === "submitted" ? "Submitted" : s.status === "late_submitted" ? "Late Submitted" : "Pending",
    "Submitted By": s.submittedByName || "—",
    "Submission Date": s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—",
    Remarks: s.remarks || ""
  }));

  exportSingleSheet(exportData, "Submissions", `Submissions_${selectedMonth.value || "All"}.xlsx`);
};

// 2. Standard A4 Print Action
const printReport = () => {
  window.print();
};
</script>

<template>
  <div class="submissions-page py-2">
    <!-- Screen Header (Hidden in Print) -->
    <div class="d-print-none d-flex flex-wrap justify-content-between align-items-center mb-3">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">Submissions</span>
        </div>
        <h4 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-file-earmark-check text-primary"></i> Return Submissions Tracker
        </h4>
        <span class="text-muted small">
          Record, track, and verify monthly eVAT submission IDs received from the NBR portal
        </span>
      </div>

      <!-- Action Buttons -->
      <div class="d-flex align-items-center gap-2 mt-3 mt-md-0">
        <!-- Excel Export Button -->
        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm d-flex align-items-center gap-2 text-light px-3"
          title="Download Excel Report"
          @click="exportToExcel"
        >
          <i class="bi bi-download text-success"></i>
          <span>Excel</span>
        </button>

        <!-- Standard A4 Print Button -->
        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm d-flex align-items-center gap-2 text-light px-3"
          title="Print A4 Report"
          @click="printReport"
        >
          <i class="bi bi-printer text-info"></i>
          <span>Print</span>
        </button>

        <!-- Record Submission ID Button -->
        <button
          v-if="can('submissions.create')"
          type="button"
          class="btn btn-primary btn-sm d-flex align-items-center gap-2 px-3 fw-semibold shadow-sm"
          @click="openRecordModal()"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Record Submission ID</span>
        </button>

        <!-- Batch Clear Button -->
        <button
          v-if="selectedIds.length > 0 && can('submissions.delete')"
          type="button"
          class="btn btn-outline-danger btn-sm d-flex align-items-center gap-1 px-3 fw-semibold"
          @click="handleBatchClear"
        >
          <i class="bi bi-trash"></i>
          <span>Clear Selected ({{ selectedIds.length }})</span>
        </button>
      </div>
    </div>

    <!-- Quick Stats Cards (Clickable to Filter!) -->
    <SubmissionsStatsCards
      :status-filter="statusFilter"
      :stats="stats"
      @update:status-filter="selectCardFilter($event)"
    />

    <!-- Filter & Search Toolbar -->
    <div class="filter-panel px-3 py-2 mb-3 d-print-none d-flex align-items-center gap-2">
      <!-- 1. Search Box -->
      <SearchInput
        v-model="searchQuery"
        placeholder="Search company, BIN, ID..."
        max-width="320px"
        min-width="200px"
      />

      <!-- 2. Customer Type Filter -->
      <IdpSelect
        v-model="selectedCustomerTypeId"
        :options="customerTypeOptions"
        min-width="170px"
      />

      <!-- 3. Reference Filter -->
      <IdpSelect
        v-model="selectedReferenceId"
        :options="referenceOptions"
        min-width="170px"
      />

      <!-- 4. Submitted By Filter (frozen while viewing Pending) -->
      <span
        class="d-inline-flex"
        :title="statusFilter === 'pending' ? 'Pending clients have not been submitted yet' : ''"
      >
        <IdpSelect
          v-model="selectedSubmitterId"
          :options="submitterOptions"
          :disabled="statusFilter === 'pending'"
          min-width="160px"
        />
      </span>

      <!-- Clear Filter Icon Button -->
      <button
        v-if="hasActiveFilters"
        type="button"
        class="btn btn-outline-danger btn-sm px-2 d-flex align-items-center justify-content-center clear-filter-btn"
        title="Clear all filters"
        @click="clearAllFilters"
      >
        <i class="bi bi-x-lg"></i>
      </button>

      <!-- 5. Month Navigator Component (Right Aligned) -->
      <div class="month-nav-container ms-auto" style="width: 180px; flex-shrink: 0;">
        <MonthNavigator v-model="selectedMonth" />
      </div>
    </div>

    <!-- A4 Printable Document Header (Visible Only When Printing) -->
    <div class="d-none d-print-block a4-print-header mb-4">
      <div class="d-flex justify-content-between align-items-start border-bottom pb-3">
        <div>
          <h3 class="fw-bold text-dark mb-1">Integrated VAT Data Processing Portal (IDP)</h3>
          <h5 class="text-secondary mb-0">Monthly eVAT Return Submissions Report</h5>
        </div>
        <div class="text-end text-secondary small">
          <div><strong>Tax Period:</strong> {{ selectedMonth }}</div>
          <div><strong>Generated:</strong> {{ new Date().toLocaleString() }}</div>
          <div><strong>Total Active Clients:</strong> {{ submissions.length }}</div>
        </div>
      </div>
    </div>

    <!-- Submissions Table Card -->
    <div
      class="table-card shadow-sm"
    >
      <table class="table-custom">
        <thead>
          <tr>
            <th style="width: 40px;" class="d-print-none text-center">
              <input
                type="checkbox"
                class="custom-check-box"
                :checked="isAllSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th style="width: 26%;">Client & Address</th>
            <th style="width: 18%;">BIN & Mobile</th>
            <th style="width: 16%;">Customer Type</th>
            <th style="width: 12%;">Tax Period</th>
            <th style="width: 20%;">Submission ID</th>
            <th style="width: 8%; text-align: right;" class="d-print-none">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && filteredSubmissions.length === 0">
            <td colspan="7" class="text-center py-4 text-muted">
              <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
              Loading submissions data...
            </td>
          </tr>

          <tr v-else-if="filteredSubmissions.length === 0">
            <td colspan="7" class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              No active clients found matching the selected filters.
            </td>
          </tr>

          <tr v-for="item in visibleRows" :key="item.id">
            <!-- Checkbox -->
            <td class="d-print-none text-center">
              <input
                type="checkbox"
                class="custom-check-box"
                :checked="selectedIds.includes(item.id)"
                @change="toggleSelectRow(item.id)"
              />
            </td>

            <!-- 1. Client Organization & Address (Stacked) -->
            <td>
              <div class="d-flex align-items-center gap-2 mb-1" style="max-width: 280px;">
                <span
                  class="status-indicator-dot"
                  :class="item.hasActivity ? 'dot-active' : 'dot-inactive'"
                  :title="item.hasActivity ? 'Active Purchase' : 'No Purchase'"
                ></span>
                <div class="fw-semibold text-white text-truncate" style="font-size: 0.92rem;" :title="item.companyName">
                  {{ item.companyName }}
                </div>
              </div>
              <div class="text-muted text-truncate" style="font-size: 0.78rem; max-width: 280px; margin-left: 16px;" :title="item.address || '—'">
                <i class="bi bi-geo-alt me-1 text-secondary"></i>{{ item.address || '—' }}
              </div>
            </td>

            <!-- 2. BIN & Mobile (Stacked) -->
            <td>
              <div class="mb-1">
                <span v-if="item.binNumber" class="text-info font-monospace" style="font-size: 0.8rem;">
                  <i class="bi bi-upc-scan me-1 text-secondary"></i>{{ item.binNumber }}
                </span>
                <span v-else class="text-muted small">—</span>
              </div>
              <div v-if="item.mobile" class="text-muted" style="font-size: 0.78rem;">
                <i class="bi bi-telephone me-1 text-secondary"></i>{{ item.mobile }}
              </div>
              <div v-else class="text-muted small" style="font-size: 0.78rem;">—</div>
            </td>

            <!-- Customer Type -->
            <td>
              <span class="badge bg-secondary bg-opacity-25 text-light border border-secondary border-opacity-25 px-2 py-1" style="font-size: 0.8rem;">
                {{ item.customerTypeName || 'Standard' }}
              </span>
            </td>

            <!-- Tax Period -->
            <td>
              <span class="font-monospace text-light fw-medium" style="font-size: 0.86rem;">{{ item.taxPeriod }}</span>
            </td>

            <!-- Submission ID -->
            <td>
              <!-- Edited record: blue/info badge + pencil marker + hover tooltip -->
              <span
                v-if="item.submissionId && (item.isEdited || item.updatedByName)"
                class="badge bg-dark border border-info border-opacity-50 text-info font-monospace px-2.5 py-1 fw-semibold"
                style="font-size: 0.84rem;"
                :title="`Submitted by: ${item.submittedByName || '—'} | Edited by: ${item.updatedByName || '—'}`"
              >
                <i class="bi bi-pencil-fill me-1" style="font-size: 0.75rem;"></i>{{ item.submissionId }}
              </span>

              <!-- Original submission: green badge + hover tooltip -->
              <span
                v-else-if="item.submissionId"
                class="badge bg-dark border border-success border-opacity-50 text-success font-monospace px-2.5 py-1 fw-semibold"
                style="font-size: 0.84rem;"
                :title="`Submitted by: ${item.submittedByName || '—'}`"
              >
                <i class="bi bi-check-circle me-1"></i>{{ item.submissionId }}
              </span>

              <!-- Pending: unchanged warning badge -->
              <span v-else class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 px-2 py-1 font-monospace" style="font-size: 0.78rem;">
                <i class="bi bi-hourglass-split me-1"></i>Pending
              </span>
            </td>

            <!-- Actions (Icon Only) -->
            <td style="text-align: right;" class="d-print-none">
              <div class="d-inline-flex align-items-center gap-1">
                <button
                  v-if="can('submissions.create')"
                  type="button"
                  class="btn btn-sm btn-action-icon"
                  :class="item.submissionRecordId ? 'btn-outline-primary' : 'btn-primary shadow-sm'"
                  :title="item.submissionRecordId ? 'Edit Submission ID' : 'Record Submission ID'"
                  @click="openRecordModal(item)"
                >
                  <i class="bi" :class="item.submissionRecordId ? 'bi-pencil-square' : 'bi-plus-lg'"></i>
                </button>

                <button
                  v-if="item.submissionRecordId && can('submissions.delete')"
                  type="button"
                  class="btn btn-sm btn-action-icon btn-outline-danger"
                  title="Clear submission"
                  @click="handleClearSingle(item)"
                >
                  <i class="bi bi-x-circle"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination for Submissions -->
    <div v-if="filteredSubmissions.length > 0" class="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-2">
      <span class="text-muted small">
        Showing <strong>{{ (currentPage - 1) * itemsPerPage + 1 }}</strong> to
        <strong>{{ Math.min(currentPage * itemsPerPage, filteredSubmissions.length) }}</strong> of
        <strong>{{ filteredSubmissions.length }}</strong> submissions
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

    <!-- Record Submission ID Modal -->
    <RecordSubmissionModal
      :show="showModal"
      :is-saving="isSaving"
      :selected-client-item="selectedClientItem"
      :submissions="submissions"
      :form="form"
      @close="showModal = false"
      @save="handleSaveSubmission"
      @change-client="form.clientId = null"
      @update:submission-id="form.submissionId = $event"
    />
  </div>
</template>

<style scoped>
.submissions-page {
  width: 100%;
}

.stat-pill {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 0.9rem 1.15rem;
  transition: all 0.15s ease;
}

.stat-pill:hover {
  background: #252a30;
  border-color: #495057;
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

.custom-check-box {
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  max-width: 16px !important;
  appearance: auto !important;
  -webkit-appearance: auto !important;
  cursor: pointer;
  margin: 0 auto !important;
  display: block !important;
  accent-color: #0d6efd !important;
}

.cursor-pointer {
  cursor: pointer;
}

.filter-panel {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
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

.idp-select {
  background-color: #181b1f !important;
  border: 1px solid #3b424b !important;
  color: #f8f9fa !important;
  border-radius: 6px;
  font-size: 0.86rem;
  height: 38px;
  padding-left: 12px;
  padding-right: 32px;
}

.idp-select:focus {
  border-color: #3b8eed !important;
  box-shadow: 0 0 0 0.15rem rgba(59, 142, 237, 0.25) !important;
}

.month-nav-container {
  display: flex;
  align-items: center;
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

.table-custom thead tr {
  background: #16191d;
  border-bottom: 1px solid #343a40;
}

.table-custom th {
  padding: 12px 14px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #adb5bd;
  text-align: left;
  white-space: nowrap;
}

.table-custom td {
  padding: 13px 14px;
  font-size: 0.88rem;
  border-bottom: 1px solid #282d34;
  vertical-align: middle;
  color: #e2e8f0;
  white-space: nowrap;
}

.table-custom tbody tr:hover td {
  background: #252a30;
}

.btn-action-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 0.9rem;
}

/* Status Badges */
.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.badge-status-submitted {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.35);
}

.badge-status-pending {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.35);
}

.badge-status-late {
  background: rgba(253, 126, 20, 0.15);
  color: #fd7e14;
  border: 1px solid rgba(253, 126, 20, 0.35);
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

/* Status Indicator Dot (Purchase Activity) */
.status-indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.dot-active {
  background: #20c997;
  box-shadow: 0 0 6px rgba(32, 201, 151, 0.6);
}
.dot-inactive {
  background: #dc3545;
  box-shadow: 0 0 6px rgba(220, 53, 69, 0.6);
}

/* Modal Styling */
.idp-modal-content {
  background-color: #1e2227;
  border-radius: 8px;
}

.idp-modal-input {
  background-color: #15181c !important;
  border: 1px solid #3a4149 !important;
  color: #f8f9fa !important;
  font-size: 0.85rem;
}

.idp-modal-input:focus {
  border-color: #0d6efd !important;
  box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25) !important;
}

.clear-filter-btn {
  height: 38px;
  min-height: 38px;
  max-height: 38px;
  border-radius: 6px;
  transition: all 0.15s ease;
}
</style>
