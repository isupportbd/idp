<script setup lang="ts">
import { ref, watch } from "vue";
import { useBillingApi } from "@/composables/useBillingApi";

const props = defineProps<{
  show: boolean;
  billId?: number | null;
  initialBillData?: any | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "close"): void;
}>();

const { fetchBillDetails } = useBillingApi();
const loading = ref(false);
const bill = ref<any>(null);

const loadBill = async () => {
  if (props.initialBillData && (!props.billId || props.initialBillData.id === props.billId)) {
    bill.value = props.initialBillData;
    return;
  }
  if (!props.billId) return;

  loading.value = true;
  try {
    const data = await fetchBillDetails(props.billId);
    bill.value = data;
  } catch (err) {
    // Handled in composable
  } finally {
    loading.value = false;
  }
};

watch(
  () => [props.show, props.billId],
  ([newShow]) => {
    if (newShow) {
      loadBill();
    } else {
      bill.value = null;
    }
  },
  { immediate: true }
);

const handleClose = () => {
  emit("update:show", false);
  emit("close");
};

const handlePrint = () => {
  window.print();
};
</script>

<template>
  <div v-if="show" class="invoice-modal-backdrop d-print-block">
    <div class="invoice-modal-container">
      <!-- Modal Top Action Bar (Hidden on Print) -->
      <div class="invoice-modal-header d-print-none">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-receipt-cutoff text-primary fs-5"></i>
          <span class="fw-bold text-white fs-6">
            Invoice Preview — <span class="font-monospace text-info">{{ bill?.billNo || 'Loading...' }}</span>
          </span>
        </div>

        <div class="d-flex align-items-center gap-2">
          <button
            type="button"
            class="btn btn-primary btn-sm px-3 fw-semibold d-flex align-items-center gap-1 shadow-sm"
            @click="handlePrint"
          >
            <i class="bi bi-printer-fill"></i>
            <span>Print / Save PDF</span>
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm px-3"
            @click="handleClose"
          >
            <i class="bi bi-x-lg me-1"></i>
            <span>Close</span>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-5 text-muted d-print-none">
        <div class="spinner-border text-primary mb-3"></div>
        <div>Loading Invoice Details...</div>
      </div>

      <!-- Printable A4 Invoice Sheet -->
      <div v-else-if="bill" class="invoice-sheet" id="printable-invoice">
        <!-- 1. Header: Firm & Document Title -->
        <div class="invoice-header d-flex justify-content-between align-items-start border-bottom pb-3 mb-3">
          <div class="firm-details">
            <h3 class="firm-name fw-bold text-dark mb-1">
              {{ bill.companySettings?.companyName || 'VAT & TAX CONSULTANCY SERVICES' }}
            </h3>
            <div v-if="bill.companySettings?.address" class="firm-text text-secondary small">
              {{ bill.companySettings.address }}
            </div>
            <div class="firm-contact text-secondary small mt-1">
              <span v-if="bill.companySettings?.phone" class="me-3">
                <strong>Phone:</strong> {{ bill.companySettings.phone }}
              </span>
              <span v-if="bill.companySettings?.email" class="me-3">
                <strong>Email:</strong> {{ bill.companySettings.email }}
              </span>
              <span v-if="bill.companySettings?.binNumber">
                <strong>BIN:</strong> {{ bill.companySettings.binNumber }}
              </span>
            </div>
          </div>

          <div class="invoice-badge-box text-end">
            <div class="invoice-title fw-bold text-uppercase">INVOICE / BILL</div>
            <div class="invoice-number font-monospace fw-bold fs-5 text-primary">
              #{{ bill.billNo }}
            </div>
            <div class="status-pill mt-1">
              <span
                class="badge"
                :class="{
                  'bg-success': bill.status === 'paid',
                  'bg-warning text-dark': bill.status === 'partial' || bill.status === 'draft',
                  'bg-danger': bill.status === 'unpaid' || bill.status === 'overdue',
                  'bg-secondary': bill.status === 'cancelled'
                }"
              >
                {{ bill.status?.toUpperCase() }}
              </span>
            </div>
          </div>
        </div>

        <!-- 2. Invoice Meta & Bill To Info Grid -->
        <div class="row g-3 mb-4">
          <!-- Bill To (Client) -->
          <div class="col-7">
            <div class="section-box p-3 rounded bg-light border">
              <div class="text-uppercase text-muted fw-bold small mb-2" style="letter-spacing: 0.5px;">Billed To:</div>
              <h5 class="fw-bold text-dark mb-1">{{ bill.clientName }}</h5>
              <div v-if="bill.clientProprietor" class="small text-secondary mb-1">
                <strong>Proprietor:</strong> {{ bill.clientProprietor }}
              </div>
              <div v-if="bill.clientBin" class="small mb-1 font-monospace">
                <strong>BIN:</strong> {{ bill.clientBin }}
              </div>
              <div v-if="bill.clientMobile" class="small text-secondary mb-1">
                <strong>Mobile:</strong> {{ bill.clientMobile }}
              </div>
              <div v-if="bill.clientAddress" class="small text-secondary">
                <strong>Address:</strong> {{ bill.clientAddress }}
              </div>
            </div>
          </div>

          <!-- Invoice Details -->
          <div class="col-5">
            <div class="section-box p-3 rounded bg-light border h-100">
              <div class="text-uppercase text-muted fw-bold small mb-2" style="letter-spacing: 0.5px;">Invoice Details:</div>
              <div class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
                <span class="text-muted">Tax Period:</span>
                <span class="fw-bold font-monospace text-dark">{{ bill.taxPeriod }}</span>
              </div>
              <div class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
                <span class="text-muted">Invoice Date:</span>
                <span class="fw-bold text-dark">{{ new Date(bill.billDate).toLocaleDateString() }}</span>
              </div>
              <div v-if="bill.dueDate" class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
                <span class="text-muted">Due Date:</span>
                <span class="fw-bold text-danger">{{ new Date(bill.dueDate).toLocaleDateString() }}</span>
              </div>
              <div v-if="bill.submissionId" class="d-flex justify-content-between small py-1 border-bottom border-light-subtle">
                <span class="text-muted">VAT 9.1 Submission:</span>
                <span class="font-monospace fw-bold text-success">#{{ bill.submissionId }}</span>
              </div>
              <div v-if="bill.referenceName" class="d-flex justify-content-between small py-1">
                <span class="text-muted">Reference:</span>
                <span class="text-dark">{{ bill.referenceName }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Line Items Table -->
        <table class="table invoice-table mb-4">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 45%;">Service Item & Description</th>
              <th style="width: 12%; text-align: center;">Unit</th>
              <th style="width: 10%; text-align: right;">Qty</th>
              <th style="width: 13%; text-align: right;">Rate (Tk)</th>
              <th style="width: 15%; text-align: right;">Amount (Tk)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, idx) in bill.items" :key="it.id || idx">
              <td class="text-muted">{{ Number(idx) + 1 }}</td>
              <td>
                <div class="fw-bold text-dark">{{ it.itemName }}</div>
                <div v-if="it.notes" class="text-muted small">{{ it.notes }}</div>
              </td>
              <td class="text-center font-monospace text-secondary">{{ it.unit || 'Month' }}</td>
              <td class="text-end font-monospace">{{ it.qty }}</td>
              <td class="text-end font-monospace">{{ Number(it.rateUsed).toFixed(2) }}</td>
              <td class="text-end font-monospace fw-bold text-dark">{{ Number(it.finalAmount).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- 4. Summary & Totals Calculation Grid -->
        <div class="row g-3 mb-4">
          <!-- Terms & Payment Notes -->
          <div class="col-7">
            <div class="terms-box p-3 rounded border bg-light h-100">
              <div class="fw-bold small text-dark mb-1">Terms & Conditions:</div>
              <div class="text-secondary small font-monospace" style="white-space: pre-line; line-height: 1.5;">
                {{ bill.companySettings?.invoiceTerms || '1. Payment is due within 15 days of invoice date.\n2. Please mention invoice number as payment reference.\n3. Thank you for your business!' }}
              </div>
              <div v-if="bill.notes" class="mt-2 pt-2 border-top small text-muted">
                <strong>Remarks:</strong> {{ bill.notes }}
              </div>
            </div>
          </div>

          <!-- Financial Calculation Breakdown -->
          <div class="col-5">
            <div class="calculation-box p-3 rounded border bg-light">
              <div class="d-flex justify-content-between small py-1 border-bottom">
                <span class="text-muted">Current Subtotal:</span>
                <span class="font-monospace fw-bold">{{ Number(bill.subtotal).toFixed(2) }} Tk</span>
              </div>
              <div v-if="bill.discountAmount > 0" class="d-flex justify-content-between small py-1 border-bottom text-success">
                <span>Special Discount:</span>
                <span class="font-monospace">-{{ Number(bill.discountAmount).toFixed(2) }} Tk</span>
              </div>
              <div class="d-flex justify-content-between small py-1 border-bottom">
                <span class="text-muted">
                  {{ bill.previousDue > 0 ? 'Previous Due' : bill.previousDue < 0 ? 'Advance Balance' : 'Previous Balance' }}:
                </span>
                <span class="font-monospace fw-semibold" :class="bill.previousDue > 0 ? 'text-danger' : bill.previousDue < 0 ? 'text-success' : 'text-dark'">
                  {{ bill.previousDue > 0 ? `+${Number(bill.previousDue).toFixed(2)}` : bill.previousDue < 0 ? `-${Math.abs(Number(bill.previousDue)).toFixed(2)}` : '0.00' }} Tk
                </span>
              </div>
              <div class="d-flex justify-content-between py-2 border-bottom mt-1 bg-white px-2 rounded border">
                <span class="fw-bold text-dark">Total Payable:</span>
                <span class="font-monospace fw-bold fs-6 text-primary">{{ Number(bill.grandTotal).toFixed(2) }} Tk</span>
              </div>
              <div class="d-flex justify-content-between small py-1 border-bottom text-success mt-1">
                <span>Paid Amount:</span>
                <span class="font-monospace fw-bold">{{ Number(bill.paidAmount || 0).toFixed(2) }} Tk</span>
              </div>
              <div class="d-flex justify-content-between py-2 mt-1 bg-dark text-white px-2 rounded">
                <span class="fw-bold">Net Due:</span>
                <span class="font-monospace fw-bold fs-5" :class="Number(bill.dueAmount) > 0 ? 'text-warning' : 'text-light'">
                  {{ Number(bill.dueAmount).toFixed(2) }} Tk
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Signatures Footer -->
        <div class="signature-section d-flex justify-content-between align-items-end mt-5 pt-4">
          <div class="text-center" style="width: 200px;">
            <div class="border-top border-dark pt-2 small text-muted">Customer Signature</div>
          </div>
          <div class="text-center" style="width: 220px;">
            <div class="border-top border-dark pt-2 small fw-bold text-dark">
              Authorized Signature & Seal
            </div>
            <div class="small text-muted" style="font-size: 0.75rem;">
              {{ bill.companySettings?.companyName || 'VAT & Tax Consultancy' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.invoice-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1060;
  padding: 1.5rem;
  overflow-y: auto;
}

.invoice-modal-container {
  background: #181b1f;
  border: 1px solid #343a40;
  border-radius: 10px;
  width: 100%;
  max-width: 860px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.invoice-modal-header {
  padding: 1rem 1.5rem;
  background: #1e2227;
  border-bottom: 1px solid #343a40;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}

.invoice-sheet {
  background: #ffffff;
  color: #212529;
  padding: 2.5rem;
  margin: 1.5rem auto;
  border-radius: 6px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  width: 100%;
  max-width: 800px;
  overflow-y: auto;
}

.firm-name {
  color: #111417;
  letter-spacing: -0.5px;
}

.invoice-title {
  color: #495057;
  font-size: 0.95rem;
  letter-spacing: 1px;
}

.invoice-table th {
  background-color: #f1f3f5;
  color: #343a40;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  border-bottom: 2px solid #dee2e6;
  padding: 8px 10px;
}

.invoice-table td {
  padding: 10px;
  border-bottom: 1px solid #e9ecef;
  font-size: 0.9rem;
}

/* Dedicated Print Styles */
@media print {
  body * {
    visibility: hidden;
  }
  .invoice-modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
  }
  .invoice-modal-container {
    border: none !important;
    box-shadow: none !important;
    max-width: 100% !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .invoice-sheet,
  .invoice-sheet * {
    visibility: visible;
  }
  .invoice-sheet {
    position: absolute;
    left: 0;
    top: 0;
    width: 100% !important;
    max-width: 100% !important;
    padding: 20px !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
  }
  .d-print-none {
    display: none !important;
  }
  .d-print-block {
    display: block !important;
  }
}
</style>
