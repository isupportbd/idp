<script setup lang="ts">
import MonthNavigator from "@/components/MonthNavigator.vue";
import SearchInput from "@/components/common/SearchInput.vue";
import IdpSelect from "@/components/common/IdpSelect.vue";

defineProps<{
  activeTab: string;
  billsCount: number;
  collectionsCount: number;
  duesCount: number;
  missingCount: number;
  selectedReferenceId: any;
  referenceOptions: { value: string | number; label: string }[];
  searchQuery: string;
  selectedMonth: string;
}>();

const emit = defineEmits<{
  "update:activeTab": [tab: "invoices" | "collections" | "dues" | "missing"];
  "update:selectedReferenceId": [val: any];
  "update:searchQuery": [val: string];
  "update:selectedMonth": [val: string];
}>();
</script>

<template>
  <div class="filter-panel p-2 mb-3 d-print-none d-flex align-items-center justify-content-between gap-2">
    <!-- Left: Navigation Tabs with matching 38px height -->
    <div class="d-flex align-items-center gap-1 flex-nowrap overflow-x-auto custom-scrollbar pe-1">
      <button
        type="button"
        class="btn tab-btn"
        :class="activeTab === 'invoices' ? 'tab-btn-active' : 'tab-btn-inactive'"
        @click="emit('update:activeTab', 'invoices')"
      >
        <i class="bi bi-receipt"></i>
        <span>Invoices ({{ billsCount }})</span>
      </button>

      <button
        type="button"
        class="btn tab-btn"
        :class="activeTab === 'collections' ? 'tab-btn-active' : 'tab-btn-inactive'"
        @click="emit('update:activeTab', 'collections')"
      >
        <i class="bi bi-wallet2"></i>
        <span>Collections ({{ collectionsCount }})</span>
      </button>

      <button
        type="button"
        class="btn tab-btn"
        :class="activeTab === 'dues' ? 'tab-btn-active' : 'tab-btn-inactive'"
        @click="emit('update:activeTab', 'dues')"
      >
        <i class="bi bi-exclamation-circle"></i>
        <span>Due ({{ duesCount }})</span>
      </button>

      <button
        type="button"
        class="btn tab-btn"
        :class="activeTab === 'missing' ? 'tab-btn-warning-active' : 'tab-btn-inactive'"
        @click="emit('update:activeTab', 'missing')"
      >
        <i class="bi bi-file-earmark-plus"></i>
        <span>Missing ({{ missingCount }})</span>
      </button>
    </div>

    <!-- Right: Reference Filter, Search & Month Navigator (Fixed 38px heights) -->
    <div class="d-flex align-items-center gap-1 flex-nowrap ms-auto flex-shrink-0">
      <div class="ref-filter-slot">
        <IdpSelect
          :model-value="selectedReferenceId"
          :options="referenceOptions"
          min-width="180px"
          placeholder="All References"
          @update:model-value="emit('update:selectedReferenceId', $event)"
        />
      </div>

      <div class="search-slot">
        <SearchInput
          :model-value="searchQuery"
          placeholder="Search invoice, client, receipt..."
          size="md"
          max-width="240px"
          min-width="200px"
          @update:model-value="emit('update:searchQuery', $event)"
        />
      </div>

      <div class="month-nav-container" style="width: 175px; flex-shrink: 0;">
        <MonthNavigator
          :model-value="selectedMonth"
          @update:model-value="emit('update:selectedMonth', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-panel {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
}

.tab-btn {
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.84rem;
  font-weight: 600;
  padding: 0 0.85rem;
  border-radius: 6px;
  white-space: nowrap;
  transition: all 0.15s ease-in-out;
  border: 1px solid transparent;
}

.tab-btn-active {
  background: #0d6efd;
  color: #fff;
  border-color: #0d6efd;
}

.tab-btn-inactive {
  background: transparent;
  color: #adb5bd;
  border-color: #343a40;
}

.tab-btn-inactive:hover {
  background: #282d34;
  color: #fff;
  border-color: #495057;
}

.tab-btn-warning-active {
  background: #ffc107;
  color: #000;
  border-color: #ffc107;
}

.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #343a40;
  border-radius: 2px;
}
</style>
