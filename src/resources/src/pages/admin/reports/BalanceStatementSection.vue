<script setup lang="ts">
interface StatementItem {
  startDate: string;
  endDate: string;
  itemId: number;
  itemName: string;
  qty: number;
  salesRate: number;
  totalSalesValue: number;
  vatableValue: number;
  vat: number;
}

const props = defineProps<{
  statementReport: StatementItem[];
  currentConvFactor: number;
  formatDate: (val?: string | null) => string;
  fmt: (val?: number | null) => string;
}>();
</script>

<template>
  <div class="idp-card p-4">
    <h5 class="text-white fw-bold mb-3 d-flex align-items-center gap-2">
      <i class="bi bi-clock-history text-primary"></i> Mid-Month Rate Change Statement Breakdown
    </h5>
    <div class="idp-table-wrapper" style="max-height: 420px; overflow: auto;">
      <table class="table idp-table mb-0 align-middle text-nowrap" style="font-size: 0.95rem;">
        <thead>
          <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
            <th class="text-center py-2.5 font-semibold" style="color: #94a3b8;">Active Period</th>
            <th class="text-start py-2.5 font-semibold" style="color: #94a3b8;">Item</th>
            <th class="text-end py-2.5 font-semibold" style="color: #94a3b8;">Qty</th>
            <th class="text-end py-2.5 font-semibold" style="color: #94a3b8;">Rate</th>
            <th class="text-end py-2.5 font-semibold" style="color: #38bdf8;">Total Price</th>
            <th class="text-end py-2.5 font-semibold" style="color: #94a3b8;">Vatable Value</th>
            <th class="text-end py-2.5 font-semibold" style="color: #94a3b8;">VAT</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(st, idx) in statementReport" :key="idx">
            <td class="text-center font-monospace py-2.5" style="color: #64748b;">
              {{ formatDate(st.startDate) }} <span style="color: #475569;">➔</span> {{ formatDate(st.endDate) }}
            </td>
            <td class="text-start fw-medium py-2.5" style="color: #cbd5e1;">{{ st.itemName }}</td>
            <td class="text-end font-monospace py-2.5" style="color: #94a3b8;">{{ fmt(st.qty * currentConvFactor) }}</td>
            <td class="text-end font-monospace fw-medium py-2.5" style="color: #94a3b8;">{{ fmt(st.salesRate / currentConvFactor) }}</td>
            <td class="text-end font-monospace fw-medium py-2.5" style="color: #38bdf8;">{{ fmt(st.totalSalesValue) }}</td>
            <td class="text-end font-monospace py-2.5" style="color: #64748b;">{{ fmt(st.vatableValue) }}</td>
            <td class="text-end font-monospace py-2.5" style="color: #94a3b8;">{{ fmt(st.vat) }}</td>
          </tr>
          <tr v-if="statementReport.length === 0">
            <td colspan="7" class="text-center py-5 text-muted">
              No statement records available for this period.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
