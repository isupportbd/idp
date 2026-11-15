<script setup lang="ts">
import type { ClientLedgerSummary, LedgerOverallSummary } from "../types";

defineProps<{
  clientSummaries: ClientLedgerSummary[];
  summary: LedgerOverallSummary;
  fromMonth: string;
  toMonth: string;
  selectedReferenceName?: string;
}>();

const emit = defineEmits<{
  selectClient: [clientId: number];
}>();

const formatTk = (amount?: number | null): string => {
  if (amount === undefined || amount === null) return "0.00";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
</script>

<template>
  <div class="card idp-card border-0 shadow-sm overflow-hidden reference-summary-card">
    <div class="card-header bg-dark bg-opacity-75 p-3 border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between">
      <div>
        <h5 class="mb-1 text-light fw-bold d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-warning"></i>
          <span>Client Ledger Overview {{ selectedReferenceName ? `(${selectedReferenceName})` : '' }}</span>
        </h5>
        <div class="text-muted small">
          Showing balances for <strong class="text-light">{{ clientSummaries.length }}</strong> clients ({{ fromMonth }} to {{ toMonth }})
        </div>
      </div>
      <div class="small text-muted">
        Total Due: <strong class="text-danger fs-6 fw-bold">৳ {{ formatTk(summary.closingBalance) }}</strong>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-dark table-hover mb-0 align-middle idp-table">
        <thead>
          <tr class="text-uppercase small text-muted border-bottom border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <th class="ps-3" style="width: 50px;">#</th>
            <th>Client</th>
            <th style="width: 170px;">Reference</th>
            <th class="text-end" style="width: 140px;">Opening (Tk)</th>
            <th class="text-end" style="width: 140px;">Billed (Tk)</th>
            <th class="text-end" style="width: 140px;">Paid (Tk)</th>
            <th class="text-end" style="width: 160px;">Closing Due (Tk)</th>
            <th class="text-center pe-3" style="width: 130px;">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="clientSummaries.length === 0">
            <td colspan="8" class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              No clients found matching the selected filters.
            </td>
          </tr>

          <tr
            v-for="(cl, index) in clientSummaries"
            :key="cl.clientId"
            class="border-bottom border-secondary border-opacity-10"
          >
            <!-- # -->
            <td class="ps-3 text-muted small">{{ index + 1 }}</td>

            <!-- Client Info -->
            <td>
              <div class="fw-bold text-white text-truncate" style="max-width: 360px; font-size: 0.92rem;">
                {{ cl.companyName }}
              </div>
              <div class="text-info small mt-1" style="font-size: 0.78rem;">
                BIN: {{ cl.binNumber }}
              </div>
            </td>

            <!-- Reference -->
            <td>
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
              <span :class="cl.closingBalance > 0 ? 'text-danger' : 'text-success'">
                {{ formatTk(cl.closingBalance) }}
              </span>
            </td>

            <!-- Action: View Button Only -->
            <td class="text-center pe-3">
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
            <td colspan="3" class="ps-3 text-light">
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
            <td class="pe-3 text-center text-muted">—</td>
          </tr>
        </tfoot>
      </table>
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
</style>
