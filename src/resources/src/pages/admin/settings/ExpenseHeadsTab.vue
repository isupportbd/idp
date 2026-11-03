<script setup lang="ts">
import { ref, computed } from "vue";
import type { ExpenseHead } from "@/composables/useFirmApi";
import { useFirmApi } from "@/composables/useFirmApi";
import { useToast } from "@/composables/useToast";
import SearchInput from "@/components/common/SearchInput.vue";

const props = defineProps<{
  expenseHeads: ExpenseHead[];
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
}>();

const toast = useToast();
const {
  createExpenseHead,
  updateExpenseHead,
  toggleExpenseHead,
  deleteExpenseHead
} = useFirmApi();

const showExpenseModal = ref(false);
const isEditingExpense = ref(false);
const expenseForm = ref<ExpenseHead>({
  id: 0,
  name: "",
  code: "",
  category: "Operational",
  description: "",
  isActive: true
});

const expenseCategories = ["Operational", "Administrative", "Statutory & Fees", "Marketing", "Miscellaneous"] as const;
const expenseSearch = ref("");

const filteredExpenses = computed(() => {
  if (!expenseSearch.value.trim()) return props.expenseHeads;
  const q = expenseSearch.value.toLowerCase().trim();
  return props.expenseHeads.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      (e.code && e.code.toLowerCase().includes(q)) ||
      (e.category && e.category.toLowerCase().includes(q))
  );
});

const openAddExpenseModal = () => {
  isEditingExpense.value = false;
  const count = props.expenseHeads.length + 1;
  expenseForm.value = {
    id: 0,
    name: "",
    code: `EXP-${String(count).padStart(2, "0")}`,
    category: "Operational",
    description: "",
    isActive: true
  };
  showExpenseModal.value = true;
};

const openEditExpenseModal = (item: ExpenseHead) => {
  isEditingExpense.value = true;
  expenseForm.value = { ...item };
  showExpenseModal.value = true;
};

const saveExpenseHead = async () => {
  const trimmedName = expenseForm.value.name.trim();
  if (!trimmedName) {
    toast.error("Please enter an expense head name");
    return;
  }

  try {
    if (isEditingExpense.value) {
      await updateExpenseHead(expenseForm.value.id, {
        name: trimmedName,
        code: expenseForm.value.code?.trim() || null,
        category: expenseForm.value.category,
        description: expenseForm.value.description?.trim() || null,
        isActive: expenseForm.value.isActive
      });
      toast.success("Expense head updated");
    } else {
      await createExpenseHead({
        name: trimmedName,
        code: expenseForm.value.code?.trim() || null,
        category: expenseForm.value.category,
        description: expenseForm.value.description?.trim() || null,
        isActive: expenseForm.value.isActive
      });
      toast.success("Expense head created");
    }
    showExpenseModal.value = false;
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to save expense head");
  }
};

const handleToggleExpenseStatus = async (id: number) => {
  try {
    await toggleExpenseHead(id);
    toast.success("Status updated");
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to toggle status");
  }
};

const handleDeleteExpenseHead = async (id: number) => {
  if (confirm("Are you sure you want to remove this expense head?")) {
    try {
      await deleteExpenseHead(id);
      toast.info("Expense head removed");
      emit("refresh");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to remove expense head");
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
            <i class="bi bi-cash-coin text-warning"></i> Office Expense Heads
          </h6>
          <p class="text-muted small mb-0">
            Manage office operating expense heads, utility accounts, and statutory disbursement categories.
          </p>
        </div>

        <div class="d-flex align-items-center gap-2 flex-nowrap">
          <SearchInput
            v-model="expenseSearch"
            placeholder="Search expense heads..."
            max-width="240px"
          />
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-warning btn-sm px-3 fw-semibold text-dark d-flex align-items-center gap-1 text-nowrap flex-shrink-0 shadow-sm"
            style="white-space: nowrap; height: 38px;"
            @click="openAddExpenseModal"
          >
            <i class="bi bi-plus-lg"></i> <span>Add Expense Head</span>
          </button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table-custom">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th style="width: 100px;">Code</th>
              <th>Expense Head Name & Description</th>
              <th>Category</th>
              <th style="width: 120px; text-align: center;">Status</th>
              <th v-if="canEdit" style="width: 100px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(exp, idx) in filteredExpenses" :key="exp.id">
              <td class="text-muted">{{ idx + 1 }}</td>
              <td>
                <span class="font-monospace text-info small fw-bold">{{ exp.code || '—' }}</span>
              </td>
              <td>
                <div class="fw-semibold text-white">{{ exp.name }}</div>
                <div v-if="exp.description" class="text-muted small text-truncate" style="max-width: 400px;">
                  {{ exp.description }}
                </div>
              </td>
              <td>
                <span
                  class="badge"
                  :class="
                    exp.category === 'Operational' ? 'bg-primary' :
                    exp.category === 'Statutory & Fees' ? 'bg-danger' :
                    exp.category === 'Administrative' ? 'bg-info text-dark' : 'bg-secondary'
                  "
                >
                  {{ exp.category }}
                </span>
              </td>
              <td style="text-align: center;">
                <button
                  type="button"
                  class="badge-btn"
                  :class="exp.isActive ? 'badge-active' : 'badge-inactive'"
                  :disabled="!canEdit"
                  @click="handleToggleExpenseStatus(exp.id)"
                  title="Click to toggle status"
                >
                  <span class="dot"></span> {{ exp.isActive ? 'Active' : 'Inactive' }}
                </button>
              </td>
              <td v-if="canEdit" style="text-align: right;">
                <div class="d-flex gap-1 justify-content-end">
                  <button class="action-btn btn-edit" title="Edit Expense Head" @click="openEditExpenseModal(exp)">
                    <i class="bi bi-pencil-fill"></i>
                  </button>
                  <button class="action-btn btn-del" title="Delete Expense Head" @click="handleDeleteExpenseHead(exp.id)">
                    <i class="bi bi-trash3-fill"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredExpenses.length === 0">
              <td :colspan="canEdit ? 6 : 5" class="text-center py-5 text-muted">
                <div class="d-flex flex-column align-items-center gap-2">
                  <i class="bi bi-cash fs-2 text-secondary"></i>
                  <span>No expense heads found matching your search.</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/Edit Expense Modal -->
    <div
      v-if="showExpenseModal"
      class="modal fade show d-block"
      tabindex="-1"
      style="background: rgba(0, 0, 0, 0.75);"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content idp-card">
          <div class="modal-header">
            <h5 class="modal-title text-white">
              <i class="bi bi-cash-coin text-warning me-2"></i>
              {{ isEditingExpense ? 'Edit Expense Head' : 'Add New Expense Head' }}
            </h5>
            <button type="button" class="btn-close" @click="showExpenseModal = false"></button>
          </div>
          <div class="modal-body p-4">
            <div class="row g-3 mb-3">
              <div class="col-8">
                <label class="form-label text-light small fw-medium">Expense Head Name <span class="text-danger">*</span></label>
                <input
                  v-model="expenseForm.name"
                  type="text"
                  class="form-control idp-input"
                  placeholder="e.g. Office Rent"
                />
              </div>
              <div class="col-4">
                <label class="form-label text-light small fw-medium">Code</label>
                <input
                  v-model="expenseForm.code"
                  type="text"
                  class="form-control idp-input font-monospace text-uppercase"
                  placeholder="EXP-01"
                />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label text-light small fw-medium">Category</label>
              <select v-model="expenseForm.category" class="form-select idp-input">
                <option v-for="cat in expenseCategories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label text-light small fw-medium">Description / Details</label>
              <textarea
                v-model="expenseForm.description"
                rows="2"
                class="form-control idp-input small"
                placeholder="What this expense covers..."
              ></textarea>
            </div>

            <div class="form-check form-switch">
              <input v-model="expenseForm.isActive" class="form-check-input" type="checkbox" id="expActiveCheck" />
              <label class="form-check-label text-light small" for="expActiveCheck">Active in Expense Ledger</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-idp-secondary btn-sm" @click="showExpenseModal = false">Cancel</button>
            <button type="button" class="btn btn-warning btn-sm px-4 fw-semibold text-dark" @click="saveExpenseHead">
              <i class="bi bi-check-lg me-1"></i> Save Expense Head
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
