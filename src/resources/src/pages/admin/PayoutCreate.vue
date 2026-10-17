<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import MonthNavigator from "@/components/MonthNavigator.vue";
import IdpSelect from "@/components/common/IdpSelect.vue";
import { usePayoutsApi, formatBdt, formatMonth, currentMonthValue, type StaffLedgerPreview } from "@/composables/usePayoutsApi";
import { useToast } from "@/composables/useToast";
import { useAuth } from "@/composables/useAuth";

const router = useRouter();
const route = useRoute();
const toast = useToast();
const { can } = useAuth();

const { meta, fetchMeta, fetchStaffLedger, createPayout, saving } = usePayoutsApi();

const payoutType = ref<"staff" | "general_expense">("staff");

const queryStaffId = route.query.userId ? Number(route.query.userId) : null;
const queryMonth = typeof route.query.month === "string" && route.query.month ? route.query.month : currentMonthValue();

const form = ref({
  userId: queryStaffId as number | null,
  expenseHeadId: null as number | null,
  bankAccountId: null as number | null,
  periodMonth: queryMonth,
  amount: 0 as number,
  paymentMethod: "BKASH",
  accountInfo: "",
  referenceNo: "",
  paidAt: new Date().toISOString().slice(0, 10),
  notes: ""
});

const ledger = ref<StaffLedgerPreview | null>(null);
const ledgerLoading = ref(false);

const staffOptions = computed(() =>
  meta.value.staff.map((s) => ({
    value: s.id,
    label: s.roleName ? `${s.name} — ${s.roleName}` : s.name
  }))
);
const expenseHeadOptions = computed(() =>
  meta.value.expenseHeads.map((h) => ({
    value: h.id,
    label: h.category ? `${h.name} (${h.category})` : h.name
  }))
);
const bankOptions = computed(() => [
  { value: null as number | null, label: "— No bank account —" },
  ...meta.value.bankAccounts.map((b) => ({
    value: b.id,
    label: b.accountNumber ? `${b.bankName} — ${b.accountNumber}` : b.bankName
  }))
]);
const methodOptions = [
  { value: "BKASH", label: "bKash" },
  { value: "BANK", label: "Bank Transfer" },
  { value: "CASH", label: "Cash" }
];

const loadLedger = async () => {
  if (payoutType.value !== "staff" || !form.value.userId) {
    ledger.value = null;
    return;
  }
  ledgerLoading.value = true;
  try {
    ledger.value = await fetchStaffLedger(Number(form.value.userId), form.value.periodMonth);
  } catch {
    ledger.value = null;
  } finally {
    ledgerLoading.value = false;
  }
};

watch([() => form.value.userId, () => form.value.periodMonth, payoutType], loadLedger);

// What the ledger will look like AFTER this payment — mirrors the server math.
const preview = computed(() => {
  if (!ledger.value) return null;
  const amount = Number(form.value.amount) || 0;
  const totalPayable = ledger.value.totalPayable;
  const newPaid = Number((ledger.value.paidAmount + amount).toFixed(2));
  if (newPaid > totalPayable) {
    return { newPaid, closingDue: 0, advance: Number((newPaid - totalPayable).toFixed(2)) };
  }
  return { newPaid, closingDue: Number((totalPayable - newPaid).toFixed(2)), advance: 0 };
});

const payFull = () => {
  if (!ledger.value) return;
  const remaining = ledger.value.totalPayable - ledger.value.paidAmount;
  form.value.amount = Number(Math.max(remaining, 0).toFixed(2));
};

const setAmount = (val: number) => {
  form.value.amount = Math.max(0, Number(val.toFixed(2)));
};

const addAmount = (addition: number) => {
  const current = Number(form.value.amount) || 0;
  form.value.amount = Math.max(0, Number((current + addition).toFixed(2)));
};

const remainingDue = computed(() => {
  if (!ledger.value) return 0;
  return Math.max(0, Number((ledger.value.totalPayable - ledger.value.paidAmount).toFixed(2)));
});

const onMethodChange = (value: string | number | null) => {
  form.value.paymentMethod = String(value);
  if (form.value.paymentMethod !== "BANK") form.value.bankAccountId = null;
};

const onBankChange = (value: string | number | null) => {
  form.value.bankAccountId = value === null || value === "" ? null : Number(value);
  if (form.value.bankAccountId && !form.value.accountInfo.trim()) {
    const bank = meta.value.bankAccounts.find((b) => b.id === form.value.bankAccountId);
    if (bank) {
      form.value.accountInfo = bank.accountNumber ? `${bank.bankName} - ${bank.accountNumber}` : bank.bankName;
    }
  }
};

const submit = async () => {
  if (!can("payouts.create")) {
    toast.error("You do not have permission to record payouts");
    return;
  }
  const amount = Number(form.value.amount) || 0;
  if (amount <= 0) {
    toast.error("Enter an amount greater than zero");
    return;
  }

  const payload: Record<string, any> = {
    payoutType: payoutType.value,
    amount,
    paymentMethod: form.value.paymentMethod,
    bankAccountId: form.value.bankAccountId || undefined,
    accountInfo: form.value.accountInfo.trim() || undefined,
    referenceNo: form.value.referenceNo.trim() || undefined,
    paidAt: form.value.paidAt ? new Date(form.value.paidAt).toISOString() : undefined,
    notes: form.value.notes.trim() || undefined
  };

  if (payoutType.value === "staff") {
    if (!form.value.userId) {
      toast.error("Select a staff member");
      return;
    }
    payload.userId = form.value.userId;
    payload.periodMonth = form.value.periodMonth;
  } else {
    if (!form.value.expenseHeadId) {
      toast.error("Select an expense head");
      return;
    }
    payload.expenseHeadId = form.value.expenseHeadId;
    payload.periodMonth = form.value.periodMonth;
  }

  try {
    const res = await createPayout(payload);
    const created = res?.data;
    toast.success(payoutType.value === "staff" ? "Payout recorded successfully" : "Expense recorded successfully");
    if (created?.id) {
      router.push(`/admin/payouts/${created.id}`);
    } else {
      router.push("/admin/payouts");
    }
  } catch (err: any) {
    toast.error(err?.response?.data?.message || "Failed to record payout");
  }
};

onMounted(async () => {
  try {
    await fetchMeta();
    if (form.value.userId) {
      await loadLedger();
      payFull();
    }
  } catch {
    toast.error("Failed to load payout metadata");
  }
});
</script>

<template>
  <div class="payout-create-page py-2">
    <!-- Header -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/admin/payouts" class="breadcrumb-back small">
            <i class="bi bi-arrow-left me-1"></i> Back to Payouts
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">New Entry</span>
        </div>
        <h4 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <span class="header-icon-box"><i class="bi bi-cash-coin"></i></span>
          <span>Record Payout &amp; Expense</span>
        </h4>
        <span class="text-muted small">Settle staff accruals or book corporate operational expenses</span>
      </div>
    </div>

    <div class="row g-4">
      <!-- Left Column: Interactive Form -->
      <div class="col-12 col-xl-7">
        <!-- Segmented Type Selector -->
        <div class="category-segment-card p-2 mb-3">
          <div class="category-toggle-grid">
            <button
              type="button"
              class="cat-option"
              :class="{ 'cat-option-active': payoutType === 'staff' }"
              @click="payoutType = 'staff'"
            >
              <div class="cat-icon"><i class="bi bi-person-badge"></i></div>
              <div class="cat-details">
                <div class="cat-title">Staff Payout</div>
                <div class="cat-sub">Commission, salary &amp; allowances</div>
              </div>
              <i v-if="payoutType === 'staff'" class="bi bi-check-circle-fill cat-active-check"></i>
            </button>
            <button
              type="button"
              class="cat-option"
              :class="{ 'cat-option-active': payoutType === 'general_expense' }"
              @click="payoutType = 'general_expense'"
            >
              <div class="cat-icon cat-icon-expense"><i class="bi bi-receipt"></i></div>
              <div class="cat-details">
                <div class="cat-title">Firm Expense</div>
                <div class="cat-sub">Rent, utility, software &amp; ops</div>
              </div>
              <i v-if="payoutType === 'general_expense'" class="bi bi-check-circle-fill cat-active-check"></i>
            </button>
          </div>
        </div>

        <!-- Main Form Panel -->
        <div class="panel-card p-3 p-md-4 mb-3">
          <!-- Staff Selection Fields -->
          <template v-if="payoutType === 'staff'">
            <div class="row g-3 mb-3">
              <div class="col-12 col-md-7">
                <label class="field-label required">Staff Member</label>
                <IdpSelect
                  v-model="form.userId"
                  :options="staffOptions"
                  placeholder="Search and select staff member..."
                  width="100%"
                />
              </div>
              <div class="col-12 col-md-5">
                <label class="field-label required">Payout Month</label>
                <MonthNavigator v-model="form.periodMonth" />
              </div>
            </div>
          </template>

          <!-- General Expense Fields -->
          <template v-else>
            <div class="row g-3 mb-3">
              <div class="col-12 col-md-7">
                <label class="field-label required">Expense Head</label>
                <IdpSelect
                  v-model="form.expenseHeadId"
                  :options="expenseHeadOptions"
                  placeholder="Select expense head category..."
                  width="100%"
                />
              </div>
              <div class="col-12 col-md-5">
                <label class="field-label required">Period Month</label>
                <MonthNavigator v-model="form.periodMonth" />
              </div>
            </div>
          </template>

          <!-- Amount Input Section with Quick Chips -->
          <div class="amount-hero-box p-3 mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <label class="field-label mb-0 text-white">Amount (BDT / Tk)</label>
              <span v-if="payoutType === 'staff' && ledger" class="small text-muted">
                Net Outstanding: <strong class="text-danger">{{ formatBdt(remainingDue) }} Tk</strong>
              </span>
            </div>
            
            <div class="amount-input-group mb-2">
              <span class="currency-tag">Tk</span>
              <input
                v-model.number="form.amount"
                type="number"
                min="0"
                step="0.01"
                class="amount-display-input"
                placeholder="0.00"
              />
              <button
                v-if="payoutType === 'staff' && ledger && remainingDue > 0"
                type="button"
                class="btn btn-pay-full btn-sm"
                title="Fill full net due amount"
                @click="payFull"
              >
                <i class="bi bi-lightning-charge-fill me-1 text-warning"></i> Pay Full
              </button>
            </div>

            <!-- Quick Amount Chips for Ease of Entry -->
            <div class="d-flex flex-wrap align-items-center gap-2 pt-1">
              <span class="quick-chip-label"><i class="bi bi-magic me-1"></i>Quick fill:</span>
              <button
                v-if="payoutType === 'staff' && remainingDue > 0"
                type="button"
                class="chip-btn chip-highlight"
                @click="setAmount(remainingDue)"
              >
                Due ({{ formatBdt(remainingDue) }})
              </button>
              <button type="button" class="chip-btn" @click="setAmount(1000)">1,000</button>
              <button type="button" class="chip-btn" @click="setAmount(5000)">5,000</button>
              <button type="button" class="chip-btn" @click="setAmount(10000)">10,000</button>
              <button type="button" class="chip-btn" @click="addAmount(500)">+500</button>
              <button type="button" class="chip-btn" @click="addAmount(1000)">+1,000</button>
              <button type="button" class="chip-btn chip-reset" @click="setAmount(0)">Clear</button>
            </div>
          </div>

          <!-- Payment Method and Financial Details -->
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label class="field-label required">Payment Method</label>
              <IdpSelect
                :model-value="form.paymentMethod"
                :options="methodOptions"
                width="100%"
                @update:model-value="onMethodChange"
              />
            </div>

            <div v-if="form.paymentMethod === 'BANK'" class="col-12 col-md-6">
              <label class="field-label required">Source Bank Account</label>
              <IdpSelect
                :model-value="form.bankAccountId"
                :options="bankOptions"
                width="100%"
                @update:model-value="onBankChange"
              />
            </div>

            <div class="col-12 col-md-6">
              <label class="field-label">Account Info / Mobile Number</label>
              <div class="input-with-icon">
                <i class="bi bi-credit-card input-prefix-icon"></i>
                <input
                  v-model="form.accountInfo"
                  type="text"
                  class="form-control-custom"
                  placeholder="e.g. 017XXXXXXXX or A/C 1234..."
                />
              </div>
            </div>

            <div class="col-12 col-md-6">
              <label class="field-label">Transaction / Ref No</label>
              <div class="input-with-icon">
                <i class="bi bi-hash input-prefix-icon"></i>
                <input
                  v-model="form.referenceNo"
                  type="text"
                  class="form-control-custom"
                  placeholder="e.g. TrxID / Cheque #"
                />
              </div>
            </div>

            <div class="col-12 col-md-6">
              <label class="field-label required">Payment Date</label>
              <div class="input-with-icon">
                <i class="bi bi-calendar3 input-prefix-icon"></i>
                <input v-model="form.paidAt" type="date" class="form-control-custom" />
              </div>
            </div>

            <div class="col-12">
              <label class="field-label">Notes &amp; Internal Remarks</label>
              <textarea
                v-model="form.notes"
                rows="2"
                class="form-control-custom notes-textarea"
                placeholder="Optional remarks, payout purpose or vouchers..."
              ></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Premium Live Receipt & Ledger Slip -->
      <div class="col-12 col-xl-5">
        <div class="receipt-slip-container sticky-panel">
          <!-- Top Receipt Header Header -->
          <div class="receipt-header">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-2">
                <span class="receipt-badge"><i class="bi bi-receipt-cutoff"></i></span>
                <div>
                  <h6 class="mb-0 text-white fw-bold">Live Settlement Slip</h6>
                  <span class="receipt-subtitle">Real-time ledger projection</span>
                </div>
              </div>
              <span v-if="ledgerLoading" class="spinner-border spinner-border-sm text-info"></span>
            </div>
          </div>

          <!-- Receipt Body -->
          <div class="receipt-body p-3 p-md-4">
            <!-- Staff Receipt State -->
            <template v-if="payoutType === 'staff'">
              <div v-if="!form.userId" class="receipt-empty-state text-center py-5">
                <div class="empty-icon-wrap mb-2">
                  <i class="bi bi-person-bounding-box text-secondary"></i>
                </div>
                <h6 class="text-white mb-1">Select Staff Member</h6>
                <p class="text-muted small mb-0">Choose a staff to compute accrued returns and net due</p>
              </div>

              <template v-else-if="ledger">
                <!-- Beneficiary Card -->
                <div class="beneficiary-card mb-3 p-3">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="text-muted small">Beneficiary</span>
                    <span class="badge badge-period">{{ formatMonth(ledger.month) }}</span>
                  </div>
                  <div class="fw-bold text-white fs-6">
                    {{ meta.staff.find((s) => s.id === form.userId)?.name || 'Staff' }}
                  </div>
                  <div class="text-muted small">
                    {{ meta.staff.find((s) => s.id === form.userId)?.roleName || 'Sub-User' }}
                  </div>
                </div>

                <!-- Itemized Breakdown -->
                <div class="breakdown-list mb-3">
                  <div class="slip-row">
                    <span class="slip-label">Current Bill Accrued</span>
                    <span class="slip-value text-white">{{ formatBdt(ledger.currentBill) }} Tk</span>
                  </div>
                  <div class="slip-sub-row">
                    <span class="slip-sub-label">
                      <i class="bi bi-arrow-return-right me-1 text-secondary"></i>Returns Filed
                    </span>
                    <span class="slip-sub-value">
                      <span class="badge badge-zero me-1">Z {{ ledger.zeroCount }}</span>
                      <span class="badge badge-regular">R {{ ledger.regularCount }}</span>
                    </span>
                  </div>

                  <div v-if="ledger.previousDue > 0" class="slip-row">
                    <span class="slip-label text-danger">Previous Due Carried</span>
                    <span class="slip-value text-danger">+ {{ formatBdt(ledger.previousDue) }} Tk</span>
                  </div>

                  <div v-if="ledger.previousAdvance > 0" class="slip-row">
                    <span class="slip-label text-warning">Previous Advance Adjusted</span>
                    <span class="slip-value text-warning">- {{ formatBdt(ledger.previousAdvance) }} Tk</span>
                  </div>

                  <div class="slip-row slip-highlight">
                    <span class="slip-label fw-bold text-white">Gross Payable</span>
                    <span class="slip-value fw-bold text-white">{{ formatBdt(ledger.totalPayable) }} Tk</span>
                  </div>

                  <div class="slip-row">
                    <span class="slip-label text-muted">Already Paid (this month)</span>
                    <span class="slip-value text-success">- {{ formatBdt(ledger.paidAmount) }} Tk</span>
                  </div>
                </div>

                <div class="receipt-tear-line"></div>

                <!-- Payment Impact Projection -->
                <div class="projection-box p-3 my-3">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="text-muted small fw-semibold">Paying Now</span>
                    <span class="text-info fw-bold fs-6">{{ formatBdt(form.amount) }} Tk</span>
                  </div>

                  <div v-if="preview" class="d-flex justify-content-between align-items-center pt-2 border-top border-secondary">
                    <span class="small" :class="preview.closingDue > 0 ? 'text-danger' : 'text-success'">
                      <i class="bi" :class="preview.closingDue > 0 ? 'bi-exclamation-circle' : 'bi-check-circle'"></i>
                      {{ preview.closingDue > 0 ? 'Remaining Net Due:' : 'Status After Payment:' }}
                    </span>
                    <span class="fw-bold" :class="preview.closingDue > 0 ? 'text-danger' : 'text-success'">
                      {{ preview.closingDue > 0 ? `${formatBdt(preview.closingDue)} Tk` : 'Fully Settled' }}
                    </span>
                  </div>

                  <div v-if="preview && preview.advance > 0" class="d-flex justify-content-between align-items-center pt-2 text-warning small">
                    <span><i class="bi bi-wallet2 me-1"></i>Advance Carryforward:</span>
                    <strong>+ {{ formatBdt(preview.advance) }} Tk</strong>
                  </div>
                </div>
              </template>
            </template>

            <!-- Firm Expense Receipt State -->
            <template v-else>
              <div class="beneficiary-card mb-3 p-3">
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <span class="text-muted small">Expense Head</span>
                  <span class="badge badge-period">{{ formatMonth(form.periodMonth) }}</span>
                </div>
                <div class="fw-bold text-white fs-6">
                  {{ meta.expenseHeads.find((h) => h.id === form.expenseHeadId)?.name || 'Select Expense Head' }}
                </div>
                <div class="text-muted small">
                  {{ meta.expenseHeads.find((h) => h.id === form.expenseHeadId)?.category || 'Operational Account' }}
                </div>
              </div>

              <div class="projection-box p-3 my-3">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small fw-semibold">Total Expense Amount</span>
                  <span class="text-white fw-bold fs-5">{{ formatBdt(form.amount) }} Tk</span>
                </div>
              </div>
            </template>

            <!-- Action Buttons -->
            <div class="pt-2">
              <button
                type="button"
                class="btn btn-primary btn-submit-payout w-100 py-2 d-flex align-items-center justify-content-center gap-2 shadow"
                :disabled="saving"
                @click="submit"
              >
                <span v-if="saving" class="spinner-border spinner-border-sm"></span>
                <i v-else class="bi bi-shield-check fs-5"></i>
                <span class="fw-bold">{{ saving ? "Processing..." : (payoutType === 'staff' ? "Confirm & Record Payout" : "Book Firm Expense") }}</span>
              </button>
              
              <router-link
                to="/admin/payouts"
                class="btn btn-outline-secondary w-100 mt-2 py-2 text-light text-decoration-none d-flex align-items-center justify-content-center gap-1 small"
              >
                <i class="bi bi-x-circle"></i> Discard &amp; Return
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.payout-create-page {
  width: 100%;
}

.breadcrumb-back {
  color: #94a3b8;
  text-decoration: none;
  transition: color 0.15s ease;
}
.breadcrumb-back:hover {
  color: #38bdf8;
}

.header-icon-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
  font-size: 1.2rem;
}

/* Category segmented card */
.category-segment-card {
  background: #181d24;
  border: 1px solid #28313e;
  border-radius: 12px;
}

.category-toggle-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.cat-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  background: #11151b;
  border: 1px solid #242c38;
  color: #94a3b8;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cat-option:hover {
  background: #151b23;
  border-color: #384556;
  color: #e2e8f0;
}

.cat-option-active {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(15, 23, 42, 0.7) 100%);
  border-color: #0284c7;
  color: #f8fafc;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.18);
}

.cat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
  font-size: 1.3rem;
  flex-shrink: 0;
}

.cat-icon-expense {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.cat-title {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.2;
}

.cat-sub {
  font-size: 0.76rem;
  color: #64748b;
  margin-top: 2px;
}

.cat-active-check {
  margin-left: auto;
  color: #38bdf8;
  font-size: 1.1rem;
}

/* Panel card */
.panel-card {
  background: #14181f;
  border: 1px solid #252e3b;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.field-label {
  display: block;
  font-size: 0.76rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.field-label.required::after {
  content: " *";
  color: #f43f5e;
}

/* Amount Hero Box */
.amount-hero-box {
  background: #0f1318;
  border: 1px solid #2c3644;
  border-radius: 10px;
}

.amount-input-group {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-tag {
  position: absolute;
  left: 14px;
  font-weight: 700;
  color: #64748b;
  font-size: 1.1rem;
  pointer-events: none;
}

.amount-display-input {
  width: 100%;
  height: 52px;
  padding: 0 110px 0 48px;
  background: #090c0f;
  border: 1.5px solid #334155;
  border-radius: 8px;
  color: #38bdf8;
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  transition: all 0.2s ease;
}

.amount-display-input:focus {
  outline: none;
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
}

.btn-pay-full {
  position: absolute;
  right: 10px;
  background: rgba(14, 165, 233, 0.2);
  border: 1px solid rgba(14, 165, 233, 0.5);
  color: #e0f2fe;
  font-weight: 600;
  font-size: 0.8rem;
  padding: 6px 12px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.btn-pay-full:hover {
  background: #0284c7;
  color: #fff;
}

.quick-chip-label {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.chip-btn {
  background: #181f28;
  border: 1px solid #2a3544;
  color: #cbd5e1;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip-btn:hover {
  background: #232c39;
  border-color: #475569;
  color: #fff;
}

.chip-highlight {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}
.chip-highlight:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #fff;
}

.chip-reset {
  color: #94a3b8;
}

/* Custom form inputs with icons */
.input-with-icon {
  position: relative;
  display: flex;
  align-items: center;
}

.input-prefix-icon {
  position: absolute;
  left: 12px;
  color: #64748b;
  font-size: 0.95rem;
  pointer-events: none;
}

.form-control-custom {
  width: 100%;
  height: 40px;
  padding: 0 12px 0 38px;
  background: #0d1117;
  border: 1px solid #283342;
  border-radius: 7px;
  color: #f1f5f9;
  font-size: 0.88rem;
  transition: all 0.2s ease;
}

.form-control-custom:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
}

.notes-textarea {
  height: auto !important;
  padding: 10px 12px !important;
}

/* Right Side: Receipt Slip */
.receipt-slip-container {
  background: #14181f;
  border: 1px solid #2b3543;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.sticky-panel {
  position: sticky;
  top: 16px;
}

.receipt-header {
  padding: 14px 18px;
  background: linear-gradient(135deg, #18202b 0%, #11151c 100%);
  border-bottom: 1px solid #252f3d;
}

.receipt-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
  font-size: 1.1rem;
}

.receipt-subtitle {
  font-size: 0.72rem;
  color: #64748b;
  display: block;
}

.beneficiary-card {
  background: #0c1015;
  border: 1px solid #202834;
  border-radius: 10px;
}

.badge-period {
  background: #1e293b;
  color: #94a3b8;
  font-size: 0.72rem;
  padding: 4px 8px;
  font-weight: 600;
  border-radius: 6px;
}

.breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.86rem;
}

.slip-sub-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  padding-left: 8px;
  color: #64748b;
}

.slip-highlight {
  padding: 8px 0;
  border-top: 1px dashed #2d3748;
  border-bottom: 1px dashed #2d3748;
  margin: 4px 0;
}

.receipt-tear-line {
  position: relative;
  height: 1px;
  background: repeating-linear-gradient(90deg, #334155, #334155 6px, transparent 6px, transparent 12px);
  margin: 14px 0;
}

.projection-box {
  background: #0d1218;
  border: 1px solid #232c3a;
  border-radius: 10px;
}

.btn-submit-payout {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  letter-spacing: 0.3px;
  transition: all 0.2s ease;
}

.btn-submit-payout:hover:not(:disabled) {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(14, 165, 233, 0.35);
}

.badge-zero {
  background: rgba(234, 179, 8, 0.15);
  color: #facc15;
  border: 1px solid rgba(234, 179, 8, 0.3);
  font-size: 0.72rem;
  font-weight: 600;
}

.badge-regular {
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(14, 165, 233, 0.3);
  font-size: 0.72rem;
  font-weight: 600;
}
</style>

