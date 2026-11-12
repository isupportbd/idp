<script setup lang="ts">
import { can } from "@/composables/useAuth";
import type { SalesRate } from "./types";

const props = defineProps<{
  rates: SalesRate[];
  isLoading: boolean;
  currentPage: number;
  itemsPerPage: number;
  totalFiltered: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  "update:currentPage": [val: number];
  edit: [rate: SalesRate];
  history: [rate: SalesRate];
  delete: [rate: SalesRate];
}>();

const formatNumber = (val: any) => {
  if (val === undefined || val === null || val === "") return "";
  const num = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return val;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
</script>

<template>
  <div class="idp-table-wrapper">
    <div class="table-responsive sales-rates-scroll-container">
      <table class="table idp-table table-sm align-middle text-nowrap">
        <thead class="sales-rates-sticky-header">
          <tr>
            <th class="text-center" style="width: 50px;">#</th>
            <th class="text-start">Client</th>
            <th class="text-start">Commodity Item</th>
            <th class="text-center" style="width: 90px;">Unit</th>
            <th class="text-end" style="width: 130px;">Sales Rate</th>
            <th class="text-end" style="width: 100px;">VAT (%)</th>
            <th class="text-end" style="width: 120px;">Addition (%)</th>
            <th class="text-center" style="width: 140px;">Activation Date</th>
            <th class="text-center" style="width: 110px;">Status</th>
            <th class="text-end" style="width: 140px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="isLoading">
            <td colspan="10" class="text-center py-5 text-muted">
              <span class="spinner-border spinner-border-sm text-primary me-2"></span>
              Loading sales rates...
            </td>
          </tr>

          <tr v-else-if="rates.length === 0">
            <td colspan="10" class="text-center py-5 text-muted">
              <i class="bi bi-percent fs-3 d-block mb-2 text-secondary"></i>
              No sales rates found matching your criteria.
            </td>
          </tr>

          <tr v-for="(r, index) in rates" :key="r.id">
            <!-- 1. Serial # (Center) -->
            <td class="text-center text-muted small">{{ (currentPage - 1) * itemsPerPage + index + 1 }}</td>

            <!-- 2. Client (Left) -->
            <td class="text-start">
              <div class="fw-bold text-white">{{ r.clientName }}</div>
              <div class="text-muted small">BIN: {{ r.clientBin }}</div>
            </td>

            <!-- 3. Commodity Item (Left) -->
            <td class="text-start">
              <div class="text-light">{{ r.itemName }}</div>
              <div class="text-info small font-monospace">[{{ r.itemHsCode }}]</div>
            </td>

            <!-- 4. Unit (Center) -->
            <td class="text-center">
              <span class="badge bg-dark border border-secondary text-light">{{ r.unitName }}</span>
            </td>

            <!-- 5. Sales Rate (Right) -->
            <td class="text-end font-monospace text-white fw-semibold">
              {{ formatNumber(r.salesRate) }}
            </td>

            <!-- 6. VAT Rate (Right) -->
            <td class="text-end font-monospace text-success">
              {{ formatNumber(r.vatRate) }}%
            </td>

            <!-- 7. Addition (Right) -->
            <td class="text-end font-monospace text-warning">
              {{ formatNumber(r.additionPercent) }}%
            </td>

            <!-- 8. Activation Date (Center) -->
            <td class="text-center text-muted small">
              {{ r.activationDate }}
            </td>

            <!-- 9. Status (Center) -->
            <td class="text-center">
              <span
                class="badge"
                :class="r.status === 'Active' ? 'bg-success bg-opacity-25 text-success border border-success' : 'bg-secondary bg-opacity-25 text-muted border border-secondary'"
              >
                {{ r.status }}
              </span>
            </td>

            <!-- 10. Actions (Right) -->
            <td class="text-end">
              <div class="d-inline-flex align-items-center justify-content-end gap-1">
                <button
                  v-if="r.status === 'Active' && can('sales_rates.edit')"
                  class="btn btn-sm btn-outline-info"
                  title="Edit Rate"
                  @click="emit('edit', r)"
                >
                  <i class="bi bi-pencil"></i>
                </button>

                <button
                  class="btn btn-sm btn-outline-primary"
                  title="Rate History"
                  @click="emit('history', r)"
                >
                  <i class="bi bi-clock-history"></i>
                </button>

                <button
                  v-if="r.status === 'Active' && can('sales_rates.delete')"
                  class="btn btn-sm btn-outline-danger"
                  title="Delete Rate"
                  @click="emit('delete', r)"
                >
                  <i class="bi bi-trash"></i>
                </button>
                <button
                  v-else-if="r.status !== 'Active'"
                  class="btn btn-sm btn-outline-secondary"
                  disabled
                  title="Frozen Archive"
                >
                  <i class="bi bi-lock"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalFiltered > 0" class="d-flex flex-wrap justify-content-between align-items-center p-3 border-top border-secondary border-opacity-25">
      <span class="text-muted small">
        Showing <strong>{{ (currentPage - 1) * itemsPerPage + 1 }}</strong> to
        <strong>{{ Math.min(currentPage * itemsPerPage, totalFiltered) }}</strong> of
        <strong>{{ totalFiltered }}</strong> rates
      </span>

      <div v-if="totalPages > 1" class="d-flex align-items-center gap-1">
        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm"
          :disabled="currentPage <= 1"
          @click="emit('update:currentPage', currentPage - 1)"
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
            @click="emit('update:currentPage', p)"
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
          @click="emit('update:currentPage', currentPage + 1)"
        >
          Next <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sales-rates-scroll-container {
  max-height: calc(100vh - 280px);
  min-height: 250px;
  overflow-y: auto;
  overflow-x: auto;
}

.sales-rates-sticky-header th {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: #1a1d21 !important;
  box-shadow: inset 0 -1px 0 var(--idp-border, #3b424b);
}
</style>
