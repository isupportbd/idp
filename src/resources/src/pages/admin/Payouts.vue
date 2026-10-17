<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import MonthNavigator from "@/components/MonthNavigator.vue";
import SearchInput from "@/components/common/SearchInput.vue";
import IdpSelect from "@/components/common/IdpSelect.vue";
import { usePayoutsApi, formatBdt, formatMonth, currentMonthValue } from "@/composables/usePayoutsApi";
import { useToast } from "@/composables/useToast";
import { can, useAuth } from "@/composables/useAuth";
import { pulse } from "@/plugins/pulse";

const toast = useToast();
const { user } = useAuth();

const { dashboard, payouts, meta, loading, fetchDashboard, fetchList, fetchMeta } = usePayoutsApi();

const selectedMonth = ref<string>(currentMonthValue());
const searchQuery = ref("");
const typeFilter = ref<string>("all");

// Interactive summary-card filter. Empty string = no card filter (show all staff).
type CardFilterKey = "net_due" | "advance" | "paid" | "expenses";
const activeCardFilter = ref<"" | CardFilterKey>("");

const typeOptions = [
  { value: "all", label: "All Types" },
  { value: "staff", label: "Staff Payouts" },
  { value: "general_expense", label: "General Expenses" }
];

const summary = computed(() => dashboard.value?.summary);
const staffRows = computed(() => dashboard.value?.staff || []);
const categories = computed(() => dashboard.value?.categories || []);
const monthPayouts = computed(() => payouts.value);

// Selected-month records, filtered live by the search box and the type dropdown.
// `payouts.value` already holds the full month from the server; filtering here
// keeps the view instant with no extra round-trips.
const filteredPayouts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return monthPayouts.value.filter((p) => {
    if (typeFilter.value !== "all" && p.payoutType !== typeFilter.value) return false;
    if (!q) return true;
    return [p.staffName, p.headName, p.referenceNo, p.paymentMethod, p.category, p.notes, p.accountInfo]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
});

// Section visibility driven by the type filter:
//   all             → staff earnings + expenses
//   staff           → staff earnings only
//   general_expense → expenses only (staff section hidden)
const showStaffSection = computed(() => typeFilter.value !== "general_expense");
const showExpenseSection = computed(() => typeFilter.value !== "staff");

const listTitle = computed(() => {
  if (typeFilter.value === "staff") return "Staff Payouts";
  if (typeFilter.value === "general_expense") return "General Expenses";
  return "Payouts & Expenses";
});

const emptyLabel = computed(() => {
  if (typeFilter.value === "staff") return "No staff payouts recorded";
  if (typeFilter.value === "general_expense") return "No general expenses recorded";
  return "No payouts or expenses recorded";
});

// Empty selection means "All Months" (the aggregate/lifetime view).
const monthLabel = computed(() => (selectedMonth.value ? formatMonth(selectedMonth.value) : "All Months"));

const staffFilterOptions = computed(() => [
  { value: "all", label: "All Staff" },
  ...meta.value.staff.map((s) => ({ value: s.id, label: s.name }))
]);
const selectedStaffId = ref<number | "all">("all");

const filteredStaffRows = computed(() => {
  let rows = staffRows.value;
  if (activeCardFilter.value === "net_due") {
    rows = rows.filter((s) => (s.closingDue || 0) > 0);
  } else if (activeCardFilter.value === "advance") {
    rows = rows.filter((s) => (s.advanceBalance || 0) > 0);
  } else if (activeCardFilter.value === "paid") {
    rows = rows.filter((s) => (s.paidAmount || 0) > 0);
  }
  if (selectedStaffId.value !== "all") {
    rows = rows.filter((s) => s.id === Number(selectedStaffId.value));
  }
  return rows;
});

// Summary cards are clickable filters. Clicking a card clears the lower toolbar
// filters so the two never conflict; clicking the active card again (or the
// reset cards) returns to "show all staff".
const applyCardFilter = (key: CardFilterKey | null) => {
  searchQuery.value = "";
  selectedStaffId.value = "all";

  if (!key || activeCardFilter.value === key) {
    activeCardFilter.value = "";
    typeFilter.value = "all";
    return;
  }

  activeCardFilter.value = key;
  typeFilter.value = key === "expenses" ? "general_expense" : "all";
};

// Keep the card highlight in sync when the type dropdown is changed manually.
watch(typeFilter, (val) => {
  if (val === "general_expense") {
    if (activeCardFilter.value && activeCardFilter.value !== "expenses") activeCardFilter.value = "";
  } else if (activeCardFilter.value === "expenses") {
    activeCardFilter.value = "";
  }
});

const hasActivity = computed(() => {
  return (
    (summary.value && (summary.value.totalEarned || summary.value.totalPaid || summary.value.generalExpenseTotal)) ||
    staffRows.value.some((s) => s.currentBill || s.paidAmount || s.closingDue) ||
    monthPayouts.value.length > 0
  );
});

const loadAll = async () => {
  try {
    await Promise.all([
      fetchDashboard(selectedMonth.value),
      fetchList({ month: selectedMonth.value }),
      meta.value.staff.length ? Promise.resolve() : fetchMeta()
    ]);
  } catch {
    toast.error("Failed to load payouts data");
  }
};

let refreshTimer: any = null;
const reloadQuiet = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(loadAll, 400);
};

const onMonthChange = () => {
  selectedStaffId.value = "all";
  loadAll();
};

const printReport = () => window.print();

onMounted(() => {
  loadAll();

  pulse.channel("auth").listen("payout:earning-accrued", (data: any) => {
    if (!data) return;
    if (data.userId && Number(data.userId) === Number(user.value?.id)) return; // ignore own filings
    if (data.taxPeriod && data.taxPeriod !== selectedMonth.value) return;
    toast.info(
      `${data.staffName || "Staff"} earned ${formatBdt(data.amount)} Tk (${data.classification === "regular" ? "Regular" : "Zero"} return) — month total ${formatBdt(data.monthTotalEarned)} Tk`,
      5000
    );
    reloadQuiet();
  });

  pulse.channel("auth").listen("payout:created", () => reloadQuiet());
  pulse.channel("auth").listen("payout:balance-updated", () => reloadQuiet());
  pulse.channel("auth").listen("payout:rates-updated", () => reloadQuiet());
});

onUnmounted(() => {
  clearTimeout(refreshTimer);
});
</script>

<template>
  <div class="payouts-page py-2">
    <!-- Header -->
    <div class="d-print-none d-flex flex-wrap justify-content-between align-items-center mb-3">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">Payouts</span>
        </div>
        <h4 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-cash-stack text-primary"></i> Payouts & Staff Earnings
        </h4>
        <span class="text-muted small">
          Live staff accruals, carried dues/advances and firm expense accounting
        </span>
      </div>

      <div class="d-flex align-items-center gap-2 mt-3 mt-md-0">
        <button
          type="button"
          class="btn btn-dark border-secondary btn-sm d-flex align-items-center gap-2 text-light px-3"
          title="Print Staff Ledger"
          @click="printReport"
        >
          <i class="bi bi-printer text-info"></i>
          <span>Print</span>
        </button>
        <router-link
          v-if="can('payouts.create')"
          to="/admin/payouts/create"
          class="btn btn-primary btn-sm d-flex align-items-center gap-2 px-3 fw-semibold shadow-sm"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Record Payout / Expense</span>
        </router-link>
      </div>
    </div>

    <!-- Summary Pills -->
    <div class="row g-3 mb-3 d-print-none">
      <div class="col-6 col-xl-2">
        <div
          class="stat-pill cursor-pointer"
          :class="{ 'stat-pill-active': activeCardFilter === '' }"
          title="Show all staff"
          @click="applyCardFilter(null)"
        >
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Accrued Bill</span>
            <i class="bi bi-journal-text text-primary"></i>
          </div>
          <div class="stat-val text-white">{{ formatBdt(summary?.totalEarned) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        </div>
      </div>
      <div class="col-6 col-xl-2">
        <div
          class="stat-pill cursor-pointer"
          :class="{ 'stat-pill-active': activeCardFilter === 'paid' }"
          title="Show staff who received payments this month"
          @click="applyCardFilter('paid')"
        >
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Paid (Staff)</span>
            <i class="bi bi-cash text-success"></i>
          </div>
          <div class="stat-val text-success">{{ formatBdt(summary?.totalPaid) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        </div>
      </div>
      <div class="col-6 col-xl-2">
        <div
          class="stat-pill cursor-pointer"
          :class="{ 'stat-pill-active': activeCardFilter === 'net_due' }"
          title="Show staff with unpaid dues"
          @click="applyCardFilter('net_due')"
        >
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Net Due</span>
            <i class="bi bi-exclamation-triangle text-danger"></i>
          </div>
          <div class="stat-val text-danger">{{ formatBdt(summary?.totalDue) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        </div>
      </div>
      <div class="col-6 col-xl-2">
        <div
          class="stat-pill cursor-pointer"
          :class="{ 'stat-pill-active': activeCardFilter === 'advance' }"
          title="Show staff with a carried advance balance"
          @click="applyCardFilter('advance')"
        >
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Advance</span>
            <i class="bi bi-wallet2 text-warning"></i>
          </div>
          <div class="stat-val text-warning">{{ formatBdt(summary?.totalAdvance) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        </div>
      </div>
      <div class="col-6 col-xl-2">
        <div
          class="stat-pill cursor-pointer"
          :class="{ 'stat-pill-active': activeCardFilter === 'expenses' }"
          title="Focus on firm general expenses"
          @click="applyCardFilter('expenses')"
        >
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Expenses</span>
            <i class="bi bi-receipt text-info"></i>
          </div>
          <div class="stat-val text-info">{{ formatBdt(summary?.generalExpenseTotal) }} <span class="fs-6 fw-normal text-muted">Tk</span></div>
        </div>
      </div>
      <div class="col-6 col-xl-2">
        <div
          class="stat-pill cursor-pointer"
          :class="{ 'stat-pill-active': activeCardFilter === '' }"
          title="Show all staff"
          @click="applyCardFilter(null)"
        >
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="text-muted stat-label">Staff</span>
            <i class="bi bi-people text-secondary"></i>
          </div>
          <div class="stat-val text-light">{{ summary?.staffCount ?? 0 }}</div>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="filter-panel px-3 py-2 mb-3 d-print-none d-flex align-items-center gap-2 flex-wrap">
      <SearchInput v-model="searchQuery" placeholder="Search staff, head, reference..." size="md" max-width="300px" min-width="190px" />
      <IdpSelect v-model="typeFilter" :options="typeOptions" min-width="170px" />
      <IdpSelect v-if="showStaffSection" v-model="selectedStaffId" :options="staffFilterOptions" min-width="170px" />
      <div class="month-nav-container ms-auto" style="width: 180px; flex-shrink: 0">
        <MonthNavigator v-model="selectedMonth" @change="onMonthChange" />
      </div>
      <button
        type="button"
        class="btn btn-dark border-secondary p-0 d-flex align-items-center justify-content-center text-light flex-shrink-0 refresh-icon-btn"
        title="Refresh"
        @click="loadAll()"
      >
        <i class="bi bi-arrow-clockwise" :class="{ 'spinner-border spinner-border-sm': loading }"></i>
      </button>
    </div>

    <!-- Printable header -->
    <div class="d-none d-print-block a4-print-header mb-4">
      <div class="d-flex justify-content-between align-items-start border-bottom pb-3">
        <div>
          <h3 class="fw-bold text-dark mb-1">Integrated VAT Data Processing Portal (IDP)</h3>
          <h5 class="text-secondary mb-0">Staff Payouts & Earnings Ledger — {{ monthLabel }}</h5>
        </div>
        <div class="text-end text-secondary small">
          <div><strong>Month:</strong> {{ selectedMonth || "All Months" }}</div>
          <div><strong>Generated:</strong> {{ new Date().toLocaleString() }}</div>
        </div>
      </div>
    </div>

    <!-- Staff Earnings -->
    <div v-if="showStaffSection" class="table-card shadow-sm mb-3">
      <div class="table-title-bar px-3 py-2 d-flex align-items-center gap-2">
        <i class="bi bi-people text-primary"></i>
        <span class="text-white fw-semibold">Staff Earnings &amp; Dues</span>
        <span class="text-muted small ms-auto">Total Payable = Current Bill + Previous Due − Previous Advance</span>
      </div>
      <table class="table-custom">
        <thead>
          <tr>
            <th>Staff Member</th>
            <th class="text-center">Returns</th>
            <th class="text-right">Accrued Bill (Tk)</th>
            <th class="text-right">Paid (Tk)</th>
            <th class="text-right">Total Payable (Tk)</th>
            <th class="text-right">Closing Due (Tk)</th>
            <th class="text-center">Status</th>
            <th class="text-center d-print-none">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && filteredStaffRows.length === 0">
            <td colspan="8" class="text-center py-4 text-muted">
              <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
              Loading staff ledger...
            </td>
          </tr>
          <tr v-else-if="filteredStaffRows.length === 0">
            <td colspan="8" class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              No staff members found for this firm.
            </td>
          </tr>
          <tr v-for="s in filteredStaffRows" :key="s.id">
            <td>
              <div class="fw-semibold text-white">{{ s.name }}</div>
              <div class="text-muted" style="font-size: 0.78rem">
                <i class="bi bi-person-badge me-1 text-secondary"></i>{{ s.role || "Staff" }}
                <span v-if="s.mobile" class="ms-2"><i class="bi bi-telephone me-1 text-secondary"></i>{{ s.mobile }}</span>
              </div>
            </td>
            <td class="text-center">
              <div class="d-inline-flex flex-column align-items-center gap-1">
                <span class="badge badge-zero" :title="`Zero returns × ${s.zeroRate ?? 0}`">
                  Z <strong>{{ s.zeroCount }}</strong>
                </span>
                <span class="badge badge-regular" :title="`Regular returns × ${s.regularRate ?? 0}`">
                  R <strong>{{ s.regularCount }}</strong>
                </span>
              </div>
            </td>
            <td class="text-right">{{ formatBdt(s.currentBill) }}</td>
            <td class="text-right text-success">{{ formatBdt(s.paidAmount) }}</td>
            <td class="text-right fw-semibold">{{ formatBdt(s.totalPayable) }}</td>
            <td class="text-right">
              <span v-if="s.closingDue > 0" class="text-danger fw-bold">{{ formatBdt(s.closingDue) }}</span>
              <span v-else class="text-muted">0.00</span>
            </td>
            <td class="text-center">
              <span v-if="s.closingDue > 0" class="badge-status badge-status-pending">
                <i class="bi bi-hourglass-split"></i> Due
              </span>
              <span v-else-if="s.advanceBalance > 0" class="badge-status badge-status-warning">
                <i class="bi bi-wallet2"></i> Advance {{ formatBdt(s.advanceBalance) }}
              </span>
              <span v-else-if="s.isSettled" class="badge-status badge-status-submitted">
                <i class="bi bi-check2-circle"></i> Settled
              </span>
              <span v-else class="badge-status badge-status-neutral" title="No returns filed and no payments this period">
                <i class="bi bi-dash-circle"></i> Not Settled
              </span>
            </td>
            <td class="text-center d-print-none">
              <router-link
                v-if="can('payouts.create')"
                :to="`/admin/payouts/create?userId=${s.id}${selectedMonth ? `&month=${selectedMonth}` : ''}`"
                class="btn btn-sm btn-primary py-1 px-3 d-inline-flex align-items-center gap-1 fw-semibold shadow-sm"
                title="Record payout for this staff"
              >
                <i class="bi bi-cash-stack"></i> Pay Now
              </router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Expense Categories -->
    <div v-if="showExpenseSection && categories.length" class="mb-3 d-print-none">
      <div class="d-flex align-items-center gap-2 mb-2">
        <i class="bi bi-diagram-3 text-info"></i>
        <span class="text-white fw-semibold">Expense Head Breakdown — {{ monthLabel }}</span>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <span v-for="c in categories" :key="c.category" class="category-chip">
          <span class="text-muted">{{ c.category || "Other" }}</span>
          <strong class="text-light ms-2">{{ formatBdt(c.amount) }} <span class="fw-normal text-muted">Tk</span></strong>
        </span>
      </div>
    </div>

    <!-- Recent Payouts / Expenses -->
    <div class="table-card shadow-sm">
      <div class="table-title-bar px-3 py-2 d-flex align-items-center gap-2">
        <i class="bi bi-receipt text-success"></i>
        <span class="text-white fw-semibold">{{ listTitle }} — {{ monthLabel }}</span>
        <span class="text-muted small ms-auto">{{ filteredPayouts.length }} record(s)</span>
      </div>
      <table class="table-custom">
        <thead>
          <tr>
            <th>Type</th>
            <th>Payee / Head</th>
            <th>Method &amp; Account</th>
            <th class="text-right">Amount (Tk)</th>
            <th>SMS</th>
            <th>Paid At</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && filteredPayouts.length === 0">
            <td colspan="7" class="text-center py-4 text-muted">
              <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
              Loading payouts...
            </td>
          </tr>
          <tr v-else-if="filteredPayouts.length === 0">
            <td colspan="7" class="text-center py-5 text-muted">
              <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
              {{ emptyLabel }} for {{ monthLabel }}.
            </td>
          </tr>
          <tr v-for="p in filteredPayouts" :key="p.id">
            <td>
              <span v-if="p.payoutType === 'staff'" class="badge badge-staff">Staff</span>
              <span v-else class="badge badge-expense">Expense</span>
            </td>
            <td>
              <div class="fw-semibold text-white">{{ p.staffName || p.headName || "—" }}</div>
              <div class="text-muted" style="font-size: 0.78rem">
                {{ p.category || (p.periodMonth ? formatMonth(p.periodMonth) : "—") }}
                <span v-if="p.referenceNo" class="ms-2 font-monospace"><i class="bi bi-hash me-1"></i>{{ p.referenceNo }}</span>
              </div>
            </td>
            <td>
              <div class="text-light">{{ p.paymentMethod }}</div>
              <div class="text-muted" style="font-size: 0.78rem">{{ p.accountInfo || "—" }}</div>
            </td>
            <td class="text-right fw-bold">{{ formatBdt(p.amount) }}</td>
            <td>
              <span v-if="p.smsStatus === 'SENT'" class="badge badge-success">Sent</span>
              <span v-else-if="p.smsStatus === 'FAILED'" class="badge badge-danger" :title="p.smsResponse || ''">Failed</span>
              <span v-else class="badge badge-secondary">Skipped</span>
            </td>
            <td class="text-muted">{{ new Date(p.paidAt).toLocaleDateString() }}</td>
            <td class="text-right">
              <router-link
                :to="`/admin/payouts/${p.id}`"
                class="btn-action-icon btn btn-outline-secondary btn-sm me-1"
                title="View payout"
              >
                <i class="bi bi-eye"></i>
              </router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !hasActivity" class="text-center text-muted py-4 d-print-none">
      <i class="bi bi-info-circle me-1"></i>
      Nothing has been accrued or paid in {{ formatMonth(selectedMonth) }} yet.
    </div>
  </div>
</template>

<style scoped>
.payouts-page {
  width: 100%;
}

.stat-pill {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 0.9rem 1.15rem;
  height: 100%;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.stat-pill:hover {
  background: #252a30;
}

.cursor-pointer {
  cursor: pointer;
}

.stat-pill-active {
  border-color: #0d6efd !important;
  background: #192434 !important;
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

.filter-panel {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
}

.month-nav-container {
  display: flex;
  align-items: center;
}

/* Icon-only refresh: matches the 38px height, 6px radius and 16px icon of the
   Month Navigator / IdpSelect controls so the whole toolbar aligns exactly. */
.refresh-icon-btn {
  width: 38px;
  height: 38px;
  box-sizing: border-box;
  padding: 0;
  line-height: 1;
  font-size: 1rem;
  border-radius: 6px;
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
  letter-spacing: 0.5px;
  color: #adb5bd;
  text-align: left;
  white-space: nowrap;
}

.table-custom td {
  padding: 13px 14px;
  font-size: 0.88rem;
  border-bottom: 1px solid #282d34;
  vertical-align: middle;
  color: #e2e8f0;
  white-space: nowrap;
}

.table-custom tbody tr:hover td {
  background: #252a30;
}

.table-custom th.text-right,
.table-custom td.text-right {
  text-align: right;
}

.badge-zero {
  background: rgba(255, 193, 7, 0.14);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.3);
  font-size: 0.78rem;
}

.badge-regular {
  background: rgba(13, 110, 253, 0.14);
  color: #6ea8fe;
  border: 1px solid rgba(13, 110, 253, 0.3);
  font-size: 0.78rem;
}

.badge-staff {
  background: rgba(13, 110, 253, 0.15);
  color: #6ea8fe;
  border: 1px solid rgba(13, 110, 253, 0.35);
  font-size: 0.78rem;
}

.badge-expense {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.35);
  font-size: 0.78rem;
}

.badge-success {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.35);
  font-size: 0.75rem;
}

.badge-danger {
  background: rgba(220, 53, 69, 0.15);
  color: #f16e7b;
  border: 1px solid rgba(220, 53, 69, 0.35);
  font-size: 0.75rem;
}

.badge-secondary {
  background: rgba(108, 117, 125, 0.15);
  color: #adb5bd;
  border: 1px solid rgba(108, 117, 125, 0.35);
  font-size: 0.75rem;
}

.category-chip {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 0.82rem;
  display: inline-flex;
  align-items: center;
}

.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.badge-status-submitted {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.35);
}

.badge-status-pending {
  background: rgba(220, 53, 69, 0.15);
  color: #f16e7b;
  border: 1px solid rgba(220, 53, 69, 0.35);
}

.badge-status-warning {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.35);
}

.badge-status-neutral {
  background: rgba(108, 117, 125, 0.15);
  color: #adb5bd;
  border: 1px solid rgba(108, 117, 125, 0.35);
}

.btn-action-icon {
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 0.85rem;
}

.a4-print-header {
  display: none;
}

@media print {
  .stat-pill,
  .category-chip {
    border-color: #ccc !important;
  }
}
</style>
