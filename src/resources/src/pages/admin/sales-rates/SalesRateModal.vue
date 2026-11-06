<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ClientOption, ItemOption, UnitOption } from "./types";

const props = defineProps<{
  isEditing: boolean;
  initialData: {
    id: number;
    clientId: string | number;
    itemId: string | number;
    unitId: number;
    salesRate: string | number;
    vatRate: number;
    additionPercent: number;
    activationDate: string;
    status: "Active" | "Frozen";
    clientName?: string;
    itemName?: string;
  };
  clientsList: ClientOption[];
  unitsList: UnitOption[];
  clientPurchasedItems: ItemOption[];
  isFetchingClientItems: boolean;
  formError: string;
  isSubmitting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  clientSelected: [client: ClientOption];
  save: [payload: any];
}>();

const form = ref({ ...props.initialData });
const clientSearchText = ref(props.initialData.clientName || "");
const itemSearchText = ref(props.initialData.itemName || "");
const showClientDropdown = ref(false);
const showItemDropdown = ref(false);

watch(
  () => props.initialData,
  (val) => {
    form.value = { ...val };
    clientSearchText.value = val.clientName || "";
    itemSearchText.value = val.itemName || "";
  },
  { deep: true }
);

const todayDate = computed(() => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
});

const modalFilteredClients = computed(() => {
  if (!clientSearchText.value.trim()) return [];
  const q = clientSearchText.value.toLowerCase().trim();
  return props.clientsList.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.bin || "").toLowerCase().includes(q));
});

const modalFilteredItems = computed(() => {
  if (!form.value.clientId) return [];
  if (!itemSearchText.value.trim() || form.value.itemId) {
    return [];
  }
  const q = itemSearchText.value.toLowerCase().trim();
  return props.clientPurchasedItems
    .filter((i) => i.name.toLowerCase().includes(q) || (i.hsCode && i.hsCode.toLowerCase().includes(q)))
    .slice(0, 50);
});

const modalComputedVatableValue = computed(() => {
  const sr = Number(form.value.salesRate);
  const vr = Number(form.value.vatRate);
  if (!sr || isNaN(sr) || isNaN(vr) || vr < 0) return "0.00";
  const vatable = sr / (1 + vr / 100);
  return vatable.toFixed(2);
});

const selectModalClient = (client: ClientOption) => {
  form.value.clientId = client.id;
  clientSearchText.value = client.name;
  showClientDropdown.value = false;
  form.value.itemId = "";
  itemSearchText.value = "";
  emit("clientSelected", client);
};

// Auto-select if parent updates clientPurchasedItems to length 1
watch(
  () => props.clientPurchasedItems,
  (items) => {
    if (!props.isEditing && items.length === 1) {
      const first = items[0];
      form.value.itemId = first.id;
      itemSearchText.value = first.name;
    }
  }
);

const selectModalItem = (item: ItemOption) => {
  form.value.itemId = item.id;
  itemSearchText.value = item.name;
  showItemDropdown.value = false;
};

const handleClientInput = () => {
  form.value.clientId = "";
  form.value.itemId = "";
  itemSearchText.value = "";
  showClientDropdown.value = clientSearchText.value.trim().length > 0;
};

const handleClientFocus = () => {
  if (clientSearchText.value.trim().length > 0 && !props.isEditing) {
    showClientDropdown.value = true;
  }
};

const handleClientBlur = () => {
  setTimeout(() => {
    showClientDropdown.value = false;
  }, 200);
};

const handleItemInput = () => {
  form.value.itemId = "";
  if (form.value.clientId && itemSearchText.value.trim().length > 0) {
    showItemDropdown.value = true;
  } else {
    showItemDropdown.value = false;
  }
};

const handleItemFocus = () => {
  if (!props.isEditing && form.value.clientId && itemSearchText.value.trim().length > 0 && !form.value.itemId) {
    showItemDropdown.value = true;
  }
};

const handleItemBlur = () => {
  setTimeout(() => {
    showItemDropdown.value = false;
  }, 200);
};

const onSubmit = () => {
  emit("save", { ...form.value });
};
</script>

<template>
  <div class="modal fade show d-block" tabindex="-1" style="background: rgba(0, 0, 0, 0.75);">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content idp-card">
        <div class="modal-header border-secondary border-opacity-25">
          <h5 class="modal-title text-white">
            {{ isEditing ? 'Edit Sales Rate' : 'Add Sales Rate' }}
          </h5>
          <button type="button" class="btn-close btn-close-white" @click="emit('close')"></button>
        </div>

        <div class="modal-body p-4">
          <div v-if="formError" class="alert alert-danger py-2 small mb-3">{{ formError }}</div>

          <div class="row g-3">
            <!-- Row 1: Client & Commodity Item -->
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">Client <span class="text-danger">*</span></label>
              </div>
              <div class="position-relative">
                <input
                  v-model="clientSearchText"
                  type="text"
                  class="form-control idp-input"
                  :disabled="isEditing"
                  placeholder="Type to search client or BIN..."
                  @focus="handleClientFocus"
                  @input="handleClientInput"
                  @blur="handleClientBlur"
                />

                <!-- Client Autocomplete Dropdown -->
                <div
                  v-if="showClientDropdown && !isEditing && modalFilteredClients.length > 0"
                  class="position-absolute start-0 top-100 w-100 mt-1 bg-dark border border-secondary rounded shadow-lg"
                  style="max-height: 220px; overflow-y: auto; z-index: 1050;"
                >
                  <div
                    v-for="c in modalFilteredClients"
                    :key="c.id"
                    class="p-2 border-bottom border-secondary border-opacity-25 cursor-pointer hover-bg-secondary text-start"
                    @mousedown.prevent="selectModalClient(c)"
                  >
                    <div class="text-white small fw-semibold">{{ c.name }}</div>
                    <div class="text-muted small font-monospace">BIN: {{ c.bin }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">Commodity Item <span class="text-danger">*</span></label>
                <span v-if="form.clientId && clientPurchasedItems.length > 0" class="text-success small" style="font-size: 0.72rem;">
                  <i class="bi bi-bag-check-fill me-1"></i> {{ clientPurchasedItems.length }} Purchased Items
                </span>
                <span v-else-if="form.clientId && !isFetchingClientItems && clientPurchasedItems.length === 0" class="text-warning small" style="font-size: 0.72rem;">
                  <i class="bi bi-exclamation-triangle me-1"></i> No Purchases Found
                </span>
              </div>
              <div class="position-relative">
                <input
                  v-model="itemSearchText"
                  type="text"
                  class="form-control idp-input"
                  :disabled="isEditing || !form.clientId"
                  :placeholder="!form.clientId ? 'Please select a client first...' : (clientPurchasedItems.length === 0 && !isFetchingClientItems ? 'No purchased items for this client' : 'Type to search purchased item...')"
                  @focus="handleItemFocus"
                  @input="handleItemInput"
                  @blur="handleItemBlur"
                />

                <!-- Item Autocomplete Dropdown -->
                <div
                  v-if="showItemDropdown && !isEditing && form.clientId && itemSearchText.trim().length > 0"
                  class="position-absolute start-0 top-100 w-100 mt-1 bg-dark border border-secondary rounded shadow-lg"
                  style="max-height: 220px; overflow-y: auto; z-index: 1050;"
                >
                  <div v-if="isFetchingClientItems" class="p-3 text-center text-muted small">
                    <span class="spinner-border spinner-border-sm text-primary me-2"></span>
                    Loading purchased items...
                  </div>
                  <div v-else-if="clientPurchasedItems.length === 0" class="p-3 text-center text-muted small">
                    <i class="bi bi-info-circle me-1"></i> এই ক্লায়েন্টের কোনো ক্রয়কৃত আইটেম নেই
                  </div>
                  <div v-else-if="modalFilteredItems.length === 0" class="p-3 text-center text-muted small">
                    No matching items found
                  </div>
                  <div
                    v-else
                    v-for="item in modalFilteredItems"
                    :key="item.id"
                    class="p-2 border-bottom border-secondary border-opacity-25 cursor-pointer hover-bg-secondary text-start"
                    @mousedown.prevent="selectModalItem(item)"
                  >
                    <div class="text-white small fw-semibold">{{ item.name }}</div>
                    <div class="text-info small font-monospace">[{{ item.hsCode }}]</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Row 2: Sales Unit & Sales Rate -->
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">Sales Unit <span class="text-danger">*</span></label>
              </div>
              <select v-model="form.unitId" class="form-select idp-input">
                <option v-for="u in unitsList" :key="u.id" :value="u.id">
                  {{ u.salesUnit }} (From {{ u.purchaseUnit }} x{{ u.factor }})
                </option>
              </select>
            </div>

            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">Sales Rate <span class="text-danger">*</span></label>
              </div>
              <input
                v-model="form.salesRate"
                type="number"
                step="0.01"
                min="0"
                class="form-control idp-input"
                placeholder="e.g. 1500.50"
              />
            </div>

            <!-- Row 3: VAT Rate (%) & Addition (%) -->
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">VAT Rate (%) <span class="text-danger">*</span></label>
              </div>
              <input
                v-model.number="form.vatRate"
                type="number"
                step="0.01"
                min="0"
                class="form-control idp-input"
                placeholder="15.00"
              />
            </div>

            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">Addition (%)</label>
              </div>
              <input
                v-model.number="form.additionPercent"
                type="number"
                step="0.01"
                min="0"
                class="form-control idp-input"
                placeholder="0.00"
              />
            </div>

            <!-- Row 4: Vatable Value (Auto) & Activation Date -->
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">Vatable Value (Auto)</label>
              </div>
              <input
                type="text"
                class="form-control idp-input bg-dark text-info font-monospace"
                :value="modalComputedVatableValue"
                readonly
                disabled
              />
            </div>

            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center mb-2" style="height: 20px;">
                <label class="form-label text-muted small mb-0">Activation Date <span class="text-danger">*</span></label>
              </div>
              <input
                v-model="form.activationDate"
                type="date"
                :max="todayDate"
                :disabled="isEditing"
                class="form-control idp-input"
              />
            </div>
          </div>
        </div>

        <div class="modal-footer border-secondary border-opacity-25">
          <button type="button" class="btn btn-dark border-secondary btn-sm" @click="emit('close')">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-idp-primary btn-sm d-flex align-items-center gap-2"
            :disabled="isSubmitting"
            @click="onSubmit"
          >
            <span v-if="isSubmitting" class="spinner-border spinner-border-sm"></span>
            <i v-else class="bi bi-check-lg"></i>
            {{ isEditing ? 'Update Rate' : 'Save Sales Rate' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hover-bg-secondary:hover {
  background-color: rgba(255, 255, 255, 0.08) !important;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
