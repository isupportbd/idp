<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { usePayoutsApi, formatBdt, formatMonth } from "@/composables/usePayoutsApi";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const toast = useToast();
const { currentPayout: payout, loading, fetchPayout } = usePayoutsApi();

const totalPayable = computed(() => {
  if (!payout.value) return 0;
  return Number(
    (
      Number(payout.value.amount || 0) +
      Number(payout.value.closingDueSnapshot || 0) -
      Number(payout.value.advanceSnapshot || 0)
    ).toFixed(2)
  );
});

const load = async () => {
  try {
    await fetchPayout(Number(route.params.id));
  } catch {
    toast.error("Failed to load payout record");
  }
};

const printReceipt = () => window.print();

onMounted(load);
</script>

<template>
  <div class="payout-view-page py-2">
    <!-- Header -->
    <div class="d-print-none d-flex flex-wrap justify-content-between align-items-center mb-3">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/admin/payouts" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Payouts
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">#{{ route.params.id }}</span>
        </div>
        <h4 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-receipt-cutoff text-primary"></i>
          {{ payout?.payoutType === "staff" ? "Staff Payout Receipt" : "Expense Voucher" }}
        </h4>
        <span class="text-muted small" v-if="payout?.periodMonth">
          Period: {{ formatMonth(payout.periodMonth) }}
        </span>
      </div>
      <div class="d-flex align-items-center gap-2 mt-3 mt-md-0">
        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm d-flex align-items-center gap-2 text-light px-3"
          @click="printReceipt"
        >
          <i class="bi bi-printer text-info"></i>
          <span>Print</span>
        </button>
        <router-link to="/admin/payouts/create" class="btn btn-primary btn-sm d-flex align-items-center gap-2 px-3 fw-semibold">
          <i class="bi bi-plus-lg"></i>
          <span>New Payout</span>
        </router-link>
      </div>
    </div>

    <div v-if="loading && !payout" class="text-center text-muted py-5">
      <div class="spinner-border text-primary me-2"></div> Loading payout...
    </div>

    <div v-else-if="!payout" class="text-center text-muted py-5">
      <i class="bi bi-exclamation-circle fs-2 d-block mb-2 text-secondary"></i>
      Payout record not found.
    </div>

    <template v-else>
      <!-- Amount banner -->
      <div class="amount-banner mb-3">
        <div>
          <div class="text-muted stat-label">Amount Paid</div>
          <div class="amount-value">{{ formatBdt(payout.amount) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        </div>
        <div class="d-flex flex-column align-items-end gap-2">
          <span v-if="payout.payoutType === 'staff'" class="badge badge-staff">Staff Payout</span>
          <span v-else class="badge badge-expense">General Expense</span>
          <span class="text-muted small">
            {{ new Date(payout.paidAt).toLocaleString() }}
          </span>
        </div>
      </div>

      <div class="row g-3">
        <!-- Left column -->
        <div class="col-12 col-lg-6">
          <div class="panel-card p-3 h-100">
            <div class="d-flex align-items-center gap-2 mb-3">
              <i class="bi bi-person-lines-fill text-primary"></i>
              <span class="text-white fw-semibold">{{ payout.payoutType === "staff" ? "Payee" : "Expense Head" }}</span>
            </div>
            <template v-if="payout.payoutType === 'staff'">
              <div class="detail-line">
                <span class="text-muted">Staff Name</span>
                <strong class="text-light">{{ payout.staffName || "—" }}</strong>
              </div>
              <div class="detail-line">
                <span class="text-muted">Mobile</span>
                <strong class="text-light">{{ payout.staffMobile || "—" }}</strong>
              </div>
              <div class="detail-line">
                <span class="text-muted">Expense Head</span>
                <strong class="text-light">{{ payout.headName || "—" }} <small class="text-muted">({{ payout.category || "—" }})</small></strong>
              </div>
            </template>
            <template v-else>
              <div class="detail-line">
                <span class="text-muted">Expense Head</span>
                <strong class="text-light">{{ payout.headName || "—" }}</strong>
              </div>
              <div class="detail-line">
                <span class="text-muted">Category</span>
                <strong class="text-light">{{ payout.category || "—" }}</strong>
              </div>
              <div class="detail-line">
                <span class="text-muted">Period</span>
                <strong class="text-light">{{ payout.periodMonth ? formatMonth(payout.periodMonth) : "—" }}</strong>
              </div>
            </template>
          </div>
        </div>

        <!-- Right column: payment -->
        <div class="col-12 col-lg-6">
          <div class="panel-card p-3 h-100">
            <div class="d-flex align-items-center gap-2 mb-3">
              <i class="bi bi-credit-card-2-front text-success"></i>
              <span class="text-white fw-semibold">Payment Details</span>
            </div>
            <div class="detail-line">
              <span class="text-muted">Method</span>
              <strong class="text-light">{{ payout.paymentMethod }}</strong>
            </div>
            <div class="detail-line" v-if="payout.bankName">
              <span class="text-muted">Bank Account</span>
              <strong class="text-light">{{ payout.bankName }} <small class="text-muted">{{ payout.bankAccountNumber || "" }}</small></strong>
            </div>
            <div class="detail-line">
              <span class="text-muted">Account Info</span>
              <strong class="text-light">{{ payout.accountInfo || "—" }}</strong>
            </div>
            <div class="detail-line">
              <span class="text-muted">Reference No</span>
              <strong class="text-light font-monospace">{{ payout.referenceNo || "—" }}</strong>
            </div>
            <div class="detail-line">
              <span class="text-muted">SMS Status</span>
              <span v-if="payout.smsStatus === 'SENT'" class="badge badge-success">Sent</span>
              <span v-else-if="payout.smsStatus === 'FAILED'" class="badge badge-danger" :title="payout.smsResponse || ''">Failed</span>
              <span v-else class="badge badge-secondary">Skipped / N/A</span>
            </div>
            <div class="detail-line" v-if="payout.notes">
              <span class="text-muted">Notes</span>
              <strong class="text-light">{{ payout.notes }}</strong>
            </div>
          </div>
        </div>

        <!-- Ledger snapshot (staff only) -->
        <div v-if="payout.payoutType === 'staff'" class="col-12">
          <div class="panel-card p-3">
            <div class="d-flex align-items-center gap-2 mb-3">
              <i class="bi bi-journal-text text-warning"></i>
              <span class="text-white fw-semibold">Ledger Snapshot at Payment</span>
            </div>
            <div class="row g-3">
              <div class="col-6 col-md-3">
                <div class="mini-stat">
                  <div class="text-muted stat-label">Current Bill</div>
                  <div class="mini-val text-white">{{ formatBdt(payout.currentBillSnapshot) }} Tk</div>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="mini-stat">
                  <div class="text-muted stat-label">Previous Due</div>
                  <div class="mini-val text-danger">{{ formatBdt(payout.previousDueSnapshot) }} Tk</div>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="mini-stat">
                  <div class="text-muted stat-label">Total Payable</div>
                  <div class="mini-val text-info">{{ formatBdt(totalPayable) }} Tk</div>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="mini-stat">
                  <div class="text-muted stat-label">Closing Due</div>
                  <div class="mini-val" :class="Number(payout.closingDueSnapshot) > 0 ? 'text-danger' : 'text-muted'">
                    {{ formatBdt(payout.closingDueSnapshot) }} Tk
                  </div>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="mini-stat">
                  <div class="text-muted stat-label">Advance Booked</div>
                  <div class="mini-val text-warning">{{ formatBdt(payout.advanceSnapshot) }} Tk</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Print footer -->
      <div class="d-none d-print-block text-center text-secondary small mt-4 pt-3 border-top">
        Generated by IDP — {{ new Date().toLocaleString() }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.payout-view-page {
  width: 100%;
}

.panel-card {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 10px;
}

.amount-banner {
  background: linear-gradient(180deg, #192434 0%, #1e2227 100%);
  border: 1px solid #2b4d7d;
  border-radius: 10px;
  padding: 18px 22px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.amount-value {
  font-size: 2rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.detail-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #282d34;
  font-size: 0.9rem;
}

.detail-line:last-child {
  border-bottom: none;
}

.mini-stat {
  background: #181b1f;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 10px 12px;
  height: 100%;
}

.mini-val {
  font-size: 1.15rem;
  font-weight: 800;
}

.badge-staff {
  background: rgba(13, 110, 253, 0.15);
  color: #6ea8fe;
  border: 1px solid rgba(13, 110, 253, 0.35);
}

.badge-expense {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.35);
}

.badge-success {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.35);
}

.badge-danger {
  background: rgba(220, 53, 69, 0.15);
  color: #f16e7b;
  border: 1px solid rgba(220, 53, 69, 0.35);
}

.badge-secondary {
  background: rgba(108, 117, 125, 0.15);
  color: #adb5bd;
  border: 1px solid rgba(108, 117, 125, 0.35);
}
</style>
