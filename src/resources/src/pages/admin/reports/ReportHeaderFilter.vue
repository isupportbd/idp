<script setup lang="ts">
import { computed, ref } from "vue";
import ClientSearchSelect from "@/components/common/ClientSearchSelect.vue";
import MonthMatrix from "@/components/MonthMatrix.vue";
import { can } from "@/composables/useAuth";

interface Client {
  id: number;
  name?: string;
  bin?: string;
}

interface Item {
  id: number;
  name: string;
  hsCode?: string;
}

interface UnitConversion {
  id: number;
  purchaseUnit: string;
  salesUnit: string;
  factor: number;
}

const props = defineProps<{
  clients: Client[];
  selectedClientId: number | null;
  selectedClient: Client | null;
  selectedMonthYear: string;
  availableMonths: string[];
  purchaseMonths: string[];
  submissionMonths: string[];
  submissionsMap: Record<string, string>;
  filteredUnitConversions: UnitConversion[];
  selectedUnitName: string;
  filteredItems: Item[];
  purchasesCount: number;
}>();

const emit = defineEmits<{
  (e: "update:selectedClientId", val: number | null): void;
  (e: "update:selectedMonthYear", val: string): void;
  (e: "clientSelected", client: Client | null): void;
  (e: "selectUnit", id: number | null): void;
  (e: "selectItem", item: Item): void;
  (e: "clearItem"): void;
  (e: "exportActiveReport"): void;
  (e: "openSummaryModal"): void;
}>();

const showUnitDropdown = ref(false);
const showItemDropdown = ref(false);
const itemSearchText = ref("");

const hideUnitDropdown = () => {
  setTimeout(() => {
    showUnitDropdown.value = false;
  }, 200);
};

const hideItemDropdown = () => {
  setTimeout(() => {
    showItemDropdown.value = false;
  }, 200);
};

const handleItemSelect = (item: Item) => {
  itemSearchText.value = item.name;
  showItemDropdown.value = false;
  emit("selectItem", item);
};

const handleClearItem = () => {
  itemSearchText.value = "";
  emit("clearItem");
};
</script>

<template>
  <div>
    <!-- Breadcrumbs & Header -->
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">Reports</span>
        </div>
        <h4 class="text-white fw-bold mb-0">VAT Reports Suite</h4>
      </div>

      <!-- Global Monthly Summary Action -->
      <button
        type="button"
        class="btn btn-outline-primary d-flex align-items-center gap-2 fw-semibold px-3"
        style="height: 38px;"
        title="Download monthly purchases summary for all clients in Excel"
        @click="emit('openSummaryModal')"
      >
        <i class="bi bi-file-earmark-spreadsheet"></i>
        <span>Monthly Summary</span>
      </button>
    </div>

    <!-- Sleek Filter Toolbar -->
    <div class="idp-card p-3 mb-3">
      <div class="row g-2 align-items-center">
        <!-- 1. Client Autocomplete Filter -->
        <div class="col-lg-3 col-md-6">
          <ClientSearchSelect
            :model-value="selectedClientId"
            :clients="clients"
            placeholder="Type to search Client or BIN..."
            @update:model-value="emit('update:selectedClientId', $event)"
            @select="emit('clientSelected', $event)"
          />
        </div>

        <!-- 2. Smart Year-Tabbed Month Matrix Selector -->
        <div class="col-lg-2 col-md-6">
          <MonthMatrix
            :model-value="selectedMonthYear"
            :available-months="availableMonths"
            :purchase-months="purchaseMonths"
            :submission-months="submissionMonths"
            :submissions-map="submissionsMap"
            :disabled="!selectedClientId"
            placeholder="Select Month..."
            @update:model-value="emit('update:selectedMonthYear', $event)"
          />
        </div>

        <!-- 3. Unit Conversion Selector -->
        <div class="col-lg-2 col-md-4">
          <div class="position-relative">
            <div
              class="form-select idp-input d-flex align-items-center justify-content-between pe-3"
              :class="{ 'cursor-pointer': selectedClientId, 'disabled opacity-50': !selectedClientId }"
              :style="{ height: '38px', cursor: selectedClientId ? 'pointer' : 'not-allowed' }"
              tabindex="0"
              @click="selectedClientId && (showUnitDropdown = !showUnitDropdown)"
              @blur="hideUnitDropdown"
            >
              <span class="text-truncate" :class="{ 'text-muted': !selectedClientId }">{{ selectedUnitName }}</span>
            </div>
            <div
              v-if="showUnitDropdown && selectedClientId"
              class="idp-card position-absolute top-100 start-0 w-100 mt-1 shadow-lg p-1"
              style="max-height: 180px; overflow-y: auto; z-index: 1050;"
            >
              <div
                class="unit-option-item p-2 rounded cursor-pointer small text-white"
                @mousedown="emit('selectUnit', null); showUnitDropdown = false"
              >
                Unit (Default)
              </div>
              <div
                v-for="u in filteredUnitConversions"
                :key="u.id"
                class="unit-option-item p-2 rounded cursor-pointer small text-white"
                @mousedown="emit('selectUnit', u.id); showUnitDropdown = false"
              >
                {{ u.purchaseUnit }} ➔ {{ u.salesUnit }}
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Item Search Filter -->
        <div class="col-lg-4 col-md-4">
          <div class="position-relative">
            <i class="bi bi-box-seam position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
            <input
              v-model="itemSearchText"
              type="text"
              class="form-control idp-input"
              style="padding-left: 36px !important; padding-right: 32px !important; height: 38px;"
              placeholder="Type to search item..."
              :disabled="!selectedClientId || !selectedMonthYear"
              @focus="showItemDropdown = true"
              @blur="hideItemDropdown"
            />
            <button
              v-if="itemSearchText"
              class="btn btn-link btn-sm position-absolute top-50 end-0 translate-middle-y text-muted text-decoration-none p-1 me-2"
              @mousedown="handleClearItem"
            >
              ✕
            </button>
            <div
              v-if="showItemDropdown && filteredItems.length > 0"
              class="idp-card position-absolute top-100 start-0 w-100 mt-1 shadow-lg p-1"
              style="max-height: 180px; overflow-y: auto; z-index: 1050;"
            >
              <div
                v-for="i in filteredItems"
                :key="i.id"
                class="client-option-item p-2 rounded cursor-pointer"
                @mousedown="handleItemSelect(i)"
              >
                <div class="text-white small fw-medium">{{ i.name }}</div>
                <div class="text-muted font-monospace" style="font-size: 0.7rem;">
                  [{{ i.hsCode || "-" }}]
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Excel Download Button (Active Client Report) -->
        <div v-if="can('reports.export')" class="col-lg-1 col-md-4">
          <button
            type="button"
            class="btn btn-success w-100 d-flex align-items-center justify-content-center gap-1 fw-semibold px-2"
            style="height: 38px;"
            :disabled="!selectedClient || purchasesCount === 0"
            title="Download active report in Excel"
            @click="emit('exportActiveReport')"
          >
            <i class="bi bi-download"></i>
            <span>Excel</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unit-option-item:hover,
.client-option-item:hover {
  background: rgba(59, 130, 246, 0.2);
}
</style>
