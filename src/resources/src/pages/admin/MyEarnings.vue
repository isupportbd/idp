<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MonthNavigator from "@/components/MonthNavigator.vue";
import { usePayoutsApi, formatBdt, formatMonth, currentMonthValue } from "@/composables/usePayoutsApi";
import { useToast } from "@/composables/useToast";

const toast = useToast();
const { myEarnings, loading, fetchMyEarnings } = usePayoutsApi();

const selectedMonth = ref<string>(currentMonthValue());

const data = computed(() => myEarnings.value);
const current = computed(() => data.value?.current ?? null);
const months = computed(() => data.value?.months ?? []);
const payouts = computed(() => data.value?.payouts ?? []);
const rateCard = computed(() => data.value?.rateCard ?? []);

// A month is only "Settled" when there was something to settle and it is now
// clear. Otherwise (0 bill, 0 due, no payments) it is simply inactive.
const currentHasActivity = computed(() => {
  const c = current.value;
  if (!c) return false;
  return (
    (c.totalPayable ?? 0) > 0 ||
    (c.paidAmount ?? 0) > 0 ||
    (c.zeroCount ?? 0) > 0 ||
    (c.regularCount ?? 0) > 0 ||
    (c.previousDue ?? 0) > 0 ||
    (c.previousAdvance ?? 0) > 0
  );
});
const currentSettled = computed(
  () =>
    currentHasActivity.value &&
    (current.value?.closingDue ?? 0) <= 0 &&
    (current.value?.advanceBalance ?? 0) <= 0
);

const load = async () => {
  try {
    await fetchMyEarnings(selectedMonth.value);
  } catch {
    toast.error("Failed to load your earnings");
  }
};

onMounted(load);
</script>

<template>
  <div class="earnings-page py-2">
    <!-- Header -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">My Earnings</span>
        </div>
        <h4 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-cash-coin text-success"></i> My Earnings
        </h4>
        <span class="text-muted small">Your monthly commissions, carried dues/advances and payment history</span>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm d-flex align-items-center gap-2 text-light px-3"
          :disabled="loading"
          @click="load"
        >
          <i class="bi bi-arrow-clockwise" :class="{ 'spinner-border spinner-border-sm': loading }"></i>
          <span>Refresh</span>
        </button>
        <div class="month-nav-container" style="width: 185px; flex-shrink: 0">
          <MonthNavigator v-model="selectedMonth" @change="load" />
        </div>
      </div>
    </div>

    <!-- Summary pills -->
    <div class="row g-3 mb-3">
      <div class="col-6 col-xl-3">
        <div class="stat-pill">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Current Bill</span>
            <i class="bi bi-journal-text text-primary"></i>
          </div>
          <div class="stat-val text-white">{{ formatBdt(current?.currentBill) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
          <div class="text-muted small mt-1">
            {{ current?.regularCount ?? 0 }} Regular · {{ current?.zeroCount ?? 0 }} Zero
          </div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="stat-pill">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Received</span>
            <i class="bi bi-cash text-success"></i>
          </div>
          <div class="stat-val text-success">{{ formatBdt(current?.paidAmount) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
          <div class="text-muted small">{{ current?.paymentCount ?? 0 }} payment(s)</div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="stat-pill">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Total Payable</span>
            <i class="bi bi-calculator text-info"></i>
          </div>
          <div class="stat-val text-info">{{ formatBdt(current?.totalPayable) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
          <div class="text-muted small">
            + Due {{ formatBdt(current?.previousDue) }} / − Adv {{ formatBdt(current?.previousAdvance) }}
          </div>
        </div>
      </div>
      <div class="col-6 col-xl-3">
        <div class="stat-pill">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Closing Balance</span>
            <i
              class="bi"
              :class="
                (current?.closingDue ?? 0) > 0
                  ? 'bi-exclamation-triangle text-danger'
                  : (current?.advanceBalance ?? 0) > 0
                    ? 'bi-wallet2 text-warning'
                    : currentSettled
                      ? 'bi-check-circle text-success'
                      : 'bi-dash-circle text-secondary'
              "
            ></i>
          </div>
          <div
            class="stat-val"
            :class="
              (current?.closingDue ?? 0) > 0
                ? 'text-danger'
                : (current?.advanceBalance ?? 0) > 0
                  ? 'text-warning'
                  : currentSettled
                    ? 'text-success'
                    : 'text-muted'
            "
          >
            <template v-if="(current?.closingDue ?? 0) > 0">{{ formatBdt(current?.closingDue) }} <span class="fs-6 fw-normal text-muted">Tk</span></template>
            <template v-else-if="(current?.advanceBalance ?? 0) > 0">{{ formatBdt(current?.advanceBalance) }} <span class="fs-6 fw-normal text-muted">Tk</span></template>
            <template v-else-if="currentSettled">Settled</template>
            <template v-else>—</template>
          </div>
          <div class="text-muted small">
            {{ (current?.closingDue ?? 0) > 0 ? "Payable to you" : (current?.advanceBalance ?? 0) > 0 ? "Advance carried" : currentSettled ? "All clear" : "No activity this month" }}
          </div>
        </div>
      </div>
    </div>

    <!-- Rate card -->
    <div class="table-card mb-3">
      <div class="table-title-bar px-3 py-2 d-flex align-items-center gap-2">
        <i class="bi bi-tags text-primary"></i>
        <span class="text-white fw-semibold">My Rate Card</span>
        <span class="text-muted small ms-auto">Per-filing commission</span>
      </div>
      <div class="p-3">
        <div class="row g-3">
          <div class="col-6 col-md-3">
            <div class="rate-chip">
              <span class="text-muted small">Zero VAT Rate</span>
              <span class="text-white fw-bold fs-5">{{ formatBdt(data?.zeroRate) }} <span class="fs-6 fw-normal text-muted">Tk</span></span>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="rate-chip">
              <span class="text-muted small">Regular VAT Rate</span>
              <span class="text-info fw-bold fs-5">{{ formatBdt(data?.regularRate) }} <span class="fs-6 fw-normal text-muted">Tk</span></span>
            </div>
          </div>
        </div>

        <div v-if="rateCard.length" class="mt-3">
          <div class="text-muted small mb-2">Item-specific overrides</div>
          <div class="d-flex flex-wrap gap-2">
            <span v-for="rate in rateCard" :key="rate.serviceItemId" class="rate-tag">
              <span class="text-light">{{ rate.itemName || `Item #${rate.serviceItemId}` }}</span>
              <span class="text-info fw-semibold ms-1">{{ formatBdt(rate.rate) }} <span class="fw-normal text-muted">Tk</span></span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Monthly history -->
    <div class="table-card mb-3">
      <div class="table-title-bar px-3 py-2 d-flex align-items-center gap-2">
        <i class="bi bi-calendar3 text-primary"></i>
        <span class="text-white fw-semibold">Monthly Account</span>
        <span class="text-muted small ms-auto">Total Payable = Current Bill + Previous Due − Previous Advance</span>
      </div>
      <div class="table-responsive">
        <table class="table-custom mb-0">
          <thead>
            <tr>
              <th>Month</th>
              <th class="text-center">Zero</th>
              <th class="text-center">Regular</th>
              <th class="text-end">Current Bill (Tk)</th>
              <th class="text-end">Received (Tk)</th>
              <th class="text-end">Payable (Tk)</th>
              <th class="text-end">Closing Due (Tk)</th>
              <th class="text-end">Advance (Tk)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in months" :key="row.month" :class="{ 'is-current': row.month === data?.month }">
              <td class="text-light fw-semibold">
                {{ formatMonth(row.month) }}
                <span v-if="row.month === data?.month" class="badge-current ms-1">Selected</span>
              </td>
              <td class="text-center text-muted">{{ row.zeroCount }}</td>
              <td class="text-center text-muted">{{ row.regularCount }}</td>
              <td class="text-end text-light">{{ formatBdt(row.currentBill) }}</td>
              <td class="text-end text-success">{{ formatBdt(row.paidAmount) }}</td>
              <td class="text-end text-info">{{ formatBdt(row.totalPayable) }}</td>
              <td class="text-end" :class="row.closingDue > 0 ? 'text-danger fw-semibold' : 'text-muted'">
                {{ formatBdt(row.closingDue) }}
              </td>
              <td class="text-end" :class="row.advanceBalance > 0 ? 'text-warning fw-semibold' : 'text-muted'">
                {{ formatBdt(row.advanceBalance) }}
              </td>
            </tr>
            <tr v-if="!months.length">
              <td colspan="8" class="text-center text-muted py-4">
                <i class="bi bi-inbox me-1"></i> No activity recorded yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Payment history -->
    <div class="table-card">
      <div class="table-title-bar px-3 py-2 d-flex align-items-center gap-2">
        <i class="bi bi-receipt text-primary"></i>
        <span class="text-white fw-semibold">Payment History</span>
        <span class="text-muted small ms-auto">{{ payouts.length }} record(s)</span>
      </div>
      <div class="table-responsive">
        <table class="table-custom mb-0">
          <thead>
            <tr>
              <th>Paid At</th>
              <th>Period</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Account</th>
              <th class="text-end">Amount (Tk)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in payouts" :key="p.id">
              <td class="text-light">{{ p.paidAt ? new Date(p.paidAt).toLocaleString() : "—" }}</td>
              <td class="text-muted">{{ p.periodMonth ? formatMonth(p.periodMonth) : "—" }}</td>
              <td class="text-muted text-capitalize">{{ (p.paymentMethod || "—").replace("_", " ") }}</td>
              <td class="text-muted">{{ p.referenceNo || "—" }}</td>
              <td class="text-muted">{{ p.accountInfo || "—" }}</td>
              <td class="text-end text-success fw-semibold">{{ formatBdt(p.amount) }}</td>
            </tr>
            <tr v-if="!payouts.length">
              <td colspan="6" class="text-center text-muted py-4">
                <i class="bi bi-wallet2 me-1"></i> No payments received yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.earnings-page {
  width: 100%;
}

.stat-pill {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 0.9rem 1.15rem;
  height: 100%;
}

.stat-pill:hover {
  background: #252a30;
}

.stat-label {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.stat-val {
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.2;
  word-break: break-all;
}

.table-card {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  overflow: hidden;
}

.table-title-bar {
  background: #16191d;
  border-bottom: 1px solid #343a40;
}

.table-custom {
  width: 100%;
  border-collapse: collapse;
}

.table-custom thead tr {
  background: #16191d;
  border-bottom: 1px solid #343a40;
}

.table-custom th {
  padding: 12px 14px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #8b949e;
  white-space: nowrap;
}

.table-custom td {
  padding: 11px 14px;
  font-size: 0.9rem;
  border-bottom: 1px solid #2b3138;
  vertical-align: middle;
}

.table-custom tbody tr:last-child td {
  border-bottom: none;
}

.table-custom tbody tr:hover {
  background: #23282e;
}

.table-custom tbody tr.is-current {
  background: rgba(13, 110, 253, 0.1);
}

.badge-current {
  background: rgba(13, 110, 253, 0.2);
  color: #6ea8fe;
  border: 1px solid rgba(13, 110, 253, 0.4);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
}

.rate-chip {
  background: #16191d;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  height: 100%;
}

.rate-tag {
  background: #16191d;
  border: 1px solid #343a40;
  border-radius: 999px;
  padding: 0.3rem 0.85rem;
  font-size: 0.82rem;
}
</style>
