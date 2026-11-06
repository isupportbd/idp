<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import StatusBadge from "@/components/common/StatusBadge.vue";
import type { Bill } from "@/composables/useBillingApi";

defineProps<{
  bills: Bill[];
  loading: boolean;
  selectedMonth: string;
  canEdit: boolean;
  canDelete: boolean;
  canCollect: boolean;
}>();

const emit = defineEmits<{
  (e: "viewInvoice", billId: number): void;
  (e: "editInvoice", billId: number): void;
  (e: "createCollection", clientId: number, billId: number): void;
  (e: "deleteInvoice", bill: Bill): void;
}>();

// ── Invoice row actions ("..." dropdown) ──────────────────────────────
const openActionsBillId = ref<number | null>(null);
const actionsMenuStyle = ref<Record<string, string>>({});

const closeInvoiceActions = () => {
  openActionsBillId.value = null;
};

const toggleInvoiceActions = (event: MouseEvent, billId: number) => {
  if (openActionsBillId.value === billId) {
    closeInvoiceActions();
    return;
  }

  const trigger = event.currentTarget as HTMLElement | null;
  const rect = trigger?.getBoundingClientRect();
  const menuWidth = 190;
  const left = rect ? Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)) : 8;
  const top = rect ? rect.bottom + 4 : 8;

  actionsMenuStyle.value = { top: `${top}px`, left: `${left}px` };
  openActionsBillId.value = billId;
};

onMounted(() => {
  document.addEventListener("click", closeInvoiceActions);
  window.addEventListener("scroll", closeInvoiceActions, true);
  window.addEventListener("resize", closeInvoiceActions);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeInvoiceActions);
  window.removeEventListener("scroll", closeInvoiceActions, true);
  window.removeEventListener("resize", closeInvoiceActions);
});
</script>

<template>
  <div class="table-card shadow-sm">
    <table class="table-custom">
      <thead>
        <tr>
          <th style="width: 14%;">Invoice No</th>
          <th style="width: 28%;">Client Organization & BIN</th>
          <th style="width: 12%;">Tax Period</th>
          <th style="width: 12%; text-align: right;">Total (Tk)</th>
          <th style="width: 12%; text-align: right;">Paid (Tk)</th>
          <th style="width: 12%; text-align: right;">Due (Tk)</th>
          <th style="width: 10%;">Status</th>
          <th style="width: 10%; text-align: right;" class="d-print-none">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && bills.length === 0">
          <td colspan="8" class="text-center py-4 text-muted">
            <div class="spinner-border spinner-border-sm text-primary me-2"></div>
            Loading invoices...
          </td>
        </tr>

        <tr v-else-if="bills.length === 0">
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
            No invoices found for {{ selectedMonth }}.
          </td>
        </tr>

        <tr v-for="bill in bills" :key="bill.id">
          <!-- Invoice No -->
          <td>
            <a
              :href="`/admin/billing/invoices/${bill.id}`"
              target="_blank"
              class="font-monospace fw-bold text-info text-decoration-none hover-underline cursor-pointer d-inline-block"
              style="font-size: 0.88rem;"
              title="Click to View Invoice (Opens in New Tab)"
              @click.prevent="emit('viewInvoice', bill.id)"
            >
              {{ bill.billNo }}
            </a>
            <div class="text-muted small" style="font-size: 0.76rem;">{{ new Date(bill.billDate).toLocaleDateString() }}</div>
          </td>

          <!-- Client Name & BIN -->
          <td>
            <div class="fw-bold text-white text-truncate" style="max-width: 320px; font-size: 0.92rem;">
              {{ bill.clientName }}
            </div>
            <div class="d-flex align-items-center gap-2 mt-1">
              <span v-if="bill.clientBin" class="badge bg-dark border border-secondary text-info font-monospace" style="font-size: 0.78rem;">
                BIN: {{ bill.clientBin }}
              </span>
              <span v-if="bill.referenceName" class="text-muted small" style="font-size: 0.78rem;">
                Ref: {{ bill.referenceName }}
              </span>
            </div>
          </td>

          <!-- Tax Period -->
          <td>
            <span class="font-monospace text-light fw-medium">{{ bill.taxPeriod }}</span>
          </td>

          <!-- Grand Total -->
          <td style="text-align: right;">
            <span class="font-monospace fw-bold text-white fs-6">{{ bill.grandTotal.toFixed(2) }}</span>
          </td>

          <!-- Paid Amount -->
          <td style="text-align: right;">
            <span class="font-monospace text-success fw-semibold">{{ bill.paidAmount.toFixed(2) }}</span>
          </td>

          <!-- Due Amount -->
          <td style="text-align: right;">
            <span class="font-monospace fw-bold" :class="bill.dueAmount > 0 ? 'text-danger' : 'text-muted'">
              {{ bill.dueAmount.toFixed(2) }}
            </span>
          </td>

          <!-- Status -->
          <td>
            <StatusBadge :status="bill.status" />
          </td>

          <!-- Actions -->
          <td style="text-align: right;" class="d-print-none">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary p-1"
              title="Invoice Actions"
              aria-haspopup="true"
              :aria-expanded="openActionsBillId === bill.id"
              @click.stop="toggleInvoiceActions($event, bill.id)"
            >
              <i class="bi bi-three-dots"></i>
            </button>

            <Teleport to="body">
              <div
                v-if="openActionsBillId === bill.id"
                class="dropdown-menu show invoice-actions-menu"
                :style="actionsMenuStyle"
                @click.stop
              >
                <!-- View Invoice -->
                <button
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2"
                  @click="closeInvoiceActions(); emit('viewInvoice', bill.id)"
                >
                  <i class="bi bi-eye"></i>
                  <span>View Invoice</span>
                </button>

                <!-- Edit Invoice -->
                <button
                  v-if="canEdit"
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2"
                  @click="closeInvoiceActions(); emit('editInvoice', bill.id)"
                >
                  <i class="bi bi-pencil"></i>
                  <span>Edit Invoice</span>
                </button>

                <!-- Receive Payment -->
                <button
                  v-if="bill.dueAmount > 0 && canCollect"
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2"
                  @click="closeInvoiceActions(); emit('createCollection', bill.clientId, bill.id)"
                >
                  <i class="bi bi-cash-coin"></i>
                  <span>Receive Payment</span>
                </button>

                <!-- Delete Invoice -->
                <button
                  v-if="canDelete"
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-2 text-danger"
                  @click="closeInvoiceActions(); emit('deleteInvoice', bill)"
                >
                  <i class="bi bi-trash"></i>
                  <span>Delete Invoice</span>
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

.cursor-pointer {
  cursor: pointer;
}

.invoice-actions-menu {
  position: fixed;
  min-width: 190px;
  z-index: 1080;
}

.invoice-actions-menu .text-danger {
  color: #ff6b6b !important;
}

.invoice-actions-menu .text-danger:hover,
.invoice-actions-menu .text-danger:focus {
  color: #ff8787 !important;
  background-color: rgba(220, 53, 69, 0.14) !important;
}
</style>
