<script setup lang="ts">
import type { SalesRate } from "./types";

const props = defineProps<{
  historyClientItem: {
    clientName: string;
    itemName: string;
    records: SalesRate[];
  };
}>();

const emit = defineEmits<{
  close: [];
}>();

const formatNumber = (val: any) => {
  if (val === undefined || val === null || val === "") return "";
  const num = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return val;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
</script>

<template>
  <div class="modal fade show d-block" tabindex="-1" style="background: rgba(0, 0, 0, 0.75);">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content idp-card">
        <div class="modal-header border-secondary border-opacity-25">
          <div>
            <h5 class="modal-title text-white">
              Rate History & Audit Trail
            </h5>
            <div class="text-muted small">
              {{ historyClientItem.clientName }} • {{ historyClientItem.itemName }}
            </div>
          </div>
          <button type="button" class="btn-close btn-close-white" @click="emit('close')"></button>
        </div>

        <div class="modal-body p-4">
          <div class="table-responsive">
            <table class="table idp-table table-sm">
              <thead>
                <tr>
                  <th>Activation Date</th>
                  <th>Unit</th>
                  <th class="text-end">Sales Rate</th>
                  <th class="text-end">VAT (%)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rec in historyClientItem.records" :key="rec.id">
                  <td class="text-light small">
                    {{ rec.activationDate }}
                  </td>
                  <td>
                    <span class="badge bg-dark border border-secondary text-light">{{ rec.unitName }}</span>
                  </td>
                  <td class="text-end font-monospace text-white fw-bold">
                    {{ formatNumber(rec.salesRate) }}
                  </td>
                  <td class="text-end font-monospace text-success">
                    {{ formatNumber(rec.vatRate) }}%
                  </td>
                  <td>
                    <span
                      class="badge"
                      :class="rec.status === 'Active' ? 'bg-success bg-opacity-25 text-success border border-success' : 'bg-secondary bg-opacity-25 text-muted border border-secondary'"
                    >
                      {{ rec.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer border-secondary border-opacity-25">
          <button type="button" class="btn btn-dark border-secondary btn-sm" @click="emit('close')">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
