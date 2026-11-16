<script setup lang="ts">
import axios from "axios";
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import IdpSelect from "@/components/common/IdpSelect.vue";
import { useFirmApi } from "@/composables/useFirmApi";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { fetchBankAccounts, createBankAccount, updateBankAccount } = useFirmApi();

const isEditMode = ref(false);
const accountId = ref<number | null>(null);
const isLoading = ref(false);
const isSaving = ref(false);

const form = ref({
  bankName: "",
  accountName: "",
  accountNumber: "",
  branchName: "",
  routingNumber: "",
  bkashNumber: "",
  bkashType: "Send Money",
  nagadNumber: "",
  nagadType: "Send Money",
  isDefault: false,
  isActive: true
});

const mfsPaymentTypes = [
  "Send Money",
  "Cash Out",
  "Payment"
];

const loadAccountForEdit = async (id: number) => {
  isLoading.value = true;
  try {
    const res = await axios.get("/api/firm/bank-accounts");
    const accounts = res.data?.data || [];
    const found = accounts.find((a: any) => Number(a.id) === Number(id));
    if (found) {
      form.value = {
        bankName: found.bankName || "",
        accountName: found.accountName || "",
        accountNumber: found.accountNumber || "",
        branchName: found.branchName || "",
        routingNumber: found.routingNumber || "",
        bkashNumber: found.bkashNumber || "",
        bkashType: found.bkashType || "Send Money",
        nagadNumber: found.nagadNumber || "",
        nagadType: found.nagadType || "Send Money",
        isDefault: !!found.isDefault,
        isActive: found.isActive !== false
      };
    } else {
      toast.error("Bank account not found");
      router.push("/admin/settings?tab=bank");
    }
  } catch (err) {
    toast.error("Failed to load bank account details");
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  await fetchPaymentMethods();
  if (route.params.id) {
    isEditMode.value = true;
    accountId.value = Number(route.params.id);
    await loadAccountForEdit(accountId.value);
  }
});

const handleSave = async () => {
  if (!form.value.bankName.trim() || !form.value.accountNumber.trim()) {
    toast.error("Bank Name and Account Number are required.");
    return;
  }

  isSaving.value = true;
  try {
    if (isEditMode.value && accountId.value) {
      await updateBankAccount(accountId.value, form.value);
      toast.success("Bank account updated successfully.");
    } else {
      await createBankAccount(form.value);
      toast.success("Bank account created successfully.");
    }
    router.push("/admin/settings?tab=bank");
  } catch (err: any) {
    toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to save bank account.");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="py-2">
    <!-- Breadcrumbs -->
    <div class="d-flex align-items-center gap-2 mb-2">
      <router-link to="/admin/settings?tab=bank" class="text-muted text-decoration-none small">
        <i class="bi bi-arrow-left me-1"></i> Bank Accounts
      </router-link>
      <span class="text-muted small">/</span>
      <span class="text-primary small fw-semibold">{{ isEditMode ? 'Edit Account' : 'Add Account' }}</span>
    </div>

    <!-- Header Title -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
      <div>
        <h4 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-bank2 text-primary"></i>
          <span>{{ isEditMode ? 'Edit Bank Account' : 'Add New Bank Account' }}</span>
        </h4>
        <p class="text-muted small mb-0">
          Configure organization bank credentials and mobile financial service accounts with customizable payment methods.
        </p>
      </div>

      <div class="d-flex align-items-center gap-2">
        <router-link to="/admin/settings?tab=bank" class="btn btn-outline-secondary btn-sm px-3">
          Cancel
        </router-link>
        <button
          type="button"
          class="btn btn-primary btn-sm px-4 fw-semibold shadow-sm d-flex align-items-center gap-2"
          :disabled="isSaving || isLoading"
          @click="handleSave"
        >
          <span v-if="isSaving" class="spinner-border spinner-border-sm"></span>
          <i v-else class="bi bi-check2-circle"></i>
          <span>{{ isEditMode ? 'Save Changes' : 'Create Bank Account' }}</span>
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
      <div class="text-muted small mt-2">Loading account details...</div>
    </div>

    <!-- Main Form Grid -->
    <div v-else class="row g-4 align-items-stretch">
      <!-- Left Column: Core Bank Information -->
      <div class="col-lg-7 d-flex flex-column">
        <div class="idp-card p-4 h-100 d-flex flex-column justify-content-between">
          <div>
            <h6 class="text-white fw-bold mb-3 border-bottom border-secondary border-opacity-25 pb-2 d-flex align-items-center gap-2">
              <i class="bi bi-bank text-info"></i>
              <span>Banking Details</span>
            </h6>

            <div class="row g-3">
              <div class="col-12">
                <label class="form-label text-light small fw-medium mb-1">
                  Bank Name <span class="text-danger">*</span>
                </label>
                <input
                  v-model="form.bankName"
                  type="text"
                  class="form-control idp-input"
                  placeholder="e.g. Dutch-Bangla Bank PLC, Pubali Bank PLC"
                  required
                />
              </div>

              <div class="col-12">
                <label class="form-label text-light small fw-medium mb-1">
                  Account Title / Name <span class="text-danger">*</span>
                </label>
                <input
                  v-model="form.accountName"
                  type="text"
                  class="form-control idp-input"
                  placeholder="e.g. Associates & Co. Consultancy"
                  required
                />
              </div>

              <div class="col-md-7">
                <label class="form-label text-light small fw-medium mb-1">
                  Account Number <span class="text-danger">*</span>
                </label>
                <input
                  v-model="form.accountNumber"
                  type="text"
                  class="form-control idp-input font-monospace"
                  placeholder="3487901003900"
                  required
                />
              </div>

              <div class="col-md-5">
                <label class="form-label text-light small fw-medium mb-1">Routing Number</label>
                <input
                  v-model="form.routingNumber"
                  type="text"
                  class="form-control idp-input font-monospace"
                  placeholder="090271829"
                />
              </div>

              <div class="col-12">
                <label class="form-label text-light small fw-medium mb-1">Branch Name</label>
                <input
                  v-model="form.branchName"
                  type="text"
                  class="form-control idp-input"
                  placeholder="e.g. Dargah Gate Islamic Branch, Sylhet"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: MFS & Account Status -->
      <div class="col-lg-5 d-flex flex-column">
        <div class="idp-card p-4 h-100 d-flex flex-column justify-content-between gap-3">
          <!-- Mobile Financial Services (bKash & Nagad) -->
          <div>
            <h6 class="text-white fw-bold mb-3 border-bottom border-secondary border-opacity-25 pb-2 d-flex align-items-center gap-2">
              <i class="bi bi-phone text-warning"></i>
              <span>Mobile Financial Services (MFS)</span>
            </h6>

            <div class="d-flex flex-column gap-3">
              <!-- bKash Configuration -->
              <div>
                <label class="form-label text-light small fw-medium mb-1 d-flex justify-content-between align-items-center">
                  <span style="color: #e2136e; font-weight: 700;"><i class="bi bi-wallet-fill me-1"></i> bKash Account</span>
                  <span class="text-muted" style="font-size: 0.72rem;">Optional</span>
                </label>
                <div class="d-flex gap-2">
                  <input
                    v-model="form.bkashNumber"
                    type="text"
                    class="form-control idp-input font-monospace flex-grow-1"
                    placeholder="01719950891"
                  />
                  <IdpSelect
                    v-model="form.bkashType"
                    :options="mfsPaymentTypes"
                    min-width="140px"
                    width="140px"
                  />
                </div>
              </div>

              <!-- Nagad Configuration -->
              <div>
                <label class="form-label text-light small fw-medium mb-1 d-flex justify-content-between align-items-center">
                  <span class="text-warning fw-bold"><i class="bi bi-cash-coin me-1"></i> Nagad Account</span>
                  <span class="text-muted" style="font-size: 0.72rem;">Optional</span>
                </label>
                <div class="d-flex gap-2">
                  <input
                    v-model="form.nagadNumber"
                    type="text"
                    class="form-control idp-input font-monospace flex-grow-1"
                    placeholder="01719950891"
                  />
                  <IdpSelect
                    v-model="form.nagadType"
                    :options="mfsPaymentTypes"
                    min-width="140px"
                    width="140px"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Preferences & Active Status -->
          <div class="pt-3 border-top border-secondary border-opacity-25">
            <h6 class="text-white fw-bold mb-3">
              Status & Invoice Defaults
            </h6>

            <div class="d-flex flex-wrap gap-4 align-items-center">
              <div class="form-check form-switch mb-0">
                <input v-model="form.isDefault" class="form-check-input" type="checkbox" id="defaultAccountCheck" />
                <label class="form-check-label text-light small fw-medium" for="defaultAccountCheck">
                  Primary / Default
                </label>
              </div>

              <div class="form-check form-switch mb-0">
                <input v-model="form.isActive" class="form-check-input" type="checkbox" id="activeAccountCheck" />
                <label class="form-check-label text-light small fw-medium" for="activeAccountCheck">
                  Active Status
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.idp-card {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 10px;
}

.idp-input {
  background-color: #14171a;
  border-color: #343a40;
  color: #fff;
}

.idp-input:focus {
  background-color: #161a1e;
  border-color: #0d6efd;
  color: #fff;
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.15);
}
</style>
