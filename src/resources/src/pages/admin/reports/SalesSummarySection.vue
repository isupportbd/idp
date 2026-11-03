<script setup lang="ts">
interface SalesReportItem {
  itemId: number;
  itemName: string;
  hsCode?: string;
  awHsCode?: string;
  totalQty: number;
  rate: number;
  unitValue: number;
  totalValue: number;
  addition: number;
  vatRate: number;
  note: string;
  isFfs?: boolean;
}

const props = defineProps<{
  hasMissingRates: boolean;
  groupedSales: Record<string, SalesReportItem[]>;
  salesReport: SalesReportItem[];
  currentConvFactor: number;
  fmt: (val?: number | null) => string;
}>();
</script>

<template>
  <div class="space-y-4">
    <!-- Missing Rates Warning -->
    <div v-if="hasMissingRates" class="alert alert-warning d-flex align-items-center gap-2 mb-3">
      <i class="bi bi-exclamation-triangle-fill fs-5"></i>
      <div>
        <strong>Warning:</strong> Some items do not have an active Sales Rate configured. Please configure them in the <strong>Sales Rates</strong> tab.
      </div>
    </div>

    <!-- Grouped Sales Tables -->
    <div v-for="(items, noteKey) in groupedSales" :key="noteKey" class="idp-card p-4 mb-4">
      <h5 class="fw-bold mb-3 d-flex align-items-center justify-content-between">
        <span class="d-flex align-items-center gap-2" :class="noteKey === '4' ? 'text-info' : noteKey === '3' ? 'text-warning' : 'text-success'">
          <i class="bi" :class="noteKey === '4' ? 'bi-shield-check' : noteKey === '3' ? 'bi-slash-circle' : 'bi-bag-check-fill'"></i>
          <span>Sales Summary: (Note {{ noteKey }})</span>
        </span>
        <span class="badge-record-pill" :class="noteKey === '4' ? 'pill-primary' : noteKey === '3' ? 'pill-warning' : 'pill-success'">
          {{ items.length }} Items
        </span>
      </h5>
      <div class="idp-table-wrapper" style="max-height: 380px; overflow: auto;">
        <table class="table idp-table mb-0 align-middle text-nowrap" style="font-size: 0.98rem;">
          <thead>
            <tr style="color: #94a3b8 !important; border-bottom: 1px solid #334155;">
              <th class="text-center" style="width: 45px; color: #94a3b8;">#</th>
              <th class="text-start" style="color: #94a3b8;">Item</th>
              <th class="text-end" style="color: #94a3b8;">Total Qty</th>
              <th class="text-end" style="color: #94a3b8;">Rate</th>
              <th class="text-end" style="color: #94a3b8;">Unit Value</th>
              <th class="text-end" style="color: #34d399; font-weight: 600;">Total Value</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">VAT</th>
              <th class="text-end" style="color: #94a3b8; font-weight: 600;">Addition %</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in items" :key="idx">
              <td class="text-center font-monospace" style="color: #64748b;">{{ idx + 1 }}</td>
              <td class="text-start">
                <div class="fw-medium" style="font-size: 0.82rem; color: #cbd5e1;">{{ item.itemName }}</div>
                <div v-if="item.hsCode" class="font-monospace fw-semibold" style="font-size: 0.9rem; color: #94a3b8;">[{{ item.hsCode || '-' }}]</div>
              </td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(item.totalQty * currentConvFactor) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt(item.rate / currentConvFactor) }}</td>
              <td class="text-end font-monospace" style="color: #64748b;">{{ fmt(item.unitValue / currentConvFactor) }}</td>
              <td class="text-end font-monospace fw-medium" style="color: #34d399;">{{ fmt(item.totalValue) }}</td>
              <td class="text-end font-monospace" style="color: #94a3b8;">{{ fmt((item.totalValue * item.vatRate) / 100) }}</td>
              <td class="text-end font-monospace" style="color: #f59e0b;">{{ fmt(item.addition) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="salesReport.length === 0" class="idp-card p-5 text-center text-muted">
      No sales data calculated for this period.
    </div>
  </div>
</template>
