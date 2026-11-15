<script setup lang="ts">
import type { ClientLedgerSummary, LedgerTransaction } from "../types";

defineProps<{
  transactions: LedgerTransaction[];
  client: ClientLedgerSummary | null;
  fromMonth: string;
  toMonth: string;
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
    <!-- Header with Client Info -->
    <div v-if="client" class="card-header bg-dark bg-opacity-75 p-3 border-bottom border-secondary border-opacity-25">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <h5 class="mb-1 text-light fw-bold d-flex align-items-center gap-2">
            <i class="bi bi-person-badge text-primary"></i>
            <span>{{ client.companyName }}</span>
          </h5>
          <div class="d-flex flex-wrap gap-3 text-muted small font-monospace">
            <span>BIN: <strong class="text-info">{{ client.binNumber }}</strong></span>
            <span>Phone: <strong class="text-light">{{ client.mobile }}</strong></span>
            <span>Reference: <strong class="text-warning">{{ client.referenceName }}</strong></span>
          </div>
        </div>
        <div class="text-end">
          <div class="text-muted small">Net Closing Balance</div>
          <div
            class="h4 mb-0 fw-bold font-monospace"
            :class="client.closingBalance > 0 ? 'text-danger' : 'text-success'"
          >
            ৳ {{ formatTk(client.closingBalance) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Table content -->
    <div class="table-responsive">
      <table class="table table-dark table-hover mb-0 align-middle idp-table">
        <thead>
          <tr class="text-uppercase small text-muted border-bottom border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <th class="ps-3" style="width: 120px;">Date</th>
            <th style="width: 110px;">Tax Period</th>
            <th>Particulars / Description</th>
            <th style="width: 160px;">Ref No</th>
            <th class="text-end" style="width: 140px;">Billed (Debit)</th>
            <th class="text-end" style="width: 140px;">Paid (Credit)</th>
            <th class="text-end" style="width: 160px;">Balance (Tk)</th>
            <th class="text-center pe-3" style="width: 110px;">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="transactions.length === 0">
            <td colspan="8" class="text-center py-5 text-muted">
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
            <td class="ps-3 font-monospace text-light">
              <span v-if="tx.type === 'opening'" class="text-info fst-italic">Period Start</span>
              <span v-else>{{ tx.date }}</span>
            </td>

            <!-- Tax Period -->
            <td class="font-monospace text-muted">
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

            <!-- Ref No -->
            <td class="font-monospace">
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
            <td class="text-end font-monospace">
              <span v-if="tx.debit > 0" class="text-primary fw-bold">
                {{ formatTk(tx.debit) }}
              </span>
              <span v-else class="text-muted opacity-50">—</span>
            </td>

            <!-- Credit (Paid) -->
            <td class="text-end font-monospace">
              <span v-if="tx.credit > 0" class="text-success fw-bold">
                {{ formatTk(tx.credit) }}
              </span>
              <span v-else class="text-muted opacity-50">—</span>
            </td>

            <!-- Running Balance -->
            <td class="text-end font-monospace fw-bold">
              <span :class="tx.balance > 0 ? 'text-danger' : 'text-success'">
                {{ formatTk(tx.balance) }}
              </span>
            </td>

            <!-- Status -->
            <td class="text-center pe-3">
              <span
                class="badge border px-2 py-1"
                :class="getStatusBadge(tx.status, tx.type).bg"
              >
                {{ getStatusBadge(tx.status, tx.type).label }}
              </span>
            </td>
          </tr>
        </tbody>

        <!-- Footer Row with Summary -->
        <tfoot v-if="client && transactions.length > 0">
          <tr class="fw-bold text-uppercase small border-top border-secondary border-opacity-25" style="background-color: #1a1d21;">
            <td colspan="4" class="ps-3 text-light">
              <span>Total for {{ client.companyName }} ({{ fromMonth }} to {{ toMonth }})</span>
            </td>
            <td class="text-end font-monospace text-primary">
              ৳ {{ formatTk(client.totalBilled) }}
            </td>
            <td class="text-end font-monospace text-success">
              ৳ {{ formatTk(client.totalPaid) }}
            </td>
            <td class="text-end font-monospace" :class="client.closingBalance > 0 ? 'text-danger' : 'text-success'">
              ৳ {{ formatTk(client.closingBalance) }}
            </td>
            <td class="pe-3 text-center text-muted">
              {{ client.closingBalance > 0 ? 'Due' : 'Cleared' }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ledger-transactions-card {
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
