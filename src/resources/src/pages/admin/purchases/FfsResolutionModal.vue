<script setup lang="ts">
const props = defineProps<{
  ffsPendingList: any[];
  isSaving: boolean;
}>();

const emit = defineEmits<{
  "savePendingFfs": [takeRebate: boolean];
  "cancel": [];
}>();
</script>

<template>
  <div class="modal-backdrop-idp">
    <div class="modal-dialog-idp modal-md">
      <div class="idp-card p-4">
        <div class="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 pb-3 mb-3">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-info-circle-fill text-info fs-5"></i>
            <h5 class="text-white fw-bold mb-0">FFS Resolution Required</h5>
          </div>
          <button
            type="button"
            class="btn-close btn-close-white"
            :disabled="isSaving"
            @click="emit('cancel')"
          ></button>
        </div>
        <div>
          <p class="text-white mb-3" style="line-height: 1.6;">
            The uploaded file contains <span class="badge bg-warning text-dark font-monospace">{{ ffsPendingList.length }}</span> records dated prior to <strong>July 1, 2025</strong>, which fall outside the standard FFS scope.
          </p>
          <p class="text-muted small mb-4">
            Would you like to claim Rebate for these pending records?
          </p>

          <div class="d-flex justify-content-between align-items-center pt-3 border-top border-secondary border-opacity-25">
            <button
              type="button"
              class="btn btn-outline-danger btn-sm px-3"
              :disabled="isSaving"
              @click="emit('cancel')"
            >
              <i class="bi bi-x-circle me-1"></i> Discard
            </button>
            <div class="d-flex gap-2">
              <button
                class="btn btn-outline-secondary px-3"
                :disabled="isSaving"
                @click="emit('savePendingFfs', false)"
              >
                No (Non-Rebate)
              </button>
              <button
                class="btn btn-idp-primary px-4"
                :disabled="isSaving"
                @click="emit('savePendingFfs', true)"
              >
                <span v-if="isSaving" class="spinner-border spinner-border-sm me-1"></span>
                <span>Yes (Claim Rebate)</span>
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

.modal-dialog-idp.modal-md { max-width: 500px; }
</style>
