<script setup lang="ts">
export interface MissingClient {
  bin: string;
  name: string;
  clientTypeId?: number;
}

const props = defineProps<{
  missingClients: MissingClient[];
  clientTypeOptions: Array<{ id: number; name: string }>;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  skip: [];
  save: [];
}>();

const formatBin = (raw?: string): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 13) {
    return `${digits.slice(0, 9)}-${digits.slice(9, 13)}`;
  }
  return String(raw).trim();
};
</script>

<template>
  <div class="modal-backdrop-idp">
    <div class="modal-dialog-idp modal-lg">
      <div class="idp-card p-4">
        <div class="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 pb-3 mb-3">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-building-exclamation text-warning fs-5"></i>
            <h5 class="text-white fw-bold mb-0">Missing Clients Found</h5>
          </div>
          <button type="button" class="btn-close btn-close-white" :disabled="isSaving" @click="emit('cancel')"></button>
        </div>
        <div>
          <p class="text-muted small mb-3">
            The following Business Identification Numbers (BIN) in the uploaded file are not registered under your client list. Please enter the Client Names to add them and proceed, or click <strong>Skip Unregistered</strong> to exclude these rows.
          </p>

          <div class="mb-4" style="max-height: 380px; overflow-y: auto;">
            <div
              v-for="(client, idx) in missingClients"
              :key="idx"
              class="p-3 mb-2 rounded bg-dark border border-secondary border-opacity-30"
            >
              <div class="row g-3 align-items-center">
                <div class="col-md-4">
                  <label class="form-label small text-muted">BIN</label>
                  <div class="form-control form-control-sm idp-input bg-dark text-white font-monospace">
                    {{ formatBin(client.bin) }}
                  </div>
                </div>
                <div class="col-md-5">
                  <label class="form-label small text-muted">Client Name *</label>
                  <input
                    v-model="client.name"
                    type="text"
                    class="form-control form-control-sm idp-input"
                    placeholder="e.g. Acme Corporation Ltd"
                  />
                </div>
                <div class="col-md-3">
                  <label class="form-label small text-muted">Client Type</label>
                  <select
                    v-model="client.clientTypeId"
                    class="form-select form-select-sm idp-input"
                  >
                    <option v-for="t in clientTypeOptions" :key="t.id" :value="t.id">
                      {{ t.name }}
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
                <i class="bi bi-slash-circle me-1"></i> Skip Unregistered
              </button>
              <button class="btn btn-idp-primary btn-sm px-4" :disabled="isSaving" @click="emit('save')">
                <span v-if="isSaving" class="spinner-border spinner-border-sm me-1"></span>
                <span>{{ isSaving ? "Saving..." : "Save Clients & Continue" }}</span>
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
