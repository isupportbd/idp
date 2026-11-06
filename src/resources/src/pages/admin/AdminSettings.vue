<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { can } from "@/composables/useAuth";
import { type CompanySettings, useFirmApi } from "@/composables/useFirmApi";
import { useServicesApi } from "@/composables/useServicesApi";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";
import BankAccountsTab from "./settings/BankAccountsTab.vue";
import ClientReferencesTab from "./settings/ClientReferencesTab.vue";
import ExpenseHeadsTab from "./settings/ExpenseHeadsTab.vue";
// Sub-components for tabs
import FirmProfileTab from "./settings/FirmProfileTab.vue";
import InvoiceSettingsTab from "./settings/InvoiceSettingsTab.vue";
import RulesSmsTab from "./settings/RulesSmsTab.vue";
import ServiceItemsTab from "./settings/ServiceItemsTab.vue";
import ServiceRatesTab from "./settings/ServiceRatesTab.vue";

// Sub-users without settings.edit see every tab in read-only mode
const canEditSettings = computed(() => can("settings.edit"));

const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();

const { company, bankAccounts, expenseHeads, fetchCompanySettings, updateCompanySettings, fetchBankAccounts, fetchExpenseHeads } =
  useFirmApi();

const {
  customerTypes,
  references,
  serviceItems,
  serviceRates,
  serviceUnits,
  fetchCustomerTypes,
  fetchReferences,
  fetchServiceItems,
  fetchServiceRates,
  fetchServiceUnits
} = useServicesApi();

// Working form model for Company Profile / Statutory / Invoice Branding
const form = ref<CompanySettings>({ ...company.value });

const validTabs = ["profile", "invoice", "bank", "items", "rates", "expenses", "references", "rules"] as const;
type TabType = (typeof validTabs)[number];

const getInitialTab = (): TabType => {
  const queryTab = route.query.tab as string;
  if (queryTab && validTabs.includes(queryTab as TabType)) {
    return queryTab as TabType;
  }
  const savedTab = localStorage.getItem("admin_settings_active_tab") as string;
  if (savedTab && validTabs.includes(savedTab as TabType)) {
    return savedTab as TabType;
  }
  return "profile";
};

const activeTab = ref<TabType>(getInitialTab());

watch(activeTab, (newTab) => {
  localStorage.setItem("admin_settings_active_tab", newTab);
  if (route.query.tab !== newTab) {
    router.replace({ query: { ...route.query, tab: newTab } });
  }
});

watch(
  () => route.query.tab,
  (queryTab) => {
    if (queryTab && validTabs.includes(queryTab as TabType) && activeTab.value !== queryTab) {
      activeTab.value = queryTab as TabType;
    }
  }
);

const showResetModal = ref(false);

const syncFormFromCompany = () => {
  form.value = { ...company.value };
};

const handleResetToDefault = async () => {
  try {
    const userName = (authStore.user as any)?.name || "";
    const userEmail = (authStore.user as any)?.email || "";
    const userPhone = (authStore.user as any)?.mobile || "";
    form.value = {
      companyName: userName,
      proprietorName: userName,
      phone: userPhone,
      email: userEmail,
      website: "",
      address: "",
      binNumber: "",
      tinNumber: "",
      tradeLicenseNo: "",
      bkashNumber: "",
      nagadNumber: "",
      rocketNumber: "",
      invoicePrefix: "INV",
      startingInvoiceNumber: 1001,
      currentInvoiceSequence: 1001,
      receiptPrefix: "MR",
      startingReceiptNumber: 5001,
      currentReceiptSequence: 5001,
      currency: "BDT (৳)",
      decimalPlaces: 2,
      invoiceTerms:
        "1. Payment is due within 15 days of invoice date.\n2. Please mention the invoice number as reference in payment.\n3. Checks/Transfers are subject to realization.",
      invoiceFooterText: "",
      receiptFooterText: "This is a computer-generated money receipt and does not require a physical signature.",
      autoDueCarryForward: true,
      binUniqueEnforcement: true,
      allowDuplicateMobile: true,
      allowNegativeBalance: false,
      smsApiKey: "",
      smsSenderId: "",
      smsProvider: "",
      smsEndpointUrl: "",
      smsOnBill: true,
      smsOnCollection: true,
      smsOnSubmission: true,
      autoDueReminder: false,
      dueReminderDays: 7,
      dueReminderMinAmount: 1000,
      services: [],
      expenseHeads: []
    };
    await updateCompanySettings(form.value);
    toast.success("Settings restored to defaults");
    showResetModal.value = false;
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to reset settings");
  }
};

onMounted(async () => {
  await Promise.all([
    fetchCompanySettings(),
    fetchBankAccounts(),
    fetchExpenseHeads(),
    fetchCustomerTypes(),
    fetchReferences(),
    fetchServiceItems(),
    fetchServiceRates(),
    fetchServiceUnits()
  ]);
  form.value = { ...company.value };
});
</script>

<template>
  <div class="py-2">
    <!-- Header & Breadcrumbs -->
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">Firm Settings</span>
        </div>
        <h4 class="text-white fw-bold mb-0">Firm & Organization Settings</h4>
      </div>
    </div>

    <!-- Tabs Navigation Bar -->
    <div class="settings-tabs-wrapper mb-4">
      <ul class="nav nav-pills gap-2 flex-nowrap overflow-auto py-1">
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'profile' }"
            @click="activeTab = 'profile'"
          >
            <i class="bi bi-building me-1"></i> Firm Profile
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'invoice' }"
            @click="activeTab = 'invoice'"
          >
            <i class="bi bi-file-earmark-text me-1"></i> Invoices & Receipts
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'bank' }"
            @click="activeTab = 'bank'"
          >
            <i class="bi bi-bank me-1"></i> Bank Accounts
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'items' }"
            @click="activeTab = 'items'"
          >
            <i class="bi bi-briefcase me-1"></i> Service Items
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'rates' }"
            @click="activeTab = 'rates'"
          >
            <i class="bi bi-tag me-1"></i> Service Rates
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'expenses' }"
            @click="activeTab = 'expenses'"
          >
            <i class="bi bi-cash-coin me-1"></i> Expense Heads
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'references' }"
            @click="activeTab = 'references'"
          >
            <i class="bi bi-people me-1"></i> Client References
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link text-nowrap"
            :class="{ active: activeTab === 'rules' }"
            @click="activeTab = 'rules'"
          >
            <i class="bi bi-sliders me-1"></i> Rules & SMS
          </button>
        </li>
      </ul>
    </div>

    <div v-if="!canEditSettings" class="alert alert-warning py-2 small mb-3">
      <i class="bi bi-lock-fill me-1"></i>
      Read-only access: you can view firm settings but cannot change them.
    </div>

    <!-- Active Tab Components -->
    <FirmProfileTab
      v-if="activeTab === 'profile'"
      :form="form"
      :can-edit="canEditSettings"
      @saved="syncFormFromCompany"
    />

    <InvoiceSettingsTab
      v-if="activeTab === 'invoice'"
      :form="form"
      :can-edit="canEditSettings"
      @saved="syncFormFromCompany"
    />

    <BankAccountsTab
      v-if="activeTab === 'bank'"
      :bank-accounts="bankAccounts"
      :default-account-name="form.companyName"
      :default-phone="form.phone ?? undefined"
      :can-edit="canEditSettings"
      @refresh="fetchBankAccounts"
    />

    <ServiceItemsTab
      v-if="activeTab === 'items'"
      :service-items="serviceItems"
      :can-edit="canEditSettings"
      @refresh="fetchServiceItems"
    />

    <ServiceRatesTab
      v-if="activeTab === 'rates'"
      :service-rates="serviceRates"
      :service-items="serviceItems"
      :customer-types="customerTypes"
      :service-units="serviceUnits"
      :can-edit="canEditSettings"
      @refresh="fetchServiceRates"
    />

    <ExpenseHeadsTab
      v-if="activeTab === 'expenses'"
      :expense-heads="expenseHeads"
      :can-edit="canEditSettings"
      @refresh="fetchExpenseHeads"
    />

    <ClientReferencesTab
      v-if="activeTab === 'references'"
      :references="references"
      :can-edit="canEditSettings"
      @refresh="fetchReferences"
    />

    <RulesSmsTab
      v-if="activeTab === 'rules'"
      :form="form"
      :can-edit="canEditSettings"
      @saved="syncFormFromCompany"
    />

    <!-- Reset Confirmation Modal -->
    <div
      v-if="showResetModal"
      class="modal fade show d-block"
      tabindex="-1"
      style="background: rgba(0, 0, 0, 0.75);"
    >
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content idp-card text-center p-4">
          <i class="bi bi-exclamation-triangle text-warning fs-1 mb-2"></i>
          <h5 class="text-white fw-bold">Reset Settings?</h5>
          <p class="text-muted small">
            This will restore all firm profile fields, branding texts, service rates, and expense heads back to the system defaults.
          </p>
          <div class="d-flex justify-content-center gap-2 mt-3">
            <button type="button" class="btn btn-idp-secondary btn-sm px-3" @click="showResetModal = false">Cancel</button>
            <button type="button" class="btn btn-danger btn-sm px-3" @click="handleResetToDefault">Reset All</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-settings-container {
  width: 100%;
  padding-bottom: 2.5rem;
}

.settings-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #f8f9fa;
  margin: 0 0 0.25rem;
  letter-spacing: -0.3px;
}

.settings-subtitle {
  font-size: 0.86rem;
  color: #adb5bd;
  margin: 0;
}

.settings-tabs-wrapper {
  border-bottom: 1px solid #343a40;
  padding-bottom: 0.5rem;
}

.settings-tabs-wrapper .nav-link {
  color: #adb5bd;
  background: #212529;
  border: 1px solid #343a40;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.45rem 0.95rem;
  transition: all 0.15s ease;
}

.settings-tabs-wrapper .nav-link:hover {
  color: #fff;
  background: #2c3238;
}

.settings-tabs-wrapper .nav-link.active {
  color: #fff;
  background: #0d6efd;
  border-color: #0d6efd;
}

:deep(.idp-card) {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
}

:deep(.idp-input) {
  background-color: #15181c !important;
  border: 1px solid #3a4149 !important;
  color: #f8f9fa !important;
  border-radius: 6px;
}

:deep(.idp-input:focus) {
  border-color: #0d6efd !important;
  box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25) !important;
}

:deep(.btn-idp-secondary) {
  background-color: #343a40;
  color: #f8f9fa;
  border: 1px solid #495057;
}

:deep(.btn-idp-secondary:hover) {
  background-color: #495057;
  color: #fff;
}

:deep(.cursor-pointer) {
  cursor: pointer;
}

/* ── Integrated Search Box ───────────────────────────── */
:deep(.search-box) {
  display: flex;
  align-items: center;
}

:deep(.search-icon) {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #6c757d;
  pointer-events: none;
  font-size: 0.82rem;
}

:deep(.idp-search-input) {
  background-color: #15181c !important;
  border: 1px solid #3a4149 !important;
  color: #f8f9fa !important;
  padding-left: 36px !important;
  padding-right: 32px !important;
  border-radius: 6px;
  font-size: 0.85rem;
  height: 36px;
}

:deep(.idp-search-input:focus) {
  border-color: #0d6efd !important;
  box-shadow: 0 0 0 0.15rem rgba(13, 110, 253, 0.25) !important;
}

:deep(.clear-btn) {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #6c757d;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 0.95rem;
}

:deep(.clear-btn:hover) {
  color: #f8f9fa;
}

/* ── Modern Dark Table & Card Styles ─────────────────── */
:deep(.table-card) {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.table-custom) {
  width: 100%;
  border-collapse: collapse;
}

:deep(.table-custom thead tr) {
  background: #16191d;
  border-bottom: 1px solid #343a40;
}

:deep(.table-custom th) {
  padding: 12px 16px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #adb5bd;
  text-align: left;
  border-bottom: 1px solid #343a40;
}

:deep(.table-custom td) {
  padding: 13px 16px;
  font-size: 0.85rem;
  border-bottom: 1px solid #282d34;
  vertical-align: middle;
  color: #e2e8f0;
}

:deep(.table-custom tbody tr:hover td) {
  background: #252a30;
}

:deep(.table-custom tbody tr:last-child td) {
  border-bottom: none;
}

/* ── Status Badges ───────────────────────────────────── */
:deep(.badge-btn) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.73rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

:deep(.badge-active) {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.35);
}

:deep(.badge-active:hover) {
  background: rgba(25, 135, 84, 0.25);
}

:deep(.badge-inactive) {
  background: rgba(108, 117, 125, 0.15);
  color: #adb5bd;
  border: 1px solid rgba(108, 117, 125, 0.35);
}

:deep(.badge-inactive:hover) {
  background: rgba(108, 117, 125, 0.25);
}

:deep(.dot) {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* ── Action Buttons ──────────────────────────────────── */
:deep(.action-btn) {
  width: 30px;
  height: 30px;
  border-radius: 5px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

:deep(.btn-edit) {
  background: rgba(59, 142, 237, 0.12);
  color: #3b8eed;
  border: 1px solid rgba(59, 142, 237, 0.3);
}

:deep(.btn-edit:hover) {
  background: rgba(59, 142, 237, 0.25);
  color: #60a5fa;
}

:deep(.btn-del) {
  background: rgba(220, 53, 69, 0.12);
  color: #ea868f;
  border: 1px solid rgba(220, 53, 69, 0.28);
}

:deep(.btn-del:hover) {
  background: rgba(220, 53, 69, 0.25);
  color: #f87171;
}

:deep(.idp-input:disabled),
:deep(.form-select.idp-input:disabled) {
  background-color: rgba(18, 21, 26, 0.65) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #94a3b8 !important;
  cursor: not-allowed;
  opacity: 0.82;
}

:deep(.form-check-input:disabled) {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
