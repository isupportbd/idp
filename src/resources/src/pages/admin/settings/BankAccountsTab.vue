<script setup lang="ts">
import { useRouter } from "vue-router";
import type { BankAccount } from "@/composables/useFirmApi";
import { useFirmApi } from "@/composables/useFirmApi";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  bankAccounts: BankAccount[];
  defaultAccountName?: string;
  defaultPhone?: string;
  canEdit: boolean;
}>();

const emit = defineEmits<(e: "refresh") => void>();

const router = useRouter();
const toast = useToast();
const { deleteBankAccount } = useFirmApi();

const goToAddBankAccount = () => {
  router.push("/admin/settings/bank-accounts/create");
};

const goToEditBankAccount = (b: BankAccount) => {
  router.push(`/admin/settings/bank-accounts/${b.id}/edit`);
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
          @click="goToAddBankAccount"
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
                <div v-if="b.bkashNumber" class="small mb-1" style="color: #e2136e;">
                  <strong>bKash:</strong> {{ b.bkashNumber }}
                  <span class="badge bg-dark border border-secondary text-secondary ms-1" style="font-size: 0.68rem;">
                    {{ b.bkashType || 'Send Money' }}
                  </span>
                </div>
                <div v-if="b.nagadNumber" class="text-warning small">
                  <strong>Nagad:</strong> {{ b.nagadNumber }}
                  <span class="badge bg-dark border border-secondary text-secondary ms-1" style="font-size: 0.68rem;">
                    {{ b.nagadType || 'Send Money' }}
                  </span>
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
                  <button class="action-btn btn-edit" title="Edit Bank Account" @click="goToEditBankAccount(b)">
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
  </div>
</template>

<style scoped>
.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #343a40;
  background: transparent;
  color: #adb5bd;
  transition: all 0.2s ease;
  cursor: pointer;
}

.action-btn:hover {
  background: #2b3035;
}

.btn-edit:hover {
  color: #0d6efd;
  border-color: #0d6efd;
}

.btn-del:hover {
  color: #dc3545;
  border-color: #dc3545;
}
</style>
