<script setup lang="ts">
import { ref, computed } from "vue";
import MonthMatrix from "@/components/MonthMatrix.vue";
import ClientSearchSelect from "@/components/common/ClientSearchSelect.vue";
import { can } from "@/composables/useAuth";

interface Client {
  id: number;
  name: string;
  bin?: string;
  referenceId?: number;
  openingBalance?: number;
  serviceScope?: string;
  vatUserId?: string;
  vatPassword?: string;
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
  selectedMonthYear: string;
  availableMonths: string[];
  purchaseMonths: string[];
  submissionMonths: string[];
  submissionsMap: Record<string, string>;
  unitConversions: UnitConversion[];
  selectedUnitId: number | null;
  clientMonthItems: Item[];
  selectedItemId: number | null;
  isExportingExcel: boolean;
}>();

const emit = defineEmits<{
  (e: "update:selectedClientId", val: number | null): void;
  (e: "update:selectedMonthYear", val: string): void;
  (e: "update:selectedUnitId", val: number | null): void;
  (e: "update:selectedItemId", val: number | null): void;
  (e: "clientSelected", client: Client): void;
  (e: "exportExcel"): void;
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

const selectUnit = (id: number | null) => {
  emit("update:selectedUnitId", id);
  showUnitDropdown.value = false;
};

const selectItem = (id: number | null) => {
  emit("update:selectedItemId", id);
  const it = props.clientMonthItems.find((i) => i.id === id);
  itemSearchText.value = it ? `${it.name}${it.hsCode ? ` [${it.hsCode}]` : ""}` : "";
  showItemDropdown.value = false;
};

const clearItemFilter = () => {
  itemSearchText.value = "";
  emit("update:selectedItemId", null);
};

const filteredItems = computed(() => {
  if (!itemSearchText.value.trim()) return props.clientMonthItems;
  const q = itemSearchText.value.toLowerCase().trim();
  return props.clientMonthItems.filter(
    (i) => i.name.toLowerCase().includes(q) || (i.hsCode && i.hsCode.toLowerCase().includes(q))
  );
});

const selectedUnitName = computed(() => {
  if (!props.selectedUnitId) return "Original Unit";
  const u = props.unitConversions.find((x) => x.id === props.selectedUnitId);
  return u ? `${u.purchaseUnit} ➔ ${u.salesUnit}` : "Original Unit";
});
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
        <div class="col-lg-4 col-md-6">
          <ClientSearchSelect
            :model-value="selectedClientId"
            :clients="clients"
            placeholder="Type to search Client or BIN..."
            @update:model-value="emit('update:selectedClientId', $event)"
            @select="emit('clientSelected', $event)"
          />
        </div>

        <!-- 2. Smart Year-Tabbed Month Matrix Selector -->
        <div class="col-lg-3 col-md-6">
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
              style="z-index: 1050; max-height: 200px; overflow-y: auto;"
            >
              <div
                class="dropdown-item-idp px-2.5 py-1.5 rounded cursor-pointer small"
                :class="{ 'bg-primary text-white': selectedUnitId === null }"
                @mousedown="selectUnit(null)"
              >
                Original Unit
              </div>
              <div
                v-for="u in unitConversions"
                :key="u.id"
                class="dropdown-item-idp px-2.5 py-1.5 rounded cursor-pointer small"
                :class="{ 'bg-primary text-white': selectedUnitId === u.id }"
                @mousedown="selectUnit(u.id)"
              >
                {{ u.purchaseUnit }} ➔ {{ u.salesUnit }} (x{{ u.factor }})
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Item Search Filter -->
        <div class="col-lg-2 col-md-4">
          <div class="position-relative">
            <input
              v-model="itemSearchText"
              type="text"
              class="form-control idp-input pe-4"
              :disabled="!selectedClientId"
              placeholder="Filter by item..."
              style="height: 38px;"
              @focus="showItemDropdown = true"
              @blur="hideItemDropdown"
            />
            <button
              v-if="itemSearchText"
              class="btn btn-sm btn-link position-absolute end-0 top-50 translate-middle-y text-muted pe-2"
              type="button"
              @click="clearItemFilter"
            >
              ✕
            </button>
            <div
              v-if="showItemDropdown && filteredItems.length > 0"
              class="idp-card position-absolute top-100 start-0 w-100 mt-1 shadow-lg p-1"
              style="z-index: 1050; max-height: 220px; overflow-y: auto;"
            >
              <div
                class="dropdown-item-idp px-2.5 py-1.5 rounded cursor-pointer small"
                :class="{ 'bg-primary text-white': selectedItemId === null }"
                @mousedown="selectItem(null)"
              >
                All Items
              </div>
              <div
                v-for="it in filteredItems"
                :key="it.id"
                class="dropdown-item-idp px-2.5 py-1.5 rounded cursor-pointer small d-flex align-items-center justify-content-between"
                :class="{ 'bg-primary text-white': selectedItemId === it.id }"
                @mousedown="selectItem(it.id)"
              >
                <span class="text-truncate me-2">{{ it.name }}</span>
                <span v-if="it.hsCode" class="font-monospace text-muted small">[{{ it.hsCode }}]</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Excel Download Button (Active Client Report) -->
        <div v-if="can('reports.export')" class="col-lg-1 col-md-4">
          <button
            type="button"
            class="btn btn-success w-100 d-flex align-items-center justify-content-center gap-1.5 fw-semibold"
            :disabled="!selectedClientId || isExportingExcel"
            style="height: 38px;"
            title="Export Excel report for this client"
            @click="emit('exportExcel')"
          >
            <span v-if="isExportingExcel" class="spinner-border spinner-border-sm"></span>
            <i v-else class="bi bi-file-earmark-excel"></i>
            <span class="d-none d-lg-inline">Excel</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropdown-item-idp {
  color: #e2e8f0;
  transition: background 0.12s ease;
}
.dropdown-item-idp:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
