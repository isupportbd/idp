<script setup lang="ts">
defineProps<{
  activeTab: string;
  stats: {
    totalPreviousDueAmount?: number;
    totalBilledAmount: number;
    totalInvoicesCount: number;
    totalDueAmount: number;
  };
  totalCollectionsAmount: number;
  collectionsCount: number;
  dueClientsCount: number;
  missingBillsCount: number;
  missingReadyCount: number;
}>();

const emit = defineEmits<{
  "update:activeTab": [tab: "invoices" | "collections" | "dues" | "missing"];
}>();
</script>

<template>
  <div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-xl-5 g-3 mb-3 d-print-none">
    <!-- Previous Due -->
    <div class="col">
      <div class="stat-pill">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Previous Due</span>
          <i class="bi bi-clock-history text-info"></i>
        </div>
        <div class="stat-val text-white">
          {{ (stats.totalPreviousDueAmount || 0).toLocaleString() }} <span class="fs-6 fw-normal text-muted">Tk</span>
        </div>
        <div class="text-secondary small mt-1 font-monospace">Pre-Period unadjusted</div>
      </div>
    </div>

    <!-- Total Invoices -->
    <div class="col">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': activeTab === 'invoices' }"
        @click="emit('update:activeTab', 'invoices')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Total Invoiced</span>
          <i class="bi bi-receipt text-primary"></i>
        </div>
        <div class="stat-val text-white">{{ stats.totalBilledAmount.toLocaleString() }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        <div class="text-secondary small mt-1 font-monospace">{{ stats.totalInvoicesCount }} Invoices</div>
      </div>
    </div>

    <!-- Total Collections -->
    <div class="col">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': activeTab === 'collections' }"
        @click="emit('update:activeTab', 'collections')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Total Collections</span>
          <i class="bi bi-check-circle-fill text-success"></i>
        </div>
        <div class="stat-val text-success">{{ totalCollectionsAmount.toLocaleString() }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        <div class="text-secondary small mt-1 font-monospace">{{ collectionsCount }} Receipts</div>
      </div>
    </div>

    <!-- Total Outstanding Dues -->
    <div class="col">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': activeTab === 'dues' }"
        @click="emit('update:activeTab', 'dues')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Total Dues</span>
          <i class="bi bi-exclamation-octagon text-danger"></i>
        </div>
        <div class="stat-val text-danger">{{ stats.totalDueAmount.toLocaleString() }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        <div class="text-secondary small mt-1 font-monospace">{{ dueClientsCount }} Due Invoices</div>
      </div>
    </div>

    <!-- Missing Bills -->
    <div class="col">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': activeTab === 'missing' }"
        @click="emit('update:activeTab', 'missing')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Missing Bills</span>
          <i class="bi bi-clock-history text-warning"></i>
        </div>
        <div class="stat-val text-warning">{{ missingBillsCount }} <span class="fs-6 fw-normal text-muted">Clients</span></div>
        <div class="text-secondary small mt-1 font-monospace">{{ missingReadyCount }} Ready to Bill</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-pill {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  transition: all 0.2s ease;
}

.stat-pill:hover {
  background: #252b32;
  border-color: #0d6efd;
  transform: translateY(-2px);
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

.cursor-pointer {
  cursor: pointer;
}
</style>
