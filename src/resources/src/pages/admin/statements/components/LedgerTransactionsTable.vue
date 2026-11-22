<script setup lang="ts">
import type { ClientLedgerSummary, LedgerTransaction } from "../types";

defineProps<{
  transactions: LedgerTransaction[];
  client: ClientLedgerSummary | null;
  fromMonth: string;
  toMonth: string;
  referenceName?: string;
  isReferenceView?: boolean;
  viewMode?: "client" | "summary";
}>();

const emit = defineEmits<{
  "update:viewMode": [mode: "client" | "summary"];
}>();

const formatTk = (amount?: number | null): string => {
  if (amount === undefined || amount === null) return "0.00";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getStatusBadge = (status: string, type: string) => {
  const s = (status || "").toLowerCase();
  if (type === "opening") return { bg: "bg-secondary bg-opacity-25 text-info border-info", label: "Opening" };
  if (s === "paid" || s === "completed") return { bg: "bg-success bg-opacity-25 text-success border-success", label: "Paid" };
  if (s === "partial") return { bg: "bg-warning bg-opacity-25 text-warning border-warning", label: "Partial" };
  if (s === "unpaid") return { bg: "bg-danger bg-opacity-25 text-danger border-danger", label: "Unpaid" };
  return { bg: "bg-secondary bg-opacity-25 text-light border-secondary", label: status };
};
</script>

<template>
  <div class="card idp-card border-0 shadow-sm overflow-hidden ledger-transactions-card">
    <!-- Header with Client Info or Reference Summary Info -->
    <div v-if="client || isReferenceView" class="card-header bg-dark bg-opacity-75 p-3 border-bottom border-secondary border-opacity-25">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div v-if="client && !isReferenceView">
          <h5 class="mb-1 text-light fw-bold d-flex align-items-center gap-2">
            <i class="bi bi-person-badge text-primary"></i>
            <span>{{ client.companyName }}</span>
          </h5>
          <div class="d-flex flex-wrap gap-3 text-muted small">
            <span>BIN: <strong class="text-info">{{ client.binNumber }}</strong></span>
            <span>Reference: <strong class="text-warning">{{ client.referenceName }}</strong></span>
          </div>
        </div>
        <div v-else-if="isReferenceView">
          <h5 class="mb-1 text-light fw-bold d-flex align-items-center gap-2">
            <i class="bi bi-journal-text text-warning"></i>
            <span>Summary Ledger ({{ referenceName || "Reference" }})</span>
          </h5>
          <div class="text-muted small">
            Consolidated timeline of all invoices &amp; receipts ({{ fromMonth }} to {{ toMonth }})
          </div>
        </div>

        <!-- View Switcher Segmented Control (Shown in Reference Summary Mode) -->
        <div v-if="isReferenceView" class="d-print-none d-flex align-items-center gap-1 bg-dark p-1 rounded border border-secondary border-opacity-50">
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
    </div>

    <!-- Table content -->
    <div class="table-responsive">
      <table class="table table-dark table-hover mb-0 align-middle idp-table">
        <thead>
          <tr class="text-uppercase small text-muted border-bottom border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <th class="ps-3" style="width: 120px;">Date</th>
            <th v-if="!isReferenceView" style="width: 110px;">Tax Period</th>
            <th>Particulars / Description</th>
            <th v-if="!isReferenceView" style="width: 160px;">Ref No</th>
            <th class="text-end" style="width: 140px;">Billed (Debit)</th>
            <th class="text-end" style="width: 140px;">Paid (Credit)</th>
            <th class="text-end pe-3" style="width: 160px;">Balance (Tk)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="transactions.length === 0">
            <td :colspan="isReferenceView ? 5 : 7" class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              No billing or collection transactions found in the period {{ fromMonth }} to {{ toMonth }}.
            </td>
          </tr>

          <tr
            v-for="tx in transactions"
            :key="tx.id"
            :class="{ 'table-active bg-opacity-10': tx.type === 'opening' }"
            class="border-bottom border-secondary border-opacity-10"
          >
            <!-- Date -->
            <td class="ps-3 text-light">
              <span v-if="tx.type === 'opening'" class="text-info fst-italic">Period Start</span>
              <span v-else>{{ tx.date }}</span>
            </td>

            <!-- Tax Period (Only in individual client view) -->
            <td v-if="!isReferenceView" class="text-muted">
              <span v-if="tx.taxPeriod && tx.taxPeriod !== '—'" class="badge bg-dark border border-secondary text-light">
                {{ tx.taxPeriod }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>

            <!-- Description -->
            <td>
              <div class="d-flex align-items-center gap-2">
                <i
                  v-if="tx.type === 'bill'"
                  class="bi bi-file-earmark-text text-primary"
                  title="Service Invoice"
                ></i>
                <i
                  v-else-if="tx.type === 'collection'"
                  class="bi bi-cash-stack text-success"
                  title="Payment Receipt"
                ></i>
                <i
                  v-else
                  class="bi bi-clock-history text-info"
                  title="Opening Balance"
                ></i>
                <span :class="tx.type === 'opening' ? 'text-info fw-semibold' : 'text-light'">
                  {{ tx.description }}
                </span>
              </div>
            </td>

            <!-- Ref No (Only in individual client view) -->
            <td v-if="!isReferenceView">
              <span
                v-if="tx.refNo && tx.refNo !== '—'"
                class="badge"
                :class="tx.type === 'bill' ? 'bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25' : 'bg-success bg-opacity-25 text-success border border-success border-opacity-25'"
              >
                {{ tx.refNo }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>

            <!-- Debit (Billed) -->
            <td class="text-end">
              <span v-if="tx.debit > 0" class="text-primary fw-bold">
                {{ formatTk(tx.debit) }}
              </span>
              <span v-else class="text-muted opacity-50">—</span>
            </td>

            <!-- Credit (Paid) -->
            <td class="text-end">
              <span v-if="tx.credit > 0" class="text-success fw-bold">
                {{ formatTk(tx.credit) }}
              </span>
              <span v-else class="text-muted opacity-50">—</span>
            </td>

            <!-- Running Balance -->
            <td class="text-end pe-3 fw-bold">
              <span :class="tx.balance > 0 ? 'text-danger' : (tx.balance < 0 ? 'text-info' : 'text-success')">
                {{ formatTk(Math.abs(tx.balance)) }}
                <span class="small fw-semibold ms-1" style="font-size: 0.72rem;">
                  {{ tx.balance > 0 ? '(Due)' : (tx.balance < 0 ? '(Adv)' : '') }}
                </span>
              </span>
            </td>
          </tr>
        </tbody>

        <!-- Footer Row with Summary -->
        <tfoot v-if="(client || isReferenceView) && transactions.length > 0">
          <tr class="fw-bold text-uppercase small border-top border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <td :colspan="isReferenceView ? 2 : 4" class="ps-3 text-light">
              <span v-if="client">Total for {{ client.companyName }} ({{ fromMonth }} to {{ toMonth }})</span>
              <span v-else>Total for {{ referenceName || "Reference" }} ({{ fromMonth }} to {{ toMonth }})</span>
            </td>
            <td class="text-end text-primary fw-bold">
              ৳ {{ formatTk(transactions.reduce((sum, t) => sum + (t.debit || 0), 0)) }}
            </td>
            <td class="text-end text-success fw-bold">
              ৳ {{ formatTk(transactions.reduce((sum, t) => sum + (t.credit || 0), 0)) }}
            </td>
            <td class="text-end pe-3 fw-bolder" :class="(transactions[transactions.length - 1]?.balance || 0) > 0 ? 'text-danger' : ((transactions[transactions.length - 1]?.balance || 0) < 0 ? 'text-info' : 'text-success')">
              ৳ {{ formatTk(Math.abs(transactions[transactions.length - 1]?.balance || 0)) }}
              <span class="small fw-semibold ms-1" style="font-size: 0.72rem;">
                {{ (transactions[transactions.length - 1]?.balance || 0) > 0 ? '(Due)' : ((transactions[transactions.length - 1]?.balance || 0) < 0 ? '(Adv)' : '') }}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ledger-transactions-card {
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
