<script setup lang="ts">
import { ref, watch } from "vue";
import type { Tenant } from "@/composables/useSuperAdminApi";

const props = defineProps<{
  show: boolean;
  tenant: Tenant | null;
  isSubmitting: boolean;
}>();

const emit = defineEmits<{
  "close": [];
  "confirm": [days: number];
}>();

const extendDaysCount = ref(30);

watch(() => props.show, (newVal) => {
  if (newVal) extendDaysCount.value = 30;
});
</script>

<template>
  <div
    v-if="show && tenant"
    class="modal fade show d-block"
    tabindex="-1"
    style="background: rgba(0, 0, 0, 0.75);"
  >
    <div class="modal-dialog modal-dialog-centered" style="max-width: 460px;">
      <div class="modal-content table-card border-secondary">
        <div class="modal-header border-secondary" style="background: #181b1f;">
          <h5 class="modal-title text-white fw-bold">
            <i class="bi bi-calendar-plus text-primary me-2"></i> Extend Subscription
          </h5>
          <button type="button" class="btn-close btn-close-white" @click="emit('close')"></button>
        </div>
        <div class="modal-body p-4">
          <div class="mb-3">
            <label class="form-label text-muted small">Organization Tenant</label>
            <div class="fw-bold text-white fs-6">{{ tenant.name }}</div>
            <div class="text-muted small">{{ tenant.email }}</div>
          </div>

          <div class="mb-3">
            <label class="form-label text-muted small">Current Expiration Date</label>
            <div class="text-light font-monospace">{{ tenant.expDate ? tenant.expDate.slice(0, 10) : 'Not Set (Default 30d)' }}</div>
          </div>

          <div class="mb-4">
            <label class="form-label text-light">Add Duration (Days)</label>
            <div class="d-flex gap-2 mb-2">
              <button
                type="button"
                class="btn btn-sm"
                :class="extendDaysCount === 30 ? 'btn-primary' : 'btn-outline-secondary'"
                @click="extendDaysCount = 30"
              >
                +30 Days (1 Mo)
              </button>
              <button
                type="button"
                class="btn btn-sm"
                :class="extendDaysCount === 90 ? 'btn-primary' : 'btn-outline-secondary'"
                @click="extendDaysCount = 90"
              >
                +90 Days (3 Mo)
              </button>
              <button
                type="button"
                class="btn btn-sm"
                :class="extendDaysCount === 365 ? 'btn-primary' : 'btn-outline-secondary'"
                @click="extendDaysCount = 365"
              >
                +365 Days (1 Yr)
              </button>
            </div>
            <input
              v-model.number="extendDaysCount"
              type="number"
              class="form-control idp-search-input font-monospace"
              min="1"
              placeholder="Enter custom days..."
            />
          </div>

          <div class="d-flex gap-2">
            <button
              type="button"
              class="btn btn-secondary flex-grow-1"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary flex-grow-1"
              :disabled="isSubmitting || extendDaysCount < 1"
              @click="emit('confirm', extendDaysCount)"
            >
              {{ isSubmitting ? 'Extending...' : 'Confirm Extension' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-card {
  background: #1f2329;
  border-radius: 8px;
}

.idp-search-input {
  background-color: #181b1f !important;
  border: 1px solid #3b424b !important;
  color: #f8f9fa !important;
  border-radius: 6px;
  font-size: 0.85rem;
}
</style>
