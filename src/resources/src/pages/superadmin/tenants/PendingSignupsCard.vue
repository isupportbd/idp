<script setup lang="ts">
import type { PendingSignup } from "@/composables/useSuperAdminApi";

defineProps<{
  pendingSignups: PendingSignup[];
  isSubmittingAction: boolean;
}>();

const emit = defineEmits<{
  approve: [signup: PendingSignup];
  reject: [signup: PendingSignup];
}>();

const extractRawTrxId = (trx: string | null | undefined): string => {
  if (!trx) return "—";
  if (trx.includes("::")) {
    const parts = trx.split("::");
    return parts[parts.length - 1];
  }
  return trx;
};

const getBillingCycleText = (trxId: string | null | undefined, billingCycle?: string | null): string => {
  if (billingCycle) {
    return billingCycle.toLowerCase() === "yearly" ? "Yearly Subscription" : "Monthly Subscription";
  }
  if (!trxId) return "Monthly Subscription";
  if (trxId.includes("::yearly")) return "Yearly Subscription";
  return "Monthly Subscription";
};
</script>

<template>
  <div v-if="pendingSignups.length > 0" class="table-card p-4 mb-4 border-warning shadow-lg">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="text-warning fw-bold mb-0 d-flex align-items-center gap-2">
        <i class="bi bi-exclamation-diamond-fill fs-5"></i> Pending Registrations & bKash TrxID Approvals
      </h6>
      <span class="badge bg-warning text-dark px-3 py-1.5 fw-bold rounded-pill">
        {{ pendingSignups.length }} Awaiting Verification
      </span>
    </div>

    <div class="table-responsive">
      <table class="table-custom mb-0">
        <thead>
          <tr>
            <th>Organization / Name</th>
            <th>Contact Info</th>
            <th>Selected Plan</th>
            <th>Paid Amount</th>
            <th>bKash Trx ID</th>
            <th class="text-end">Verification Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pendingSignups" :key="p.id">
            <td>
              <div class="fw-bold text-white fs-6">{{ p.name }}</div>
              <div class="text-muted small">Registered: {{ p.createdAt ? p.createdAt.slice(0, 10) : 'Just now' }}</div>
            </td>
            <td>
              <div class="text-light small">{{ p.email }}</div>
              <div class="text-muted small font-monospace">{{ p.mobile || 'No mobile' }}</div>
            </td>
            <td>
              <div class="text-light fw-semibold">{{ p.planName }}</div>
              <div class="text-muted small">{{ getBillingCycleText(p.trxId, p.billingCycle) }}</div>
            </td>
            <td>
              <div class="d-flex flex-column gap-1">
                <div class="d-flex align-items-center gap-1.5">
                  <span class="text-white fw-bold font-monospace fs-6">
                    ৳ {{ (p.grossAmount || p.paidAmount || 0).toLocaleString() }}
                  </span>
                  <span class="text-muted small" style="font-size: 0.72rem;">
                    (Fee: -৳{{ p.gatewayCharge || 0 }})
                  </span>
                </div>
                <div class="text-info font-monospace small" style="font-size: 0.76rem;">
                  Net Wallet: <strong>৳{{ (p.netAmount || 0).toLocaleString() }}</strong> / Plan: ৳{{ (p.planPrice || p.requiredFee || 0).toLocaleString() }}
                </div>
                <div>
                  <span
                    v-if="p.willActivate"
                    class="badge bg-success text-white px-2 py-1 shadow-sm"
                    style="font-size: 0.75rem;"
                  >
                    <i class="bi bi-check-circle-fill me-1"></i>Activates Plan <span v-if="p.excessCredit && p.excessCredit > 0">(+৳{{ p.excessCredit }} Wallet)</span>
                  </span>
                  <span
                    v-else
                    class="badge bg-warning text-dark px-2 py-1 fw-bold shadow-sm"
                    style="font-size: 0.75rem;"
                  >
                    <i class="bi bi-exclamation-circle-fill me-1"></i>Shortage -৳{{ p.shortage }} (Needs Recharge)
                  </span>
                </div>
              </div>
            </td>
            <td>
              <div class="text-light font-monospace">{{ extractRawTrxId(p.trxId) }}</div>
            </td>
            <td class="text-end">
              <div class="d-flex gap-2 justify-content-end align-items-center">
                <button
                  class="btn btn-sm btn-success uniform-icon-btn d-inline-flex align-items-center justify-content-center"
                  title="Approve Registration"
                  :disabled="isSubmittingAction"
                  @click="emit('approve', p)"
                >
                  <i class="bi bi-check-lg fs-5"></i>
                </button>
                <button
                  class="btn btn-sm btn-outline-danger uniform-icon-btn d-inline-flex align-items-center justify-content-center"
                  title="Reject Registration"
                  :disabled="isSubmittingAction"
                  @click="emit('reject', p)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-card {
  background: #1f2329;
  border-radius: 8px;
}

.table-custom {
  width: 100%;
  border-collapse: collapse;
}

.table-custom thead th {
  background: #181b1f;
  color: #adb5bd;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #343a40;
  white-space: nowrap;
}

.table-custom tbody td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #2a3038;
  vertical-align: middle;
  white-space: nowrap;
}

.uniform-icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
}
</style>
