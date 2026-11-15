<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Collection } from "@/composables/useBillingApi";

defineProps<{
  collections: Collection[];
  loading: boolean;
  selectedMonth: string;
  canEdit?: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  (e: "editReceipt", id: number): void;
  (e: "cancelReceipt", col: Collection): void;
}>();

// ── Collection row actions ("..." dropdown) ───────────────────────────
const openActionsColId = ref<number | null>(null);
const actionsMenuStyle = ref<Record<string, string>>({});

const closeCollectionActions = () => {
  openActionsColId.value = null;
};

const toggleCollectionActions = (event: MouseEvent, colId: number) => {
  if (openActionsColId.value === colId) {
    closeCollectionActions();
    return;
  }

  const trigger = event.currentTarget as HTMLElement | null;
  const rect = trigger?.getBoundingClientRect();
  const menuWidth = 190;
  const left = rect ? Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)) : 8;
  const top = rect ? rect.bottom + 4 : 8;

  actionsMenuStyle.value = { top: `${top}px`, left: `${left}px` };
  openActionsColId.value = colId;
};

onMounted(() => {
  document.addEventListener("click", closeCollectionActions);
  window.addEventListener("scroll", closeCollectionActions, true);
  window.addEventListener("resize", closeCollectionActions);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeCollectionActions);
  window.removeEventListener("scroll", closeCollectionActions, true);
  window.removeEventListener("resize", closeCollectionActions);
});
</script>

<template>
  <div class="table-card shadow-sm">
    <table class="table-custom">
      <thead>
        <tr>
          <th style="width: 15%;">Receipt No</th>
          <th style="width: 30%;">Client Organization & BIN</th>
          <th style="width: 15%;">Date</th>
          <th style="width: 15%;">Payment Mode</th>
          <th style="width: 15%; text-align: right;">Amount (Tk)</th>
          <th style="width: 10%; text-align: right;" class="d-print-none">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && collections.length === 0">
          <td colspan="6" class="text-center py-4 text-muted">
            <div class="spinner-border spinner-border-sm text-primary me-2"></div>
            Loading payment receipts...
          </td>
        </tr>

        <tr v-else-if="collections.length === 0">
          <td colspan="6" class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
            No payment receipts recorded for {{ selectedMonth }}.
          </td>
        </tr>

        <tr v-for="col in collections" :key="col.id">
          <!-- Receipt No -->
          <td>
            <router-link
              :to="`/admin/billing/receipts/${col.id}`"
              class="font-monospace fw-bold text-success text-decoration-none hover-underline"
              style="font-size: 0.88rem;"
              title="View Money Receipt"
            >
              {{ col.receiptNo }}
            </router-link>
            <div v-if="col.billNo" class="text-muted small" style="font-size: 0.76rem;">Inv: {{ col.billNo }}</div>
          </td>

          <!-- Client Name & BIN -->
          <td>
            <router-link
              :to="`/admin/billing/receipts/${col.id}`"
              class="fw-bold text-white text-truncate text-decoration-none d-block"
              style="max-width: 320px; font-size: 0.92rem;"
            >
              {{ col.clientName }}
            </router-link>
            <div v-if="col.clientBin" class="badge bg-dark border border-secondary text-info font-monospace mt-1" style="font-size: 0.78rem;">
              BIN: {{ col.clientBin }}
            </div>
          </td>

          <!-- Date -->
          <td>
            <span class="text-light font-monospace">{{ new Date(col.collectionDate).toLocaleDateString() }}</span>
          </td>

          <!-- Payment Mode -->
          <td>
            <span class="badge bg-secondary text-uppercase">{{ col.paymentMethod }}</span>
            <div v-if="col.referenceNo" class="text-muted small font-monospace mt-1">{{ col.referenceNo }}</div>
          </td>

          <!-- Amount -->
          <td style="text-align: right;">
            <span class="font-monospace fw-bold text-success fs-6">{{ col.amount.toFixed(2) }}</span>
          </td>

          <!-- Actions -->
          <td style="text-align: right;" class="d-print-none">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary p-1"
              title="Collection Actions"
              aria-haspopup="true"
              :aria-expanded="openActionsColId === col.id"
              @click.stop="toggleCollectionActions($event, col.id)"
            >
              <i class="bi bi-three-dots"></i>
            </button>

            <Teleport to="body">
              <div
                v-if="openActionsColId === col.id"
                class="dropdown-menu show collection-actions-menu"
                :style="actionsMenuStyle"
                @click.stop
              >
                <!-- View Money Receipt -->
                <router-link
                  :to="`/admin/billing/receipts/${col.id}`"
                  class="dropdown-item d-flex align-items-center gap-2"
                  @click="closeCollectionActions"
                >
                  <i class="bi bi-eye"></i>
                  <span>View Receipt</span>
                </router-link>

                <!-- Edit Money Receipt -->
                <button
                  v-if="canEdit && col.status !== 'cancelled'"
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2"
                  @click="closeCollectionActions(); emit('editReceipt', col.id)"
                >
                  <i class="bi bi-pencil"></i>
                  <span>Edit Receipt</span>
                </button>

                <!-- Cancel Receipt -->
                <button
                  v-if="canDelete && col.status !== 'cancelled'"
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2 text-danger"
                  @click="closeCollectionActions(); emit('cancelReceipt', col)"
                >
                  <i class="bi bi-x-circle"></i>
                  <span>Cancel Receipt</span>
                </button>
              </div>
            </Teleport>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-card {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  overflow: hidden;
}

.table-custom {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.table-custom th {
  background: #15181b;
  color: #adb5bd;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #343a40;
}

.table-custom td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #282d34;
  vertical-align: middle;
}

.table-custom tr:hover td {
  background: #252b32;
}

.hover-underline:hover {
  text-decoration: underline !important;
}

.collection-actions-menu {
  position: fixed !important;
  z-index: 9999;
  background-color: #1e2227;
  border: 1px solid #3b424b;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  min-width: 170px;
}

.collection-actions-menu .dropdown-item {
  color: #adb5bd;
  font-size: 0.85rem;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  text-decoration: none;
}

.collection-actions-menu .dropdown-item:hover {
  background-color: #282e36;
  color: #ffffff;
}
</style>
