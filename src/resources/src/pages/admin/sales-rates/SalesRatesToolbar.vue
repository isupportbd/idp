<script setup lang="ts">
import SearchInput from "@/components/common/SearchInput.vue";
import IdpSelect from "@/components/common/IdpSelect.vue";

const props = defineProps<{
  searchQuery: string;
  selectedClient: string;
  selectedItem: string;
  selectedStatus: string;
  clientOptions: Array<{ value: string; label: string }>;
  itemOptions: Array<{ value: string; label: string }>;
  statusOptions: Array<{ value: string; label: string }>;
  itemsPerPage: number;
  hasActiveFilters: boolean;
}>();

const emit = defineEmits<{
  "update:searchQuery": [val: string];
  "update:selectedClient": [val: any];
  "update:selectedItem": [val: any];
  "update:selectedStatus": [val: any];
  "update:itemsPerPage": [val: number];
  "clearFilters": [];
}>();
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <!-- Left Filters -->
    <div class="d-flex flex-wrap align-items-center gap-2 flex-grow-1">
      <!-- Search Input -->
      <SearchInput
        :model-value="searchQuery"
        placeholder="Search client, BIN, item, HS code..."
        max-width="320px"
        min-width="240px"
        size="md"
        @update:model-value="emit('update:searchQuery', $event)"
      />

      <!-- Client Filter -->
      <IdpSelect
        :model-value="selectedClient"
        :options="clientOptions"
        min-width="190px"
        @update:model-value="emit('update:selectedClient', $event)"
      />

      <!-- Item Filter -->
      <IdpSelect
        :model-value="selectedItem"
        :options="itemOptions"
        min-width="200px"
        @update:model-value="emit('update:selectedItem', $event)"
      />

      <!-- Status Filter -->
      <IdpSelect
        :model-value="selectedStatus"
        :options="statusOptions"
        min-width="140px"
        @update:model-value="emit('update:selectedStatus', $event)"
      />

      <!-- Clear Filter Icon Button -->
      <button
        v-if="hasActiveFilters"
        type="button"
        class="btn btn-outline-danger btn-sm px-2 d-flex align-items-center justify-content-center"
        title="Clear all filters"
        style="height: 38px;"
        @click="emit('clearFilters')"
      >
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <!-- Right Rows selector -->
    <div class="d-flex align-items-center gap-2">
      <label class="text-muted small mb-0">Rows:</label>
      <select
        :value="itemsPerPage"
        class="form-select form-select-sm idp-input"
        style="width: 75px; height: 38px;"
        @change="emit('update:itemsPerPage', Number(($event.target as HTMLSelectElement).value))"
      >
        <option :value="10">10</option>
        <option :value="25">25</option>
        <option :value="50">50</option>
      </select>
    </div>
  </div>
</template>
