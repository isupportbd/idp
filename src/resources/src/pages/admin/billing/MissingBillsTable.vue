<script setup lang="ts">
defineProps<{
  missingBills: any[];
  loading: boolean;
  selectedMonth: string;
  searchQuery: string;
  currentPage: number;
  itemsPerPage: number;
  isBatchGenerating: boolean;
  canCreate: boolean;
}>();

const emit = defineEmits<{
  (e: "batchGenerate"): void;
  (e: "createBill", clientId: number, targetMonth: string): void;
}>();
</script>

<template>
  <div class="table-card shadow-sm">
    <!-- Missing Bills Action Banner -->
    <div class="px-3 py-2 bg-dark bg-opacity-40 border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="d-flex align-items-center gap-2">
        <span class="badge bg-warning text-dark px-2 py-1 fw-bold" style="font-size: 0.8rem;">
          {{ missingBills.length }} Missing Clients
        </span>
        <span class="text-secondary small">
          Target Tax Period: <strong class="text-light font-monospace">{{ selectedMonth }}</strong>
        </span>
      </div>

      <button
        v-if="canCreate"
        type="button"
        class="btn btn-sm btn-warning text-dark fw-bold px-3 shadow-sm d-flex align-items-center gap-1.5"
        style="height: 32px; font-size: 0.82rem;"
        :disabled="isBatchGenerating || missingBills.filter(m => m.isSubmitted).length === 0"
        @click="emit('batchGenerate')"
      >
        <span v-if="isBatchGenerating" class="spinner-border spinner-border-sm text-dark"></span>
        <i v-else class="bi bi-lightning-charge-fill"></i>
        <span>Batch Generate Bills ({{ missingBills.filter(m => m.isSubmitted).length }})</span>
      </button>
    </div>

    <table class="table-custom">
      <thead>
        <tr>
          <th style="width: 5%;">#</th>
          <th style="width: 30%;">Client Name & BIN</th>
          <th style="width: 15%;">Reference</th>
          <th style="width: 12%;">Service Scope</th>
          <th style="width: 14%;">Submission ID</th>
          <th style="width: 12%; text-align: right;">Service Fee (Tk)</th>
          <th style="width: 12%; text-align: right;" class="d-print-none">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && missingBills.length === 0">
          <td colspan="7" class="text-center py-4 text-muted">
            <div class="spinner-border spinner-border-sm text-primary me-2"></div>
            Loading missing clients...
          </td>
        </tr>

        <tr v-else-if="missingBills.length === 0 && !searchQuery">
          <td colspan="7" class="text-center py-5 text-success">
            <i class="bi bi-check-circle-fill fs-2 d-block mb-2"></i>
            All active clients have been billed for {{ selectedMonth }}!
          </td>
        </tr>

        <tr v-else-if="missingBills.length === 0 && searchQuery">
          <td colspan="7" class="text-center py-5 text-muted">
            <i class="bi bi-search fs-2 d-block mb-2"></i>
            No missing clients match "{{ searchQuery }}"
          </td>
        </tr>

        <tr v-for="(item, idx) in missingBills" :key="item.id">
          <!-- Index -->
          <td class="text-muted">{{ (currentPage - 1) * itemsPerPage + idx + 1 }}</td>

          <!-- Client Name & BIN -->
          <td>
            <div class="fw-bold text-white text-truncate" style="max-width: 320px; font-size: 0.92rem;">
              {{ item.companyName }}
            </div>
            <div v-if="item.proprietorName" class="text-secondary small text-truncate" style="max-width: 320px; font-size: 0.78rem;">
              Proprietor: {{ item.proprietorName }}
            </div>
            <div v-if="item.binNumber" class="badge bg-dark border border-secondary text-info font-monospace mt-1" style="font-size: 0.78rem;">
              BIN: {{ item.binNumber }}
            </div>
          </td>

          <!-- Reference -->
          <td>
            <span class="text-light small">{{ item.referenceName || 'Direct Acquisition' }}</span>
          </td>

          <!-- Scope -->
          <td>
            <span class="badge" :class="item.vatServiceType === 'FULL' ? 'bg-primary' : 'bg-secondary'">
              {{ item.vatServiceType }}
            </span>
          </td>

          <!-- Submission ID -->
          <td>
            <div v-if="item.isSubmitted" class="d-flex align-items-center gap-1">
              <i class="bi bi-check-circle-fill text-success" style="font-size: 0.85rem;"></i>
              <span class="font-monospace fw-bold text-success" style="font-size: 0.88rem;">#{{ item.submissionId }}</span>
            </div>
            <div v-else class="d-flex align-items-center gap-1 text-danger small">
              <i class="bi bi-dash-circle" style="font-size: 0.82rem;"></i>
              <span>Not Submitted</span>
            </div>
          </td>

          <!-- Service Fee -->
          <td style="text-align: right;">
            <span class="font-monospace fw-bold text-white">{{ item.monthlyServiceFee.toFixed(2) }}</span>
          </td>

          <!-- Action -->
          <td style="text-align: right;" class="d-print-none text-nowrap">
            <button
              v-if="canCreate"
              type="button"
              class="btn btn-sm btn-primary px-3 fw-semibold shadow-sm d-inline-flex align-items-center gap-1 ms-auto text-nowrap"
              style="white-space: nowrap;"
              :disabled="!item.isSubmitted"
              @click="emit('createBill', item.id, item.targetMonth)"
            >
              <i class="bi bi-plus-lg"></i>
              <span class="text-nowrap">Create Bill</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
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

.table-custom th {
  background: #15181b;
  color: #adb5bd;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #343a40;
}

.table-custom td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #282d34;
  vertical-align: middle;
}

.table-custom tr:hover td {
  background: #252b32;
}
</style>
