<script setup lang="ts">
import { canAccessModule } from "@/composables/useAuth";

interface Client {
  id: number;
  name: string;
  bin?: string;
}

const props = defineProps<{
  selectedClient: Client;
  selectedClientId: number;
  selectedMonthYear: string;
  submissionId: string | null;
  currentMonthBill: { id: number; billNo: string } | null;
  hideEmptyNotes: boolean;
  returnNote3Value: number;
  returnNote4: { value: number; sd: number; vat: number };
  returnNote8: { value: number; sd: number; vat: number };
  returnNote9: { value: number; sd: number; vat: number };
  returnNote13Value: number;
  returnNote15: { value: number; vat: number };
  returnNote22: { value: number };
  returnNote23: { value: number; vat: number };
  returnNote27VAT: number;
  returnNote30VAT: number;
  returnNote32VAT: number;
  returnNote33VAT: number;
  returnNote34VAT: number;
  formatMonth: (val?: string | null) => string;
  fmt: (val?: number | null) => string;
}>();

const emit = defineEmits<{
  (e: "update:hideEmptyNotes", val: boolean): void;
  (e: "openSubIdModal"): void;
}>();

const showReturnRow = (...vals: (number | null | undefined)[]) => {
  if (!props.hideEmptyNotes) return true;
  return vals.some((v) => Number(v || 0) > 0);
};
</script>

<template>
  <div class="space-y-4">
    <!-- Return Form Header Controls -->
    <div class="idp-card px-4 py-3 mb-4 d-flex flex-wrap align-items-center justify-content-between gap-3">
      <div>
        <h5 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-file-earmark-text text-primary"></i>
          NBR Mushak-9.1 Value Added Tax Return
        </h5>
        <div class="text-muted small d-flex flex-wrap align-items-center gap-2">
          <span>Tax Period: <strong class="text-warning">{{ formatMonth(selectedMonthYear) }}</strong></span>
          <span class="text-secondary">|</span>
          <span>BIN: <strong class="text-light font-monospace">{{ selectedClient.bin }}</strong></span>
          <span class="text-secondary">|</span>

          <!-- Submission ID Inline Link -->
          <span class="d-inline-flex align-items-center gap-1">
            <span>Sub ID:</span>
            <template v-if="submissionId">
              <span class="text-emerald-400 font-monospace fw-bold">{{ submissionId }}</span>
              <button
                type="button"
                class="btn btn-link btn-sm text-muted p-0 hover-white"
                title="Edit Submission ID"
                @click="emit('openSubIdModal')"
              >
                <i class="bi bi-pencil-square ms-0.5"></i>
              </button>
            </template>
            <template v-else>
              <a
                href="javascript:void(0)"
                class="text-info text-decoration-none fw-semibold"
                @click="emit('openSubIdModal')"
              >
                Enter Submission ID
              </a>
            </template>
          </span>

          <!-- Bill No / Create Bill Inline Link -->
          <template v-if="canAccessModule('billing')">
            <span class="text-secondary">|</span>
            <span class="d-inline-flex align-items-center gap-1">
              <span>Bill:</span>
              <template v-if="currentMonthBill">
                <router-link
                  to="/admin/billing"
                  target="_blank"
                  class="text-warning font-monospace fw-bold text-decoration-none"
                  title="View Bill in Billing Module (New Tab)"
                >
                  {{ currentMonthBill.billNo }}
                </router-link>
              </template>
              <template v-else-if="submissionId">
                <router-link
                  :to="'/admin/billing/create?clientId=' + selectedClientId + '&month=' + selectedMonthYear"
                  target="_blank"
                  class="text-info text-decoration-none fw-semibold"
                  title="Create Bill for this tax month in New Tab"
                >
                  Create Bill
                </router-link>
              </template>
              <template v-else>
                <span class="text-muted small" title="Submission required before creating bill">—</span>
              </template>
            </span>
          </template>
        </div>
      </div>
      <div class="form-check form-switch d-flex align-items-center gap-2">
        <input
          id="hideEmptySwitch"
          :checked="hideEmptyNotes"
          class="form-check-input cursor-pointer m-0"
          type="checkbox"
          @change="emit('update:hideEmptyNotes', ($event.target as HTMLInputElement).checked)"
        />
        <label for="hideEmptySwitch" class="form-check-label text-white small cursor-pointer">
          Hide Empty Notes
        </label>
      </div>
    </div>

    <!-- PART 3: SUPPLY - OUTPUT TAX -->
    <div class="idp-card p-4 mb-4">
      <h5 class="text-emerald-400 fw-bold mb-3 text-center border-bottom border-secondary border-opacity-25 pb-2.5 fs-5">
        PART - 3: SUPPLY - OUTPUT TAX
      </h5>
      <div class="idp-table-wrapper" style="max-height: 440px; overflow: auto;">
        <table class="table idp-table mushak-table mb-0 align-middle text-nowrap">
          <thead>
            <tr>
              <th class="text-start" style="width: 40%;">Nature of Supply</th>
              <th class="text-center" style="width: 110px;">Note</th>
              <th class="text-end">Value (a)</th>
              <th class="text-end">SD (b)</th>
              <th class="text-end">VAT (c)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="showReturnRow(returnNote3Value)">
              <td class="text-start" style="color: #cbd5e1;">Exempted Goods/Service</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 3</td>
              <td class="text-end font-monospace fw-medium" style="color: #cbd5e1;">{{ fmt(returnNote3Value) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
            </tr>
            <tr v-if="showReturnRow(returnNote4.value, returnNote4.sd, returnNote4.vat)">
              <td class="text-start" style="color: #cbd5e1;">Standard Rated Goods/Service</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 4</td>
              <td class="text-end font-monospace fw-medium" style="color: #cbd5e1;">{{ fmt(returnNote4.value) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">{{ fmt(returnNote4.sd) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #6ee7b7;">{{ fmt(returnNote4.vat) }}</td>
            </tr>
            <tr v-if="showReturnRow(returnNote8.value, returnNote8.sd, returnNote8.vat)">
              <td class="text-start" style="color: #cbd5e1;">Retail/Wholesale/Trade Based Supply</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 8</td>
              <td class="text-end font-monospace fw-medium" style="color: #cbd5e1;">{{ fmt(returnNote8.value) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">{{ fmt(returnNote8.sd) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #6ee7b7;">{{ fmt(returnNote8.vat) }}</td>
            </tr>
            <tr v-if="showReturnRow(returnNote9.value, returnNote9.sd, returnNote9.vat)" class="fw-bold" style="background: rgba(59, 130, 246, 0.12);">
              <td class="text-start" style="color: #93c5fd;">Total Sales Value & Total Payable Taxes</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #f59e0b;">Note: 9</td>
              <td class="text-end font-monospace fw-bold" style="color: #93c5fd;">{{ fmt(returnNote9.value) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">{{ fmt(returnNote9.sd) }}</td>
              <td class="text-end font-monospace fw-bold" style="color: #6ee7b7;">{{ fmt(returnNote9.vat) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PART 4: PURCHASE - INPUT TAX -->
    <div class="idp-card p-4 mb-4">
      <h5 class="text-emerald-400 fw-bold mb-3 text-center border-bottom border-secondary border-opacity-25 pb-2.5 fs-5">
        PART - 4: PURCHASE - INPUT TAX
      </h5>
      <div class="idp-table-wrapper" style="max-height: 440px; overflow: auto;">
        <table class="table idp-table mushak-table mb-0 align-middle text-nowrap">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-start" style="width: 40%; color: #94a3b8;">Nature of Supply</th>
              <th class="text-center" style="width: 110px; color: #94a3b8;">Note</th>
              <th class="text-end" style="color: #94a3b8;">Value (a)</th>
              <th class="text-end" style="color: #94a3b8;">VAT (b)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="showReturnRow(returnNote13Value)">
              <td class="text-start" style="color: #cbd5e1;">Exempted Goods/Service (Import)</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 13</td>
              <td class="text-end font-monospace fw-medium" style="color: #cbd5e1;">{{ fmt(returnNote13Value) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
            </tr>
            <tr v-if="showReturnRow(returnNote15.value, returnNote15.vat)">
              <td class="text-start" style="color: #cbd5e1;">Standard Rated Goods/Service (Import)</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 15</td>
              <td class="text-end font-monospace fw-medium" style="color: #cbd5e1;">{{ fmt(returnNote15.value) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #6ee7b7;">{{ fmt(returnNote15.vat) }}</td>
            </tr>
            <tr v-if="showReturnRow(returnNote22.value)">
              <td class="text-start" style="color: #cbd5e1;">Non-Rebateable Goods/Service (Import)</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 22</td>
              <td class="text-end font-monospace fw-medium" style="color: #cbd5e1;">{{ fmt(returnNote22.value) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
            </tr>
            <tr v-if="showReturnRow(returnNote23.value, returnNote23.vat)" class="fw-bold" style="background: rgba(59, 130, 246, 0.12);">
              <td class="text-start" style="color: #93c5fd;">Total Purchase & Total Input Tax</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #f59e0b;">Note: 23</td>
              <td class="text-end font-monospace fw-bold" style="color: #93c5fd;">{{ fmt(returnNote23.value) }}</td>
              <td class="text-end font-monospace fw-bold" style="color: #6ee7b7;">{{ fmt(returnNote23.vat) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PART 5: INCREASING ADJUSTMENTS -->
    <div class="idp-card p-4 mb-4">
      <h5 class="text-emerald-400 fw-bold mb-3 text-center border-bottom border-secondary border-opacity-25 pb-2.5 fs-5">
        PART - 5: INCREASING ADJUSTMENTS
      </h5>
      <div class="idp-table-wrapper" style="max-height: 440px; overflow: auto;">
        <table class="table idp-table mushak-table mb-0 align-middle text-nowrap">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-start" style="width: 40%; color: #94a3b8;">Nature of Supply</th>
              <th class="text-center" style="width: 110px; color: #94a3b8;">Note</th>
              <th class="text-end" style="color: #94a3b8;">VAT</th>
              <th class="text-end" style="color: #94a3b8;">SD</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="showReturnRow(returnNote27VAT)">
              <td class="text-start" style="color: #cbd5e1;">Any Other Adjustments</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 27</td>
              <td class="text-end font-monospace fw-medium" style="color: #f59e0b;">{{ fmt(returnNote27VAT) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PART 6: DECREASING ADJUSTMENTS -->
    <div class="idp-card p-4 mb-4">
      <h5 class="text-emerald-400 fw-bold mb-3 text-center border-bottom border-secondary border-opacity-25 pb-2.5 fs-5">
        PART - 6: DECREASING ADJUSTMENTS
      </h5>
      <div class="idp-table-wrapper" style="max-height: 440px; overflow: auto;">
        <table class="table idp-table mushak-table mb-0 align-middle text-nowrap">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-start" style="width: 40%; color: #94a3b8;">Nature of Supply</th>
              <th class="text-center" style="width: 110px; color: #94a3b8;">Note</th>
              <th class="text-end" style="color: #94a3b8;">Value</th>
              <th class="text-end" style="color: #94a3b8;">VAT</th>
              <th class="text-end" style="color: #94a3b8;">SD</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="showReturnRow(returnNote30VAT)">
              <td class="text-start" style="color: #cbd5e1;">Advance Tax Paid at Import Stage</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 30</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
              <td class="text-end font-monospace fw-medium" style="color: #6ee7b7;">{{ fmt(returnNote30VAT) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
            </tr>
            <tr v-if="showReturnRow(returnNote32VAT)">
              <td class="text-start" style="color: #cbd5e1;">Any Other Adjustments</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #7da0c4;">Note: 32</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
              <td class="text-end font-monospace fw-medium" style="color: #6ee7b7;">{{ fmt(returnNote32VAT) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
            </tr>
            <tr v-if="showReturnRow(returnNote33VAT)" class="fw-bold" style="background: rgba(59, 130, 246, 0.12);">
              <td class="text-start" style="color: #93c5fd;">Total Decreasing Adjustment</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #f59e0b;">Note: 33</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
              <td class="text-end font-monospace fw-bold" style="color: #6ee7b7;">{{ fmt(returnNote33VAT) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">0.00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PART 7: NET TAX CALCULATION -->
    <div class="idp-card p-4 mb-4" style="border: 1px solid rgba(217, 70, 239, 0.4); background: rgba(112, 26, 117, 0.08);">
      <h5 class="text-emerald-400 fw-bold mb-3 text-center border-bottom border-secondary border-opacity-25 pb-2.5 fs-5">
        PART - 7: NET TAX CALCULATION
      </h5>
      <div class="idp-table-wrapper" style="max-height: 440px; overflow: auto;">
        <table class="table idp-table mushak-table mushak-table-net mb-0 align-middle text-nowrap">
          <thead>
            <tr style="color: #94a3b8 !important;">
              <th class="text-start" style="width: 50%; color: #94a3b8;">Nature of Supply</th>
              <th class="text-center" style="width: 110px; color: #94a3b8;">Note</th>
              <th class="text-end" style="color: #94a3b8;">VAT</th>
            </tr>
          </thead>
          <tbody>
            <tr class="fw-bold" style="background: rgba(217, 70, 239, 0.15);">
              <td class="text-start" style="color: #cbd5e1;">Net Payable VAT for the Tax Period</td>
              <td class="text-center font-monospace mushak-note-cell" style="color: #f59e0b;">Note: 34</td>
              <td class="text-end font-monospace fw-bold fs-4" style="color: #f59e0b;">{{ fmt(returnNote34VAT) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
