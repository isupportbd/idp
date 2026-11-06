<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  tempData: any[];
  selectedMonth: string;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [];
}>();

const currentPage = ref(1);
const pageSize = ref(10);

const totalPages = computed(() => Math.max(1, Math.ceil(props.tempData.length / pageSize.value)));

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return props.tempData.slice(start, start + pageSize.value);
});

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

const formatMonthStr = (monthStr: string) => {
  if (!monthStr) return "";
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", "-");
};
</script>

<template>
  <div class="preview-panel-container mb-4">
    <!-- Empty Placeholder State -->
    <div v-if="tempData.length === 0" class="idp-card p-5 text-center">
      <i class="bi bi-file-earmark-spreadsheet fs-1 text-muted d-block mb-3 opacity-50"></i>
      <h6 class="text-white fw-semibold mb-1">Spreadsheet Preview Panel</h6>
      <p class="text-muted small mb-0">
        Select an Excel or CSV file in the card above and click <strong>"Add to Temp"</strong> to inspect and preview rows here.
      </p>
    </div>

    <!-- Full 16-Column Temp Data Preview Table -->
    <div v-else class="idp-card p-4">
      <!-- Table Header Bar -->
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div class="d-flex align-items-center gap-3">
          <h5 class="text-white fw-bold mb-0">Temp Data Preview</h5>
          <span class="badge-count rounded-pill px-3 py-1 font-monospace">
            {{ tempData.length }} Records Found
          </span>
        </div>

        <div class="d-flex align-items-center gap-2">
          <label class="text-muted small mb-0">Rows per page:</label>
          <select
            v-model="pageSize"
            class="form-select form-select-sm idp-input"
            style="width: 80px;"
            @change="currentPage = 1"
          >
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>
      </div>

      <!-- 16-Column Paginated Data Table -->
      <div class="idp-table-wrapper mb-3" style="max-height: 520px; overflow: auto;">
        <table class="table idp-table mb-0 align-middle text-nowrap" style="font-size: 0.85rem;">
          <thead>
            <tr>
              <th class="text-center" style="width: 45px;">#</th>
              <th class="text-center">Office</th>
              <th class="text-center">Month</th>
              <th class="text-start">BE No</th>
              <th class="text-center">Date</th>
              <th class="text-center">HS Code</th>
              <th class="text-start">Item Name</th>
              <th class="text-end">Net Wt</th>
              <th class="text-end">Excess Qty</th>
              <th class="text-end">Value</th>
              <th class="text-end">CD</th>
              <th class="text-end">RD</th>
              <th class="text-end">SD</th>
              <th class="text-end">VAT</th>
              <th class="text-end">AT</th>
              <th class="text-start">LC Number</th>
              <th class="text-center">BIN</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in paginatedData" :key="row.tempId || idx">
              <td class="text-center text-muted">{{ (currentPage - 1) * pageSize + idx + 1 }}</td>
              <td class="text-center">{{ row.office }}</td>
              <td class="text-center">{{ formatMonthStr(selectedMonth) }}</td>
              <td class="text-start font-monospace text-white">{{ row.beNo }}</td>
              <td class="text-center">{{ formatDate(row.beDate) }}</td>
              <td class="text-center font-monospace text-primary">{{ row.hsCode }}</td>
              <td class="text-start fw-medium text-white">{{ row.itemName }}</td>
              <td class="text-end font-monospace">{{ formatNumber(row.netWt) }}</td>
              <td class="text-end font-monospace">{{ formatNumber(row.excessQty) }}</td>
              <td class="text-end font-monospace text-info">{{ formatNumber(row.assValue) }}</td>
              <td class="text-end font-monospace">{{ formatNumber(row.cd) }}</td>
              <td class="text-end font-monospace">{{ formatNumber(row.rd) }}</td>
              <td class="text-end font-monospace">{{ formatNumber(row.sd) }}</td>
              <td class="text-end font-monospace text-success">{{ formatNumber(row.vat) }}</td>
              <td class="text-end font-monospace text-warning">{{ formatNumber(row.at) }}</td>
              <td class="text-start font-monospace text-muted">{{ row.lcNumber }}</td>
              <td class="text-center font-monospace text-white">{{ row.bin }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination & Footer Actions -->
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 pt-3 border-top border-secondary border-opacity-25">
        <!-- Pagination -->
        <div v-if="totalPages > 1" class="d-flex align-items-center gap-1">
          <button
            type="button"
            class="btn btn-dark border-secondary btn-sm"
            :disabled="currentPage <= 1"
            @click="currentPage--"
          >
            <i class="bi bi-chevron-left"></i> Prev
          </button>

          <template v-for="p in totalPages" :key="p">
            <button
              v-if="p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)"
              type="button"
              class="btn btn-sm"
              :class="currentPage === p ? 'btn-primary' : 'btn-dark border-secondary text-muted'"
              style="min-width: 32px;"
              @click="currentPage = p"
            >
              {{ p }}
            </button>
            <span
              v-else-if="p === currentPage - 3 || p === currentPage + 3"
              class="text-muted px-1"
            >
              ...
            </span>
          </template>

          <button
            type="button"
            class="btn btn-dark border-secondary btn-sm"
            :disabled="currentPage >= totalPages"
            @click="currentPage++"
          >
            Next <i class="bi bi-chevron-right"></i>
          </button>
        </div>

        <!-- Actions -->
        <div class="d-flex align-items-center gap-3 ms-auto">
          <button
            class="btn btn-outline-danger px-4 py-2 fw-semibold"
            :disabled="isSaving"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            class="btn btn-idp-primary px-4 py-2 fw-semibold d-flex align-items-center gap-2"
            :disabled="isSaving"
            @click="emit('save')"
          >
            <span v-if="isSaving" class="spinner-border spinner-border-sm"></span>
            <i v-else class="bi bi-cloud-arrow-up-fill"></i>
            <span>{{ isSaving ? "Saving to Database..." : "Add to Database" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.badge-count {
  background: rgba(59, 142, 237, 0.15);
  color: #3b8eed;
  border: 1px solid rgba(59, 142, 237, 0.3);
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
