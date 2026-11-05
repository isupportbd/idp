<script setup lang="ts">
export interface PendingRecharge {
  id: number;
  userId: number;
  userName?: string;
  userEmail?: string;
  userMobile?: string;
  type?: string;
  grossAmount?: number;
  paidAmount?: number;
  gatewayCharge?: number;
  netAmount?: number;
  trxId?: string;
  createdAt?: string;
  [key: string]: any;
}

defineProps<{
  pendingRecharges: PendingRecharge[];
  isSubmittingAction: boolean;
}>();

const emit = defineEmits<{
  "approve": [id: number];
  "reject": [id: number];
}>();

const extractRawTrxId = (trx: string | null | undefined): string => {
  if (!trx) return "—";
  if (trx.includes("::")) {
    const parts = trx.split("::");
    return parts[parts.length - 1];
  }
  return trx;
};
</script>

<template>
  <div v-if="pendingRecharges.length > 0" class="table-card p-4 mb-4 border-info shadow-lg">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="text-info fw-bold mb-0 d-flex align-items-center gap-2">
        <i class="bi bi-wallet2 fs-5"></i> Pending Recharges & Storage Requests (bKash TrxID Verification)
      </h6>
      <span class="badge bg-info text-dark px-3 py-1.5 fw-bold rounded-pill">
        {{ pendingRecharges.length }} Awaiting Verification
      </span>
    </div>

    <div class="table-responsive">
      <table class="table-custom mb-0">
        <thead>
          <tr>
            <th>Tenant / Request Type</th>
            <th>Contact Info</th>
            <th>Amount Sent (Gross)</th>
            <th>bKash Fee & Net Credit</th>
            <th>bKash Trx ID</th>
            <th>Submission Date</th>
            <th class="text-end">Verification Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in pendingRecharges" :key="r.id">
            <td>
              <div class="d-flex align-items-center gap-2">
                <div class="fw-bold text-white fs-6">{{ r.userName || 'Tenant' }}</div>
                <span
                  v-if="r.type === 'storage_addon'"
                  class="badge text-white px-2 py-0.5"
                  style="font-size: 0.68rem; background-color: #7952b3 !important;"
                >
                  <i class="bi bi-hdd-network me-1"></i>Extra Storage
                </span>
                <span
                  v-else
                  class="badge bg-info text-dark px-2 py-0.5"
                  style="font-size: 0.68rem;"
                >
                  <i class="bi bi-wallet2 me-1"></i>Recharge
                </span>
              </div>
              <span class="badge bg-secondary bg-opacity-25 text-light border border-secondary" style="font-size: 0.7rem;">
                Tenant ID: #{{ r.userId }}
              </span>
            </td>
            <td>
              <div class="text-light small">{{ r.userEmail }}</div>
              <div class="text-muted small font-monospace">{{ r.userMobile || 'No mobile' }}</div>
            </td>
            <td>
              <span class="text-white fw-bold font-monospace fs-6">
                ৳ {{ (r.grossAmount || r.paidAmount || 0).toLocaleString() }}
              </span>
            </td>
            <td>
              <div class="d-flex flex-column gap-0.5">
                <span class="text-muted small" style="font-size: 0.74rem;">
                  bKash Fee: <strong class="text-danger">-৳{{ r.gatewayCharge || 0 }}</strong>
                </span>
                <span class="text-success fw-bold font-monospace fs-6">
                  Net Credit: +৳{{ (r.netAmount || ((r.grossAmount || r.paidAmount || 0) - (r.gatewayCharge || 0))).toLocaleString() }}
                </span>
              </div>
            </td>
            <td>
              <span class="badge bg-dark border border-secondary font-monospace text-light fs-6 px-2 py-1">
                {{ extractRawTrxId(r.trxId) }}
              </span>
            </td>
            <td>
              <div class="text-light font-monospace small">
                {{ r.createdAt ? r.createdAt.slice(0, 10) : 'Just now' }}
              </div>
              <div class="text-muted small" style="font-size: 0.72rem;">
                {{ r.createdAt ? r.createdAt.slice(11, 16) : '' }}
              </div>
            </td>
            <td class="text-end">
              <div class="d-flex gap-2 justify-content-end align-items-center">
                <button
                  class="btn btn-sm btn-success d-inline-flex align-items-center gap-1"
                  title="Approve Recharge"
                  :disabled="isSubmittingAction"
                  @click="emit('approve', r.id)"
                >
                  <i class="bi bi-check-lg"></i>
                  <span>Approve & Credit</span>
                </button>
                <button
                  class="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                  title="Reject Recharge"
                  :disabled="isSubmittingAction"
                  @click="emit('reject', r.id)"
                >
                  <i class="bi bi-x-lg"></i>
                  <span>Reject</span>
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
</style>
