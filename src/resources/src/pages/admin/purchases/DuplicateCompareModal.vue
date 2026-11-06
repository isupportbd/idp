<script setup lang="ts">
import { can } from "@/composables/useAuth";

const props = defineProps<{
  duplicateList: any[];
  isSaving: boolean;
}>();

const emit = defineEmits<{
  ignoreDuplicate: [index: number];
  replaceDuplicate: [item: any, index: number];
  replaceAll: [];
  ignoreAll: [];
  close: [];
}>();

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const formatNumber = (val: any) => {
  if (val === undefined || val === null || val === "") return "";
  const num = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return val;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
</script>

<template>
  <div class="modal-backdrop-idp">
    <div class="modal-dialog-idp modal-xl">
      <div class="idp-card p-4">
        <!-- Modal Header -->
        <div class="d-flex flex-wrap justify-content-between align-items-center border-bottom border-secondary border-opacity-25 pb-3 mb-3 gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="fs-5">📑</span>
            <h5 class="text-white fw-bold mb-0">Duplicate Purchase Records Detected</h5>
            <span class="text-muted fw-bold font-monospace">
              ({{ duplicateList.length }})
            </span>
          </div>

          <!-- Bulk Action Buttons -->
          <div class="d-flex align-items-center gap-2">
            <button
              type="button"
              class="btn btn-idp-secondary btn-sm px-3 fw-medium d-flex align-items-center"
              :disabled="isSaving"
              title="Skip all duplicate records and keep existing database data"
              @click="emit('ignoreAll')"
            >
              <i class="bi bi-skip-forward-fill text-muted me-2"></i>
              <span>Skip All</span>
            </button>
            <button
              v-if="can('purchases.edit')"
              type="button"
              class="btn btn-idp-primary btn-sm px-3 fw-semibold d-flex align-items-center"
              :disabled="isSaving"
              title="Replace all existing records with the newly uploaded Excel values"
              @click="emit('replaceAll')"
            >
              <span v-if="isSaving" class="spinner-border spinner-border-sm me-2"></span>
              <i v-else class="bi bi-lightning-charge-fill text-warning me-2"></i>
              <span>Replace All</span>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary ms-1"
              :disabled="isSaving"
              @click="emit('close')"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <!-- Info Guide Banner -->
        <div class="dup-info-banner d-flex align-items-center gap-2 py-2 px-3 mb-3">
          <i class="bi bi-info-circle-fill text-warning fs-6 flex-shrink-0 me-1"></i>
          <span class="text-muted small">
            <strong class="text-white">{{ duplicateList.length }} records</strong> already exist. Review changes below. Fields with differences are highlighted.
          </span>
        </div>

        <!-- Scrollable Duplicate Cards List -->
        <div class="mb-2 pe-1" style="max-height: 520px; overflow-y: auto;">
          <div
            v-for="(item, index) in duplicateList"
            :key="index"
            class="dup-record-card mb-3"
          >
            <!-- Card Top Meta Bar -->
            <div class="dup-card-top-bar d-flex flex-wrap justify-content-between align-items-center px-3 py-2.5 gap-2">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <span class="dup-idx-badge font-monospace">
                  #{{ index + 1 }}
                </span>
                <span class="text-white fw-bold small d-flex align-items-center">
                  <i class="bi bi-building text-secondary me-2"></i>
                  {{ item.existing?.clientName || item.newData?.clientName || 'Client ID: ' + (item.existing?.clientId || item.newData?.clientId) }}
                </span>
                <span v-if="item.existing?.clientBin || item.newData?.bin" class="text-muted small font-monospace">
                  • BIN: {{ item.existing?.clientBin || item.newData?.bin }}
                </span>
                <span class="text-muted small font-monospace">
                  • BE: {{ item.newData?.beNo || item.existing?.beNo }} ({{ formatDate(item.newData?.beDate || item.existing?.beDate) }})
                </span>
              </div>

              <!-- Individual Card Actions -->
              <div class="d-flex align-items-center gap-2">
                <button
                  class="btn btn-sm btn-outline-secondary px-3 py-1 fw-medium"
                  :disabled="isSaving"
                  @click="emit('ignoreDuplicate', index)"
                >
                  Skip
                </button>
                <button
                  v-if="can('purchases.edit')"
                  class="btn btn-sm btn-idp-primary px-3 py-1 fw-semibold"
                  :disabled="isSaving"
                  @click="emit('replaceDuplicate', item, index)"
                >
                  <span v-if="isSaving" class="spinner-border spinner-border-sm me-1"></span>
                  <span>Replace</span>
                </button>
              </div>
            </div>

            <!-- Unified 3-Column Comparative Table -->
            <div class="table-responsive">
              <table class="table diff-comp-table mb-0 align-middle">
                <thead>
                  <tr>
                    <th class="th-attr">ATTRIBUTE</th>
                    <th class="th-col">EXISTING (DATABASE)</th>
                    <th class="th-col">INCOMING (UPLOADED EXCEL)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="td-attr">Customs Office</td>
                    <td class="td-existing font-monospace">{{ item.existing?.office || '—' }}</td>
                    <td
                      class="td-incoming font-monospace"
                      :class="{ 'td-diff-highlight': (item.existing?.office || '').trim() !== (item.newData?.office || '').trim() }"
                    >
                      {{ item.newData?.office || '—' }}
                    </td>
                  </tr>
                  <tr>
                    <td class="td-attr">Total Qty</td>
                    <td class="td-existing font-monospace">{{ formatNumber(item.existing?.totalQty) }} MT</td>
                    <td
                      class="td-incoming font-monospace"
                      :class="{ 'td-diff-highlight': formatNumber(item.existing?.totalQty) !== formatNumber(item.newData?.totalQty) }"
                    >
                      {{ formatNumber(item.newData?.totalQty) }} MT
                    </td>
                  </tr>
                  <tr>
                    <td class="td-attr">Base Value</td>
                    <td class="td-existing font-monospace">{{ formatNumber(item.existing?.baseValueOfVat) }} ৳</td>
                    <td
                      class="td-incoming font-monospace"
                      :class="{ 'td-diff-highlight': formatNumber(item.existing?.baseValueOfVat) !== formatNumber(item.newData?.baseValueOfVat) }"
                    >
                      {{ formatNumber(item.newData?.baseValueOfVat) }} ৳
                    </td>
                  </tr>
                  <tr>
                    <td class="td-attr">VAT Amount</td>
                    <td class="td-existing font-monospace">{{ formatNumber(item.existing?.vat) }} ৳</td>
                    <td
                      class="td-incoming font-monospace"
                      :class="{ 'td-diff-highlight': formatNumber(item.existing?.vat) !== formatNumber(item.newData?.vat) }"
                    >
                      {{ formatNumber(item.newData?.vat) }} ৳
                    </td>
                  </tr>
                  <tr>
                    <td class="td-attr">AT Amount</td>
                    <td class="td-existing font-monospace">{{ formatNumber(item.existing?.at) }} ৳</td>
                    <td
                      class="td-incoming font-monospace"
                      :class="{ 'td-diff-highlight': formatNumber(item.existing?.at) !== formatNumber(item.newData?.at) }"
                    >
                      {{ formatNumber(item.newData?.at) }} ৳
                    </td>
                  </tr>
                </tbody>
              </table>
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

.modal-dialog-idp.modal-xl { max-width: 1100px; }

.dup-info-banner {
  background: #1a1d21;
  border: 1px solid #3b424b;
  border-radius: 6px;
}

.dup-record-card {
  background: #212529;
  border: 1px solid #3b424b;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.dup-record-card:hover {
  border-color: #4f5762;
}

.dup-card-top-bar {
  background: #1a1d21;
  border-bottom: 1px solid #3b424b;
}

.dup-idx-badge {
  background: #2c3238;
  color: #adb5bd;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.75rem;
  border: 1px solid #3b424b;
}

.diff-comp-table {
  --bs-table-bg: transparent !important;
  --bs-table-color: #f8f9fa !important;
  color: #f8f9fa !important;
  font-size: 0.84rem;
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 0;
}

.diff-comp-table thead th {
  background: #1a1d21 !important;
  color: #adb5bd !important;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  border-bottom: 1px solid #3b424b !important;
  border-top: none !important;
  padding: 8px 14px;
}

.diff-comp-table thead th.th-attr {
  width: 26%;
  border-right: 1px solid #3b424b !important;
}

.diff-comp-table thead th.th-col {
  width: 37%;
  border-right: 1px solid #3b424b !important;
}

.diff-comp-table thead th.th-col:last-child {
  border-right: none !important;
}

.diff-comp-table tbody tr {
  border-bottom: 1px solid #2b3035;
}

.diff-comp-table tbody tr:last-child {
  border-bottom: none;
}

.diff-comp-table tbody td {
  padding: 8px 14px;
  vertical-align: middle;
}

.td-attr {
  color: #adb5bd !important;
  font-weight: 500;
  background: #1d2125 !important;
  border-right: 1px solid #3b424b !important;
}

.td-existing {
  color: #f8f9fa !important;
  border-right: 1px solid #3b424b !important;
}

.td-incoming {
  color: #f8f9fa !important;
  border-right: none !important;
}

.td-diff-highlight {
  color: #ffc107 !important;
  font-weight: 700 !important;
  background: rgba(255, 193, 7, 0.12) !important;
}
</style>
