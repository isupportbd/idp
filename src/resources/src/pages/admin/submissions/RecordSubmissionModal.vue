<script setup lang="ts">
import ClientSearchSelect from "@/components/common/ClientSearchSelect.vue";

const props = defineProps<{
  show: boolean;
  isSaving: boolean;
  selectedClientItem: any;
  submissions: any[];
  form: {
    clientId: number | null;
    taxPeriod: string;
    submissionId: string;
    remarks: string;
  };
}>();

const emit = defineEmits<{
  close: [];
  save: [];
  changeClient: [];
  "update:submissionId": [val: string];
}>();

const handleInput = (event: Event) => {
  const val = (event.target as HTMLInputElement).value;
  emit("update:submissionId", val);
};
</script>

<template>
  <div
    v-if="show"
    class="modal fade show d-block"
    tabindex="-1"
    style="background: rgba(0, 0, 0, 0.75); z-index: 1060;"
  >
    <div class="modal-dialog modal-dialog-centered" style="max-width: 440px;">
      <div class="modal-content idp-modal-content text-white border border-secondary shadow-lg rounded-3">
        <div class="modal-header border-bottom border-secondary py-3 px-4">
          <h6 class="modal-title fw-bold d-flex align-items-center gap-2 mb-0">
            <i class="bi bi-file-earmark-check text-primary fs-5"></i>
            <span>Record Return Submission ID</span>
          </h6>
          <button
            type="button"
            class="btn-close btn-close-white"
            @click="emit('close')"
          ></button>
        </div>

        <form @submit.prevent="emit('save')">
          <div class="modal-body p-4">
            <!-- Client & Period Info Card (When client is selected) -->
            <div v-if="selectedClientItem" class="p-3 mb-3 rounded-2 bg-dark border border-secondary border-opacity-50">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="text-muted small fw-semibold">Client Organization</span>
                <button
                  type="button"
                  class="btn btn-link btn-sm text-primary p-0 text-decoration-none small"
                  @click="emit('changeClient')"
                >
                  Change Client
                </button>
              </div>
              <div class="fw-bold text-white fs-6">
                {{ selectedClientItem.companyName }}
              </div>
              <div class="d-flex align-items-center gap-3 mt-1 small">
                <span v-if="selectedClientItem.binNumber" class="text-info font-monospace">
                  BIN: {{ selectedClientItem.binNumber }}
                </span>
                <span class="text-muted">
                  Tax Period: <strong class="text-light">{{ form.taxPeriod }}</strong>
                </span>
              </div>
            </div>

            <!-- Client Selector if not selected -->
            <div v-else class="mb-3">
              <label class="form-label small text-secondary fw-semibold">
                Select Active Client Organization <span class="text-danger">*</span>
              </label>
              <ClientSearchSelect
                v-model="form.clientId"
                :clients="submissions"
                placeholder="Type to search company name, BIN, or mobile..."
              />
            </div>

            <!-- Tax Period Input Field -->
            <div class="mb-3">
              <label class="form-label small text-secondary fw-semibold">
                Tax Period <span class="text-danger">*</span>
              </label>
              <input
                v-model="form.taxPeriod"
                type="month"
                class="form-control idp-modal-input font-monospace"
                required
                style="height: 40px;"
              />
            </div>

            <!-- Submission ID Input -->
            <div class="mb-3">
              <label class="form-label small text-secondary fw-semibold">
                Submission ID <span class="text-danger">*</span>
              </label>
              <input
                :value="form.submissionId"
                type="text"
                class="form-control form-control-lg idp-modal-input font-monospace"
                placeholder="e.g. 202608001"
                required
                autofocus
                style="font-size: 1rem; height: 42px;"
                @input="handleInput"
              />
            </div>

            <!-- Remarks (Optional) -->
            <div class="mb-1">
              <label class="form-label small text-secondary fw-semibold">
                Remarks / Notes <span class="text-muted fw-normal">(Optional)</span>
              </label>
              <input
                v-model="form.remarks"
                type="text"
                class="form-control form-control-sm idp-modal-input"
                placeholder="Optional submission note..."
              />
            </div>
          </div>

          <div class="modal-footer border-top border-secondary py-2 px-4 d-flex justify-content-between">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary px-3"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn btn-sm btn-primary px-4 fw-semibold d-flex align-items-center gap-1 shadow-sm"
              :disabled="isSaving"
            >
              <span v-if="isSaving" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="bi bi-check2"></i>
              <span>Save Submission</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.idp-modal-content {
  background: #1e2227;
}

.idp-modal-input {
  background: #15181b;
  border: 1px solid #343a40;
  color: #fff;
}

.idp-modal-input:focus {
  background: #191c20;
  border-color: #0d6efd;
  color: #fff;
  box-shadow: none;
}
</style>
