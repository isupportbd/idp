<script setup lang="ts">
export interface MissingItem {
  hsCode: string;
  name: string;
  awHsCode: string;
  unit?: string;
}

const props = defineProps<{
  missingItems: MissingItem[];
  globalUnits: Array<{ id?: number; code: string; name: string }>;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  skip: [];
  save: [];
}>();

const formatHsCodeInput = (item: MissingItem) => {
  if (!item.hsCode) return;
  const digits = item.hsCode.replace(/[^0-9a-zA-Z]/g, "");
  if (!item.hsCode.includes(".")) {
    if (digits.length === 8) {
      item.hsCode = `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
    } else if (digits.length === 10) {
      item.hsCode = `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8, 10)}`;
    }
  }
};
</script>

<template>
  <div class="modal-backdrop-idp">
    <div class="modal-dialog-idp modal-lg">
      <div class="idp-card p-4">
        <div class="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 pb-3 mb-3">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-tag-fill text-warning fs-5"></i>
            <h5 class="text-white fw-bold mb-0">Missing Item Mappings</h5>
          </div>
          <button type="button" class="btn-close btn-close-white" :disabled="isSaving" @click="emit('cancel')"></button>
        </div>
        <div>
          <p class="text-muted small mb-3">
            The following items were found in the uploaded file but are not yet registered in the global catalog. The item name has been auto-extracted from the Excel description column. You can edit the standard HS Code or Item Name before saving.
          </p>

          <div class="mb-4" style="max-height: 380px; overflow-y: auto;">
            <div
              v-for="(item, idx) in missingItems"
              :key="idx"
              class="p-3 mb-2 rounded bg-dark border border-secondary border-opacity-30"
            >
              <div class="row g-3 align-items-center">
                <!-- 1. AW HS Code (From Excel) -->
                <div class="col-md-3">
                  <label class="form-label small text-muted mb-1">AW HS Code (Raw)</label>
                  <div class="form-control form-control-sm idp-input bg-black bg-opacity-40 font-monospace text-muted text-truncate" title="ASYCUDA World raw HS Code">
                    {{ item.awHsCode || (item.hsCode ? item.hsCode.replace(/[.\s]/g, '') : '—') }}
                  </div>
                </div>

                <!-- 2. Standard HS Code (Editable) -->
                <div class="col-md-3">
                  <label class="form-label small text-muted mb-1">Standard HS Code <span class="text-danger">*</span></label>
                  <input
                    v-model="item.hsCode"
                    type="text"
                    class="form-control form-control-sm idp-input font-monospace text-primary fw-semibold"
                    placeholder="e.g. 2701.19.00"
                    @blur="formatHsCodeInput(item)"
                  />
                </div>

                <!-- 3. Item Name (Auto Pre-filled from Excel Description, Editable) -->
                <div class="col-md-4">
                  <label class="form-label small text-muted mb-1">Item / Commodity Name <span class="text-danger">*</span></label>
                  <input
                    v-model="item.name"
                    type="text"
                    class="form-control form-control-sm idp-input fw-medium text-white"
                    placeholder="Item name from Excel description"
                  />
                </div>

                <!-- 4. Unit Dropdown (Global Units) -->
                <div class="col-md-2">
                  <label class="form-label small text-muted mb-1">Unit</label>
                  <select
                    v-model="item.unit"
                    class="form-select form-select-sm idp-input font-monospace"
                  >
                    <option v-for="u in globalUnits" :key="u.code" :value="u.code">
                      {{ u.code }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center pt-3 border-top border-secondary border-opacity-25">
            <button class="btn btn-outline-secondary btn-sm px-3" :disabled="isSaving" @click="emit('cancel')">
              Cancel Upload
            </button>
            <div class="d-flex gap-2">
              <button
                type="button"
                class="btn btn-outline-warning btn-sm px-3"
                :disabled="isSaving"
                @click="emit('skip')"
              >
                <i class="bi bi-slash-circle me-1"></i> Skip Unmapped Items
              </button>
              <button class="btn btn-idp-primary btn-sm px-4" :disabled="isSaving" @click="emit('save')">
                <span v-if="isSaving" class="spinner-border spinner-border-sm me-1"></span>
                <span>{{ isSaving ? "Saving..." : "Save Items & Continue" }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop-idp {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-dialog-idp {
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-dialog-idp.modal-lg { max-width: 800px; }
</style>
