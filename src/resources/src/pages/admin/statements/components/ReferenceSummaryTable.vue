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
      <div class="small text-muted font-monospace">
        Total Due: <strong class="text-danger fs-6">৳ {{ formatTk(summary.closingBalance) }}</strong>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-dark table-hover mb-0 align-middle idp-table">
        <thead>
          <tr class="text-uppercase small text-muted border-bottom border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <th class="ps-3" style="width: 50px;">#</th>
            <th>Client Organization</th>
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
            <td class="ps-3 text-muted small font-monospace">{{ index + 1 }}</td>

            <!-- Client Info -->
            <td>
              <div class="fw-semibold text-light">{{ cl.companyName }}</div>
              <div class="text-muted small font-monospace">
                <span>BIN: {{ cl.binNumber }}</span>
                <span v-if="cl.mobile && cl.mobile !== '—'" class="ms-2">| Ph: {{ cl.mobile }}</span>
              </div>
            </td>

            <!-- Reference -->
            <td>
              <span class="badge bg-secondary bg-opacity-25 text-warning border border-secondary border-opacity-25">
                {{ cl.referenceName }}
              </span>
            </td>

            <!-- Opening Balance -->
            <td class="text-end font-monospace text-muted">
              {{ formatTk(cl.openingBalance) }}
            </td>

            <!-- Billed / Invoiced -->
            <td class="text-end font-monospace text-primary fw-medium">
              {{ formatTk(cl.totalBilled) }}
            </td>

            <!-- Paid / Collected -->
            <td class="text-end font-monospace text-success fw-medium">
              {{ formatTk(cl.totalPaid) }}
            </td>

            <!-- Closing Due Balance -->
            <td class="text-end font-monospace fw-bold">
              <span :class="cl.closingBalance > 0 ? 'text-danger' : 'text-success'">
                {{ formatTk(cl.closingBalance) }}
              </span>
            </td>

            <!-- Action -->
            <td class="text-center pe-3">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 py-1 px-2"
                @click="emit('selectClient', cl.clientId)"
              >
                <i class="bi bi-journal-text"></i>
                <span>Ledger</span>
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
            <td class="text-end font-monospace text-muted">
              ৳ {{ formatTk(summary.openingBalance) }}
            </td>
            <td class="text-end font-monospace text-primary">
              ৳ {{ formatTk(summary.totalBilled) }}
            </td>
            <td class="text-end font-monospace text-success">
              ৳ {{ formatTk(summary.totalPaid) }}
            </td>
            <td class="text-end font-monospace" :class="summary.closingBalance > 0 ? 'text-danger' : 'text-success'">
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
  border-radius: 10px;
  background-color: #14171a !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}
.idp-table th {
  background-color: #1a1d21 !important;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  padding-top: 12px;
  padding-bottom: 12px;
}
.idp-table td {
  padding-top: 10px;
  padding-bottom: 10px;
}
</style>
