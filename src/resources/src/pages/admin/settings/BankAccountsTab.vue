<script setup lang="ts">
import { ref } from "vue";
import type { BankAccount } from "@/composables/useFirmApi";
import { useFirmApi } from "@/composables/useFirmApi";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  bankAccounts: BankAccount[];
  defaultAccountName?: string;
  defaultPhone?: string;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
}>();

const toast = useToast();
const { createBankAccount, updateBankAccount, deleteBankAccount } = useFirmApi();

const showBankModal = ref(false);
const isEditingBank = ref(false);
const bankForm = ref({
  id: 0,
  bankName: "",
  accountName: "",
  accountNumber: "",
  branchName: "",
  routingNumber: "",
  bkashNumber: "",
  nagadNumber: "",
  isDefault: false,
  isActive: true
});

const openAddBankModal = () => {
  isEditingBank.value = false;
  bankForm.value = {
    id: 0,
    bankName: "",
    accountName: props.defaultAccountName || "",
    accountNumber: "",
    branchName: "",
    routingNumber: "",
    bkashNumber: props.defaultPhone || "",
    nagadNumber: "",
    isDefault: props.bankAccounts.length === 0,
    isActive: true
  };
  showBankModal.value = true;
};

const openEditBankModal = (b: BankAccount) => {
  isEditingBank.value = true;
  bankForm.value = {
    id: b.id,
    bankName: b.bankName,
    accountName: b.accountName,
    accountNumber: b.accountNumber,
    branchName: b.branchName || "",
    routingNumber: b.routingNumber || "",
    bkashNumber: b.bkashNumber || "",
    nagadNumber: b.nagadNumber || "",
    isDefault: b.isDefault,
    isActive: b.isActive
  };
  showBankModal.value = true;
};

const saveBankAccount = async () => {
  if (!bankForm.value.bankName.trim() || !bankForm.value.accountNumber.trim()) {
    toast.error("Bank name and account number are required");
    return;
  }

  try {
    if (isEditingBank.value) {
      await updateBankAccount(bankForm.value.id, bankForm.value);
      toast.success("Bank account updated");
    } else {
      await createBankAccount(bankForm.value);
      toast.success("Bank account added");
    }
    showBankModal.value = false;
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to save bank account");
  }
};

const handleDeleteBankAccount = async (id: number) => {
  if (confirm("Are you sure you want to remove this bank account?")) {
    try {
      await deleteBankAccount(id);
      toast.info("Bank account removed");
      emit("refresh");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete bank account");
    }
  }
};
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <div class="table-card">
      <div class="d-flex flex-wrap justify-content-between align-items-center p-3 p-md-4 pb-3 gap-2 border-bottom border-secondary border-opacity-25">
        <div>
          <h6 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
            <i class="bi bi-bank2 text-primary"></i> Firm Bank & MFS Accounts
          </h6>
          <p class="text-muted small mb-0">
            Manage bank accounts, routing numbers, and mobile financial services (bKash/Nagad) for invoice payment instructions.
          </p>
        </div>

        <button
          v-if="canEdit"
          type="button"
          class="btn btn-primary btn-sm px-3 fw-semibold d-flex align-items-center gap-1 text-nowrap flex-shrink-0 shadow-sm"
          style="white-space: nowrap; height: 38px;"
          @click="openAddBankModal"
        >
          <i class="bi bi-plus-lg"></i> <span>Add Bank Account</span>
        </button>
      </div>

      <div class="table-responsive">
        <table class="table-custom">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Bank & Branch</th>
              <th>Account Title & Number</th>
              <th>MFS (bKash / Nagad)</th>
              <th style="width: 100px; text-align: center;">Default</th>
              <th v-if="canEdit" style="width: 100px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(b, idx) in bankAccounts" :key="b.id">
              <td class="text-muted">{{ idx + 1 }}</td>
              <td>
                <div class="fw-semibold text-white">{{ b.bankName }}</div>
                <div class="text-muted small">{{ b.branchName || 'Main Branch' }}</div>
                <div v-if="b.routingNumber" class="text-muted font-monospace" style="font-size: 0.75rem;">Routing: {{ b.routingNumber }}</div>
              </td>
              <td>
                <div class="font-monospace text-info fw-bold">{{ b.accountNumber }}</div>
                <div class="text-muted small">{{ b.accountName }}</div>
              </td>
              <td>
                <div v-if="b.bkashNumber" class="small" style="color: #e2136e;">
                  <strong>bKash:</strong> {{ b.bkashNumber }}
                </div>
                <div v-if="b.nagadNumber" class="text-warning small">
                  <strong>Nagad:</strong> {{ b.nagadNumber }}
                </div>
                <div v-if="!b.bkashNumber && !b.nagadNumber" class="text-muted small">—</div>
              </td>
              <td style="text-align: center;">
                <span v-if="b.isDefault" class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-50">
                  Primary
                </span>
                <span v-else class="text-muted small">—</span>
              </td>
              <td v-if="canEdit" style="text-align: right;">
                <div class="d-flex gap-1 justify-content-end">
                  <button class="action-btn btn-edit" title="Edit Bank Account" @click="openEditBankModal(b)">
                    <i class="bi bi-pencil-fill"></i>
                  </button>
                  <button class="action-btn btn-del" title="Delete Bank Account" @click="handleDeleteBankAccount(b.id)">
                    <i class="bi bi-trash3-fill"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="bankAccounts.length === 0">
              <td :colspan="canEdit ? 6 : 5" class="text-center py-5 text-muted">
                <div class="d-flex flex-column align-items-center gap-2">
                  <i class="bi bi-bank fs-2 text-secondary"></i>
                  <span>No bank accounts found in database. Click "Add Bank Account" to add one.</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add / Edit Bank Modal -->
    <div
      v-if="showBankModal"
      class="modal fade show d-block"
      tabindex="-1"
      style="background: rgba(0, 0, 0, 0.75);"
    >
      <div class="modal-dialog modal-dialog-centered" style="max-width: 500px;">
        <div class="modal-content idp-card shadow-lg border border-secondary border-opacity-25" style="border-radius: 12px;">
          <div class="modal-header border-0 pb-0 pt-4 px-4 d-flex justify-content-between align-items-start">
            <h5 class="modal-title text-white fw-bold mb-0">
              <i class="bi bi-bank text-primary me-2"></i> {{ isEditingBank ? 'Edit Bank Account' : 'Add Bank Account' }}
            </h5>
            <button type="button" class="btn-close btn-close-white" @click="showBankModal = false"></button>
          </div>
          <div class="modal-body px-4 py-3">
            <div class="row g-3 mb-3">
              <div class="col-12">
                <label class="form-label text-light small fw-medium mb-1">Bank Name <span class="text-danger">*</span></label>
                <input
                  v-model="bankForm.bankName"
                  type="text"
                  class="form-control idp-input"
                  placeholder="e.g. Dutch-Bangla Bank PLC"
                  required
                />
              </div>

              <div class="col-12">
                <label class="form-label text-light small fw-medium mb-1">Account Title / Name <span class="text-danger">*</span></label>
                <input
                  v-model="bankForm.accountName"
                  type="text"
                  class="form-control idp-input"
                  placeholder="e.g. Associates & Co. Consultancy"
                  required
                />
              </div>

              <div class="col-md-7">
                <label class="form-label text-light small fw-medium mb-1">Account Number <span class="text-danger">*</span></label>
                <input
                  v-model="bankForm.accountNumber"
                  type="text"
                  class="form-control idp-input font-monospace"
                  placeholder="115.120.987654"
                  required
                />
              </div>

              <div class="col-md-5">
                <label class="form-label text-light small fw-medium mb-1">Routing Number</label>
                <input
                  v-model="bankForm.routingNumber"
                  type="text"
                  class="form-control idp-input font-monospace"
                  placeholder="090271829"
                />
              </div>

              <div class="col-12">
                <label class="form-label text-light small fw-medium mb-1">Branch Name</label>
                <input
                  v-model="bankForm.branchName"
                  type="text"
                  class="form-control idp-input"
                  placeholder="e.g. Naya Paltan Branch, Dhaka"
                />
              </div>

              <div class="col-md-6">
                <label class="form-label text-light small fw-medium mb-1">bKash Account (Optional)</label>
                <input
                  v-model="bankForm.bkashNumber"
                  type="text"
                  class="form-control idp-input font-monospace"
                  placeholder="01819234567"
                />
              </div>

              <div class="col-md-6">
                <label class="form-label text-light small fw-medium mb-1">Nagad Account (Optional)</label>
                <input
                  v-model="bankForm.nagadNumber"
                  type="text"
                  class="form-control idp-input font-monospace"
                  placeholder="01711234567"
                />
              </div>
            </div>

            <div class="d-flex gap-4 pt-1">
              <div class="form-check form-switch">
                <input v-model="bankForm.isDefault" class="form-check-input" type="checkbox" id="bankDefaultCheck" />
                <label class="form-check-label text-light small" for="bankDefaultCheck">Primary / Default for Invoices</label>
              </div>
              <div class="form-check form-switch">
                <input v-model="bankForm.isActive" class="form-check-input" type="checkbox" id="bankActiveCheck" />
                <label class="form-check-label text-light small" for="bankActiveCheck">Active</label>
              </div>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0 pb-4 px-4 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-secondary btn-sm px-3 text-light" style="background-color: #1e293b; border: 1px solid #334155;" @click="showBankModal = false">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm px-4 fw-semibold" @click="saveBankAccount">
              Save Bank Account
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
