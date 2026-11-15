<script setup lang="ts">
import type { LedgerOverallSummary } from "../types";

defineProps<{
  summary: LedgerOverallSummary;
  clientCount?: number;
}>();

const formatTk = (amount: number): string => {
  return (amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
</script>

<template>
  <div class="row g-3 mb-4 ledger-summary-cards">
    <!-- Opening Balance -->
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card idp-card h-100 border-0 p-3 shadow-sm">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="stat-label text-muted">Opening Balance</span>
          <span class="badge bg-secondary bg-opacity-25 text-info border border-info border-opacity-25 px-2 py-1">
            <i class="bi bi-clock-history me-1"></i>Pre-Period
          </span>
        </div>
        <div class="stat-val text-white">
          {{ formatTk(summary.openingBalance) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-secondary small mt-1">Previous unadjusted dues</div>
      </div>
    </div>

    <!-- Total Invoiced / Billed -->
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card idp-card h-100 border-0 p-3 shadow-sm">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="stat-label text-muted">Total Invoiced</span>
          <span class="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25 px-2 py-1">
            <i class="bi bi-receipt me-1"></i>Debit (+)
          </span>
        </div>
        <div class="stat-val text-primary">
          {{ formatTk(summary.totalBilled) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-secondary small mt-1">Total bills in selected period</div>
      </div>
    </div>

    <!-- Total Collections / Paid -->
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card idp-card h-100 border-0 p-3 shadow-sm">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="stat-label text-muted">Total Collections</span>
          <span class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25 px-2 py-1">
            <i class="bi bi-check-circle me-1"></i>Credit (-)
          </span>
        </div>
        <div class="stat-val text-success">
          {{ formatTk(summary.totalPaid) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-secondary small mt-1">Total receipts collected in period</div>
      </div>
    </div>

    <!-- Net Closing Balance (Due) -->
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card idp-card h-100 border-0 p-3 shadow-sm">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="stat-label text-muted">Closing Balance</span>
          <span
            class="badge px-2 py-1"
            :class="summary.closingBalance > 0 ? 'bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25' : 'bg-success bg-opacity-25 text-success border border-success border-opacity-25'"
          >
            <i class="bi me-1" :class="summary.closingBalance > 0 ? 'bi-exclamation-circle' : 'bi-shield-check'"></i>
            {{ summary.closingBalance > 0 ? 'Total Due' : 'Cleared' }}
          </span>
        </div>
        <div
          class="stat-val"
          :class="summary.closingBalance > 0 ? 'text-danger' : 'text-success'"
        >
          {{ formatTk(summary.closingBalance) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-secondary small mt-1">
          Net outstanding balance
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ledger-summary-cards {
  font-family: inherit;
}

.ledger-summary-cards .card {
  border-radius: 8px;
  background: #1e2227 !important;
  border: 1px solid #343a40 !important;
  transition: all 0.2s ease;
}

.ledger-summary-cards .card:hover {
  background: #252b32 !important;
  border-color: #3b8eed !important;
  transform: translateY(-2px);
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
</style>
