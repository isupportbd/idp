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
      <div class="card idp-card h-100 border-0 p-3 shadow-sm bg-dark bg-opacity-75">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="text-muted small fw-medium text-uppercase tracking-wider">Opening Balance</span>
          <span class="badge bg-secondary bg-opacity-25 text-info border border-info border-opacity-25 px-2 py-1">
            <i class="bi bi-clock-history me-1"></i>Pre-Period
          </span>
        </div>
        <div class="h3 mb-0 fw-bold font-monospace text-light">
          {{ formatTk(summary.openingBalance) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-muted small mt-1">Previous unadjusted dues</div>
      </div>
    </div>

    <!-- Total Invoiced / Billed -->
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card idp-card h-100 border-0 p-3 shadow-sm bg-dark bg-opacity-75">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="text-muted small fw-medium text-uppercase tracking-wider">Total Invoiced</span>
          <span class="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25 px-2 py-1">
            <i class="bi bi-receipt me-1"></i>Debit (+)
          </span>
        </div>
        <div class="h3 mb-0 fw-bold font-monospace text-primary">
          {{ formatTk(summary.totalBilled) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-muted small mt-1">Total bills in selected period</div>
      </div>
    </div>

    <!-- Total Collections / Paid -->
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card idp-card h-100 border-0 p-3 shadow-sm bg-dark bg-opacity-75">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="text-muted small fw-medium text-uppercase tracking-wider">Total Collections</span>
          <span class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25 px-2 py-1">
            <i class="bi bi-check-circle me-1"></i>Credit (-)
          </span>
        </div>
        <div class="h3 mb-0 fw-bold font-monospace text-success">
          {{ formatTk(summary.totalPaid) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-muted small mt-1">Total receipts collected in period</div>
      </div>
    </div>

    <!-- Net Closing Balance (Due) -->
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card idp-card h-100 border-0 p-3 shadow-sm bg-dark bg-opacity-75">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="text-muted small fw-medium text-uppercase tracking-wider">Closing Balance</span>
          <span
            class="badge px-2 py-1"
            :class="summary.closingBalance > 0 ? 'bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25' : 'bg-success bg-opacity-25 text-success border border-success border-opacity-25'"
          >
            <i class="bi me-1" :class="summary.closingBalance > 0 ? 'bi-exclamation-circle' : 'bi-shield-check'"></i>
            {{ summary.closingBalance > 0 ? 'Total Due' : 'Cleared' }}
          </span>
        </div>
        <div
          class="h3 mb-0 fw-bold font-monospace"
          :class="summary.closingBalance > 0 ? 'text-danger' : 'text-success'"
        >
          {{ formatTk(summary.closingBalance) }} <span class="fs-6 text-muted fw-normal">Tk</span>
        </div>
        <div class="text-muted small mt-1">
          Net outstanding balance
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ledger-summary-cards .card {
  border-radius: 10px;
  background-color: #14171a !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}
.tracking-wider {
  letter-spacing: 0.05em;
}
</style>
