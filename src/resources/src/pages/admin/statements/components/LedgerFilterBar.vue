<script setup lang="ts">
import { computed } from "vue";
import ClientSearchSelect from "@/components/common/ClientSearchSelect.vue";
import IdpSelect from "@/components/common/IdpSelect.vue";
import MonthNavigator from "@/components/MonthNavigator.vue";
import type { CustomerTypeOption, ReferenceOption } from "../types";

const props = defineProps<{
  clientId: number | null;
  customerTypeId: number | string;
  referenceId: number | string;
  fromMonth: string;
  toMonth: string;
  customerTypes: CustomerTypeOption[];
  references: ReferenceOption[];
  isLoading: boolean;
  canExport: boolean;
}>();

const emit = defineEmits<{
  "update:clientId": [value: number | null];
  "update:customerTypeId": [value: number | string];
  "update:referenceId": [value: number | string];
  "update:fromMonth": [value: string];
  "update:toMonth": [value: string];
  reset: [];
  export: [];
  print: [];
}>();

const customerTypeOptions = computed(() => [
  { value: "all", label: `All Types (${props.customerTypes.length})` },
  ...props.customerTypes.map((t) => ({ value: t.id, label: t.name }))
]);

const referenceOptions = computed(() => [
  { value: "all", label: `All References (${props.references.length})` },
  ...props.references.map((r) => ({ value: r.id, label: `Ref: ${r.name}` }))
]);
</script>

<template>
  <div class="card idp-card mb-4 border-0 shadow-sm p-3 bg-dark bg-opacity-75 ledger-filter-bar">
    <div class="row g-2 align-items-center">
      <!-- Client Autocomplete Search -->
      <div class="col-12 col-md-3">
        <ClientSearchSelect
          :model-value="clientId"
          placeholder="Type to search Client or BIN..."
          clearable
          @update:model-value="emit('update:clientId', $event)"
        />
      </div>

      <!-- Client Type Filter (Before Reference) using IdpSelect -->
      <div class="col-12 col-sm-6 col-md-2">
        <IdpSelect
          :model-value="customerTypeId"
          :options="customerTypeOptions"
          width="100%"
          min-width="100%"
          height="38px"
          @update:model-value="emit('update:customerTypeId', $event ?? 'all')"
        />
      </div>

      <!-- Reference Filter using IdpSelect -->
      <div class="col-12 col-sm-6 col-md-2">
        <IdpSelect
          :model-value="referenceId"
          :options="referenceOptions"
          width="100%"
          min-width="100%"
          height="38px"
          @update:model-value="emit('update:referenceId', $event ?? 'all')"
        />
      </div>

      <!-- Month Range (From - To) -->
      <div class="col-12 col-md-5">
        <div class="d-flex align-items-center gap-2">
          <MonthNavigator
            :model-value="fromMonth"
            class="flex-grow-1"
            @update:model-value="emit('update:fromMonth', $event)"
          />
          <span class="text-muted small px-1 fw-bold">to</span>
          <MonthNavigator
            :model-value="toMonth"
            class="flex-grow-1"
            @update:model-value="emit('update:toMonth', $event)"
          />
        </div>
      </div>
    </div>

    <!-- Actions toolbar -->
    <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top border-secondary border-opacity-25">
      <div class="small text-muted">
        <i class="bi bi-info-circle me-1"></i>
        <span>Filtered Period: <strong class="text-light">{{ fromMonth }}</strong> to <strong class="text-light">{{ toMonth }}</strong></span>
      </div>
      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
          @click="emit('reset')"
        >
          <i class="bi bi-arrow-counterclockwise"></i>
          <span>Reset</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-info d-flex align-items-center gap-1"
          @click="emit('print')"
        >
          <i class="bi bi-printer"></i>
          <span>Print</span>
        </button>
        <button
          v-if="canExport"
          type="button"
          class="btn btn-sm btn-success d-flex align-items-center gap-1"
          :disabled="isLoading"
          @click="emit('export')"
        >
          <i class="bi bi-file-earmark-excel"></i>
          <span>Export Excel</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ledger-filter-bar {
  border-radius: 10px;
  background-color: #14171a !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}
.idp-input {
  background-color: #1e2329 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  height: 38px;
}
.idp-input:focus {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25) !important;
}
</style>
