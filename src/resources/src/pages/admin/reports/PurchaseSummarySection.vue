<script setup lang="ts">
import { computed } from "vue";

interface Purchase {
  id: number;
  clientId: number;
  clientName?: string;
  clientBin?: string;
  office?: string;
  beNo?: string;
  beDate?: string;
  month: string;
  lcNumber?: string;
  netWt?: number;
  totalQty: number;
  assValue: number;
  baseValueOfVat: number;
  unitValue?: number;
  cd?: number;
  rd?: number;
  sd?: number;
  vat: number;
  at?: number;
  isRebate: boolean;
  isFfs: boolean;
  itemId: number;
  itemName?: string;
  hsCode?: string;
  unit?: string;
}

interface PurchaseSummaryRow {
  itemName: string;
  hsCode?: string;
  netQty: number;
  assValue: number;
  baseValueOfVat: number;
  sd: number;
  vat: number;
  at: number;
  purchaseRate: number;
  maxSalesRate: number;
}

const props = defineProps<{
  purchases: Purchase[];
  vatNote13: Purchase[];
  vatNote15: Purchase[];
  vatNote22: Purchase[];
  currentConvFactor: number;
  getPurchaseSummary: (purchases: Purchase[]) => PurchaseSummaryRow[];
  fmt: (val?: number | null) => string;
  formatBeDate: (date?: string | null) => string;
}>();

const emit = defineEmits<(e: "openChangeMonthModal", p: Purchase) => void>();

const purchaseSummaryRows = computed(() => props.getPurchaseSummary(props.purchases));

const totalQtySum = computed(() =>
  purchaseSummaryRows.value.reduce((sum, s) => sum + (Number(s.netQty) || 0) * props.currentConvFactor, 0)
);

const totalAssValueSum = computed(() =>
  purchaseSummaryRows.value.reduce((sum, s) => sum + (Number(s.assValue) || 0), 0)
);

const totalBaseValueSum = computed(() =>
  purchaseSummaryRows.value.reduce((sum, s) => sum + (Number(s.baseValueOfVat) || 0), 0)
);

const totalSdSum = computed(() =>
  purchaseSummaryRows.value.reduce((sum, s) => sum + (Number(s.sd) || 0), 0)
);

const totalVatSum = computed(() =>
  purchaseSummaryRows.value.reduce((sum, s) => sum + (Number(s.vat) || 0), 0)
);

const totalAtSum = computed(() =>
  purchaseSummaryRows.value.reduce((sum, s) => sum + (Number(s.at) || 0), 0)
);
</script>

<template>
  <div class="space-y-4">
    <!-- Summary Table -->
    <div v-if="purchases.length > 0" class="idp-card p-4 mb-4">
      <h5 class="text-white fw-bold mb-3 d-flex align-items-center gap-2">
        <i class="bi bi-pie-chart text-primary"></i> Overall Purchase Summary
      </h5>
      <div class="idp-table-wrapper">
        <table class="table idp-table mb-0 align-middle text-nowrap" style="font-size: 1.02rem;">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-center" style="width: 45px; color: #94a3b8; font-weight: 600;">#</th>
              <th class="text-start" style="color: #94a3b8; font-weight: 600;">Item & HS Code</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">Total Qty</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">Ass. Value</th>
              <th class="text-end" style="color: #38bdf8; font-weight: 600;">Base Value</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">SD</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">VAT</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">AT</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">Purchase Rate</th>
              <th class="text-end" style="color: #f59e0b; font-weight: 700;">Max Sales Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in purchaseSummaryRows" :key="idx">
              <td class="text-center font-monospace" style="color: #64748b;">{{ idx + 1 }}</td>
              <td class="text-start">
                <div class="fw-medium" style="font-size: 0.82rem; color: #cbd5e1;">{{ s.itemName }}</div>
                <div v-if="s.hsCode" class="font-monospace fw-semibold" style="font-size: 0.9rem; color: #94a3b8;">[{{ s.hsCode }}]</div>
              </td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(s.netQty * currentConvFactor) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(s.assValue) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #38bdf8;">{{ fmt(s.baseValueOfVat) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(s.sd) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(s.vat) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(s.at) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(s.purchaseRate / currentConvFactor) }}</td>
              <td class="text-end font-monospace fw-bold" style="font-size: 1.15rem; color: #f59e0b;">{{ fmt(s.maxSalesRate / currentConvFactor) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="purchaseSummaryRows.length > 0">
            <tr class="summary-total-row">
              <td colspan="2" class="fw-bold text-white fs-6">
                TOTAL
              </td>
              <td class="text-end font-monospace fw-bold text-white">
                {{ fmt(totalQtySum) }}
              </td>
              <td class="text-end font-monospace fw-bold text-white">
                {{ fmt(totalAssValueSum) }}
              </td>
              <td class="text-end font-monospace fw-bold" style="color: #38bdf8;">
                {{ fmt(totalBaseValueSum) }}
              </td>
              <td class="text-end font-monospace fw-bold text-white">
                {{ fmt(totalSdSum) }}
              </td>
              <td class="text-end font-monospace fw-bold text-white">
                {{ fmt(totalVatSum) }}
              </td>
              <td class="text-end font-monospace fw-bold text-white">
                {{ fmt(totalAtSum) }}
              </td>
              <td class="text-end text-muted">-</td>
              <td class="text-end text-muted">-</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Note 13 Table (Zero VAT / Exempted) -->
    <div v-if="vatNote13.length > 0" class="idp-card p-4 mb-4">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h5 class="text-info fw-bold mb-0">
          Purchase Details: Note 13 (Exempted / Zero VAT)
        </h5>
        <span class="badge-record-pill pill-primary">
          {{ vatNote13.length }} Records
        </span>
      </div>
      <div class="idp-table-wrapper">
        <table class="table idp-table mb-0 align-middle text-nowrap" style="font-size: 0.98rem;">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-center" style="width: 45px; color: #94a3b8;">#</th>
              <th class="text-start" style="color: #94a3b8;">Item</th>
              <th class="text-end" style="color: #94a3b8;">Total Qty</th>
              <th class="text-start" style="color: #94a3b8;">BE No</th>
              <th class="text-start" style="color: #94a3b8;">BE Date</th>
              <th class="text-center" style="color: #94a3b8;">Station</th>
              <th class="text-end" style="color: #94a3b8;">Ass. Value</th>
              <th class="text-end" style="color: #38bdf8;">Base Value</th>
              <th class="text-end" style="color: #94a3b8;">SD</th>
              <th class="text-end" style="color: #94a3b8;">VAT</th>
              <th class="text-end" style="color: #94a3b8;">AT</th>
              <th class="text-center" style="width: 45px; color: #94a3b8;">Edit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in vatNote13" :key="p.id">
              <td class="text-center font-monospace" style="color: #64748b;">{{ idx + 1 }}</td>
              <td class="text-start">
                <div class="fw-medium" style="font-size: 0.82rem; color: #cbd5e1;">{{ p.itemName || '-' }}</div>
                <div v-if="p.hsCode" class="font-monospace fw-semibold" style="font-size: 0.9rem; color: #94a3b8;">[{{ p.hsCode }}]</div>
              </td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.totalQty * currentConvFactor) }}</td>
              <td class="text-start font-monospace fw-medium" style="color: #7da0c4;">{{ p.beNo || '-' }}</td>
              <td class="text-start font-monospace" style="color: #64748b;">{{ formatBeDate(p.beDate) }}</td>
              <td class="text-center" style="color: #64748b;">{{ p.office || '-' }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.assValue) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #38bdf8;">{{ fmt(p.baseValueOfVat) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">{{ fmt(p.sd) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.vat) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.at) }}</td>
              <td class="text-center">
                <button class="btn btn-sm btn-link text-muted p-0 hover-white" title="Change Month" @click="emit('openChangeMonthModal', p)">
                  <i class="bi bi-pencil-square"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Note 15 Table (Rebateable) -->
    <div v-if="vatNote15.length > 0" class="idp-card p-4 mb-4">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h5 class="text-success fw-bold mb-0">
          Purchase Details: Note 15 (Standard / Rebateable)
        </h5>
        <span class="badge-record-pill pill-success">
          {{ vatNote15.length }} Records
        </span>
      </div>
      <div class="idp-table-wrapper">
        <table class="table idp-table mb-0 align-middle text-nowrap" style="font-size: 0.98rem;">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-center" style="width: 45px; color: #94a3b8;">#</th>
              <th class="text-start" style="color: #94a3b8;">Item</th>
              <th class="text-end" style="color: #94a3b8;">Total Qty</th>
              <th class="text-start" style="color: #94a3b8;">BE No</th>
              <th class="text-start" style="color: #94a3b8;">BE Date</th>
              <th class="text-center" style="color: #94a3b8;">Station</th>
              <th class="text-end" style="color: #94a3b8;">Ass. Value</th>
              <th class="text-end" style="color: #38bdf8;">Base Value</th>
              <th class="text-end" style="color: #94a3b8;">SD</th>
              <th class="text-end" style="color: #94a3b8;">VAT</th>
              <th class="text-end" style="color: #94a3b8;">AT</th>
              <th class="text-center" style="width: 45px; color: #94a3b8;">Edit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in vatNote15" :key="p.id">
              <td class="text-center font-monospace" style="color: #64748b;">{{ idx + 1 }}</td>
              <td class="text-start">
                <div class="fw-medium" style="font-size: 0.82rem; color: #cbd5e1;">{{ p.itemName || '-' }}</div>
                <div v-if="p.hsCode" class="font-monospace fw-semibold" style="font-size: 0.9rem; color: #94a3b8;">[{{ p.hsCode }}]</div>
              </td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.totalQty * currentConvFactor) }}</td>
              <td class="text-start font-monospace fw-medium" style="color: #7da0c4;">{{ p.beNo || '-' }}</td>
              <td class="text-start font-monospace" style="color: #64748b;">{{ formatBeDate(p.beDate) }}</td>
              <td class="text-center" style="color: #64748b;">{{ p.office || '-' }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.assValue) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #38bdf8;">{{ fmt(p.baseValueOfVat) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">{{ fmt(p.sd) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.vat) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.at) }}</td>
              <td class="text-center">
                <button class="btn btn-sm btn-link text-muted p-0 hover-white" title="Change Month" @click="emit('openChangeMonthModal', p)">
                  <i class="bi bi-pencil-square"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Note 22 Table (Non-Rebateable) -->
    <div v-if="vatNote22.length > 0" class="idp-card p-4 mb-4">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h5 class="text-warning fw-bold mb-0">
          Purchase Details: Note 22 (Non-Rebateable)
        </h5>
        <span class="badge-record-pill pill-warning">
          {{ vatNote22.length }} Records
        </span>
      </div>
      <div class="idp-table-wrapper">
        <table class="table idp-table mb-0 align-middle text-nowrap" style="font-size: 0.98rem;">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-center" style="width: 45px; color: #94a3b8;">#</th>
              <th class="text-start" style="color: #94a3b8;">Item</th>
              <th class="text-end" style="color: #94a3b8;">Total Qty</th>
              <th class="text-start" style="color: #94a3b8;">BE No</th>
              <th class="text-start" style="color: #94a3b8;">BE Date</th>
              <th class="text-center" style="color: #94a3b8;">Station</th>
              <th class="text-end" style="color: #94a3b8;">Ass. Value</th>
              <th class="text-end" style="color: #38bdf8;">Base Value</th>
              <th class="text-end" style="color: #94a3b8;">SD</th>
              <th class="text-end" style="color: #94a3b8;">VAT</th>
              <th class="text-end" style="color: #94a3b8;">AT</th>
              <th class="text-center" style="width: 45px; color: #94a3b8;">Edit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in vatNote22" :key="p.id">
              <td class="text-center font-monospace" style="color: #64748b;">{{ idx + 1 }}</td>
              <td class="text-start">
                <div class="fw-medium" style="font-size: 0.82rem; color: #cbd5e1;">{{ p.itemName || '-' }}</div>
                <div v-if="p.hsCode" class="font-monospace fw-semibold" style="font-size: 0.9rem; color: #94a3b8;">[{{ p.hsCode }}]</div>
              </td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.totalQty * currentConvFactor) }}</td>
              <td class="text-start font-monospace fw-medium" style="color: #7da0c4;">{{ p.beNo || '-' }}</td>
              <td class="text-start font-monospace" style="color: #64748b;">{{ formatBeDate(p.beDate) }}</td>
              <td class="text-center" style="color: #64748b;">{{ p.office || '-' }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.assValue) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #38bdf8;">{{ fmt(p.baseValueOfVat) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">{{ fmt(p.sd) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.vat) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(p.at) }}</td>
              <td class="text-center">
                <button class="btn btn-sm btn-link text-muted p-0 hover-white" title="Change Month" @click="emit('openChangeMonthModal', p)">
                  <i class="bi bi-pencil-square"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty Purchases State -->
    <div v-if="purchases.length === 0" class="idp-card p-5 text-center text-muted">
      No purchase records found for this period.
    </div>
  </div>
</template>

<style scoped>
.summary-total-row td {
  background-color: #1a1d21 !important;
  border-top: 2px solid #3b8eed;
  padding: 0.85rem 0.75rem;
}
</style>
