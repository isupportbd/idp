<script setup lang="ts">
import { computed } from "vue";
import { usePagination } from "@/composables/usePagination";
import type { ClientLedgerSummary, LedgerOverallSummary } from "../types";

const props = defineProps<{
  clientSummaries: ClientLedgerSummary[];
  summary: LedgerOverallSummary;
  fromMonth: string;
  toMonth: string;
  selectedReferenceId?: string | number;
  selectedReferenceName?: string;
  viewMode?: "client" | "summary";
}>();

const emit = defineEmits<{
  selectClient: [clientId: number];
  "update:viewMode": [mode: "client" | "summary"];
}>();

const showReferenceColumn = computed(() => {
  return !props.selectedReferenceId || props.selectedReferenceId === "all";
});

// Framework pagination
const totalClientsCount = computed(() => props.clientSummaries.length);
const { currentPage, itemsPerPage, totalPages, paginateList } = usePagination("client_ledger_overview", {
  defaultPerPage: 15,
  totalItems: totalClientsCount,
  syncUrl: false
});

const paginatedClients = computed(() => {
  return paginateList(props.clientSummaries);
});

const formatTk = (amount?: number | null): string => {
  if (amount === undefined || amount === null) return "0.00";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
</script>

<template>
  <div class="card idp-card border-0 shadow-sm overflow-hidden reference-summary-card">
    <div class="card-header bg-dark bg-opacity-75 p-3 border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div>
        <h5 class="mb-1 text-light fw-bold d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-warning"></i>
          <span>Client Ledger Overview</span>
        </h5>
        <div class="text-muted small">
          Showing balances for <strong class="text-light">{{ clientSummaries.length }}</strong> clients ({{ fromMonth }} to {{ toMonth }})
        </div>
      </div>

      <!-- View Switcher Segmented Control (Shown when Reference is filtered) -->
      <div v-if="selectedReferenceId && selectedReferenceId !== 'all'" class="d-print-none d-flex align-items-center gap-1 bg-dark p-1 rounded border border-secondary border-opacity-50">
        <button
          type="button"
          class="btn btn-sm px-3 py-1 fw-medium transition-all"
          :class="viewMode === 'client' ? 'btn-primary shadow-sm text-white' : 'btn-dark text-muted border-0'"
          @click="emit('update:viewMode', 'client')"
        >
          <i class="bi bi-person-lines-fill me-1"></i> Client Basis
        </button>
        <button
          type="button"
          class="btn btn-sm px-3 py-1 fw-medium transition-all"
          :class="viewMode === 'summary' ? 'btn-primary shadow-sm text-white' : 'btn-dark text-muted border-0'"
          @click="emit('update:viewMode', 'summary')"
        >
          <i class="bi bi-journal-text me-1"></i> Summary Ledger
        </button>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-dark table-hover mb-0 align-middle idp-table">
        <thead>
          <tr class="text-uppercase small text-muted border-bottom border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <th class="ps-3" style="width: 50px;">#</th>
            <th>Client</th>
            <th v-if="showReferenceColumn" style="width: 170px;">Reference</th>
            <th class="text-end" style="width: 140px;">Opening (Tk)</th>
            <th class="text-end" style="width: 140px;">Billed (Tk)</th>
            <th class="text-end" style="width: 140px;">Paid (Tk)</th>
            <th class="text-end" style="width: 160px;">Closing Balance (Tk)</th>
            <th class="text-center pe-3 d-print-none" style="width: 130px;">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="clientSummaries.length === 0">
            <td :colspan="showReferenceColumn ? 8 : 7" class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              No clients found matching the selected filters.
            </td>
          </tr>

          <tr
            v-for="(cl, index) in paginatedClients"
            :key="cl.clientId"
            class="border-bottom border-secondary border-opacity-10"
          >
            <!-- # -->
            <td class="ps-3 text-muted small">{{ (currentPage - 1) * itemsPerPage + index + 1 }}</td>

            <!-- Client Info -->
            <td>
              <div class="fw-bold text-white text-truncate" style="max-width: 360px; font-size: 0.92rem;">
                {{ cl.companyName }}
              </div>
              <div class="text-info small mt-1" style="font-size: 0.78rem;">
                BIN: {{ cl.binNumber }}
              </div>
            </td>

            <!-- Reference (Shown only if not filtered by specific reference) -->
            <td v-if="showReferenceColumn">
              <span class="badge bg-secondary bg-opacity-25 text-warning border border-secondary border-opacity-25">
                {{ cl.referenceName }}
              </span>
            </td>

            <!-- Opening Balance -->
            <td class="text-end text-muted fw-medium">
              {{ formatTk(cl.openingBalance) }}
            </td>

            <!-- Billed / Invoiced -->
            <td class="text-end text-primary fw-semibold">
              {{ formatTk(cl.totalBilled) }}
            </td>

            <!-- Paid / Collected -->
            <td class="text-end text-success fw-semibold">
              {{ formatTk(cl.totalPaid) }}
            </td>

            <!-- Closing Due Balance -->
            <td class="text-end fw-bold" style="font-size: 0.95rem;">
              <span :class="cl.closingBalance > 0 ? 'text-danger' : (cl.closingBalance < 0 ? 'text-info' : 'text-success')">
                {{ formatTk(Math.abs(cl.closingBalance)) }}
                <span class="small fw-semibold ms-1" style="font-size: 0.72rem;">
                  {{ cl.closingBalance > 0 ? '(Due)' : (cl.closingBalance < 0 ? '(Adv)' : '') }}
                </span>
              </span>
            </td>

            <!-- Action: View Button Only -->
            <td class="text-center pe-3 d-print-none">
              <button
                type="button"
                class="action-btn btn-view"
                title="View Client Ledger"
                @click="emit('selectClient', cl.clientId)"
              >
                <i class="bi bi-eye"></i>
              </button>
            </td>
          </tr>
        </tbody>

        <!-- Grand Total Footer Row -->
        <tfoot v-if="clientSummaries.length > 0">
          <tr class="fw-bold text-uppercase small border-top border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <td :colspan="showReferenceColumn ? 3 : 2" class="ps-3 text-light">
              <span>Grand Total ({{ clientSummaries.length }} Clients)</span>
            </td>
            <td class="text-end text-muted fw-bold">
              ৳ {{ formatTk(summary.openingBalance) }}
            </td>
            <td class="text-end text-primary fw-bold">
              ৳ {{ formatTk(summary.totalBilled) }}
            </td>
            <td class="text-end text-success fw-bold">
              ৳ {{ formatTk(summary.totalPaid) }}
            </td>
            <td class="text-end fw-bolder" :class="summary.closingBalance > 0 ? 'text-danger' : 'text-success'">
              ৳ {{ formatTk(summary.closingBalance) }}
            </td>
            <td class="pe-3 text-center text-muted d-print-none">—</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Framework Pagination Bar -->
    <div v-if="clientSummaries.length > 0" class="d-flex flex-wrap justify-content-between align-items-center p-3 border-top border-secondary border-opacity-25 d-print-none">
      <span class="text-muted small">
        Showing <strong>{{ (currentPage - 1) * itemsPerPage + 1 }}</strong> to
        <strong>{{ Math.min(currentPage * itemsPerPage, clientSummaries.length) }}</strong> of
        <strong>{{ clientSummaries.length }}</strong> clients
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
.reference-summary-card {
  border-radius: 8px;
  background-color: #1e2227 !important;
  border: 1px solid #343a40 !important;
  font-family: inherit;
}
.idp-table th {
  background-color: #15181b !important;
  color: #adb5bd !important;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #343a40;
}
.idp-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #282d34;
  vertical-align: middle;
}
.idp-table tr:hover td {
  background: #252b32;
}

/* Framework Standard Action Button Styling */
.action-btn {
  width: 30px;
  height: 30px;
  border-radius: 5px;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-view {
  background: rgba(13, 202, 240, 0.12);
  color: #0dcaf0;
  border: 1px solid rgba(13, 202, 240, 0.3);
}

.btn-view:hover {
  background: rgba(13, 202, 240, 0.25);
  color: #38d9f5;
  border-color: rgba(13, 202, 240, 0.6);
  box-shadow: 0 0 8px rgba(13, 202, 240, 0.3);
}
</style>
