<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import SearchInput from "@/components/common/SearchInput.vue";
import { useToast } from "@/composables/useToast";
import { pulse } from "@/plugins/pulse";

const toast = useToast();

export interface PaymentMethodItem {
  id: number;
  name: string;
  type?: string;
  description?: string;
  isActive: boolean;
}

const paymentMethods = ref<PaymentMethodItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const searchQuery = ref("");
const showModal = ref(false);
const isEditing = ref(false);
const form = ref({ id: 0, name: "", type: "mfs", description: "", isActive: true });
const formError = ref("");

onBeforeRouteLeave(() => {
  if (showModal.value) {
    toast.error("Please close or save the modal before leaving this page.");
    return false;
  }
});

const fetchPaymentMethods = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get("/api/superadmin/payment-methods");
    if (res.data?.success && Array.isArray(res.data.data)) {
      paymentMethods.value = res.data.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type || "general",
        description: item.description,
        isActive: item.isActive !== false && item.is_active !== false
      }));
    }
  } catch (err: any) {
    console.error("Error loading payment methods:", err);
  } finally {
    isLoading.value = false;
  }
};

const handleRealtimeUpdate = (p: any) => {
  if (!p?.type || p.type === "payment-methods") fetchPaymentMethods();
};

onMounted(() => {
  fetchPaymentMethods();
  pulse.channel("auth").listen("global:settings-updated", handleRealtimeUpdate);
});

onUnmounted(() => {
  pulse.channel("auth").stopListening("global:settings-updated", handleRealtimeUpdate);
});

const filteredMethods = computed(() => {
  if (!searchQuery.value.trim()) return paymentMethods.value;
  const q = searchQuery.value.toLowerCase().trim();
  return paymentMethods.value.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      (m.type && m.type.toLowerCase().includes(q)) ||
      (m.description && m.description.toLowerCase().includes(q))
  );
});

const openAddModal = () => {
  isEditing.value = false;
  form.value = { id: 0, name: "", type: "mfs", description: "", isActive: true };
  formError.value = "";
  showModal.value = true;
};

const openEditModal = (item: PaymentMethodItem) => {
  isEditing.value = true;
  form.value = {
    id: item.id,
    name: item.name,
    type: item.type || "general",
    description: item.description || "",
    isActive: item.isActive
  };
  formError.value = "";
  showModal.value = true;
};

const savePaymentMethod = async () => {
  formError.value = "";
  if (!form.value.name.trim()) {
    formError.value = "Payment Method name is required.";
    return;
  }

  isSaving.value = true;
  try {
    if (isEditing.value) {
      await axios.put(`/api/superadmin/payment-methods/${form.value.id}`, {
        name: form.value.name.trim(),
        type: form.value.type,
        description: form.value.description.trim() || null,
        isActive: form.value.isActive
      });
      toast.success("Payment method updated successfully.");
    } else {
      await axios.post("/api/superadmin/payment-methods", {
        name: form.value.name.trim(),
        type: form.value.type,
        description: form.value.description.trim() || null,
        isActive: form.value.isActive
      });
      toast.success("Payment method created successfully.");
    }
    showModal.value = false;
    fetchPaymentMethods();
  } catch (err: any) {
    formError.value = err.response?.data?.error || err.response?.data?.message || "Failed to save payment method.";
  } finally {
    isSaving.value = false;
  }
};

const toggleStatus = async (item: PaymentMethodItem) => {
  try {
    await axios.patch(`/api/superadmin/payment-methods/${item.id}/toggle`);
    item.isActive = !item.isActive;
    toast.success(`Payment method ${item.isActive ? "activated" : "deactivated"}.`);
  } catch (err: any) {
    toast.error(err.response?.data?.error || "Failed to toggle status.");
  }
};

const deletePaymentMethod = async (item: PaymentMethodItem) => {
  if (!confirm(`Are you sure you want to delete payment method "${item.name}"?`)) return;
  try {
    await axios.delete(`/api/superadmin/payment-methods/${item.id}`);
    toast.success("Payment method deleted successfully.");
    fetchPaymentMethods();
  } catch (err: any) {
    toast.error(err.response?.data?.error || err.response?.data?.message || "Failed to delete payment method.");
  }
};
</script>

<template>
  <div>
    <!-- Header Controls -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div style="max-width: 300px; width: 100%;">
        <SearchInput v-model="searchQuery" placeholder="Search payment methods..." />
      </div>
      <button class="btn btn-primary btn-sm px-3 fw-semibold shadow-sm" @click="openAddModal">
        <i class="bi bi-plus-lg me-1"></i> Add Payment Method
      </button>
    </div>

    <!-- Table -->
    <div class="card bg-dark border-secondary">
      <div class="table-responsive">
        <table class="table table-dark table-hover mb-0 align-middle">
          <thead>
            <tr class="border-secondary text-secondary small text-uppercase">
              <th style="width: 50px;">#</th>
              <th>Method Name</th>
              <th>Category / Type</th>
              <th>Description</th>
              <th style="width: 100px; text-align: center;">Status</th>
              <th style="width: 110px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td colspan="6" class="text-center py-4 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                Loading payment methods...
              </td>
            </tr>
            <tr v-else-if="filteredMethods.length === 0">
              <td colspan="6" class="text-center py-4 text-muted">
                No payment methods found. Click "Add Payment Method" to create one.
              </td>
            </tr>
            <tr v-for="(item, idx) in filteredMethods" :key="item.id" class="border-secondary">
              <td class="text-secondary small">{{ idx + 1 }}</td>
              <td>
                <span class="text-white fw-medium">{{ item.name }}</span>
              </td>
              <td>
                <span
                  class="badge text-uppercase"
                  :class="{
                    'bg-info bg-opacity-10 text-info border border-info border-opacity-25': item.type === 'mfs',
                    'bg-success bg-opacity-10 text-success border border-success border-opacity-25': item.type === 'bank',
                    'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25': item.type === 'cash',
                    'bg-secondary bg-opacity-10 text-muted border border-secondary border-opacity-25': !['mfs', 'bank', 'cash'].includes(item.type || '')
                  }"
                  style="font-size: 0.72rem;"
                >
                  {{ item.type || 'General' }}
                </span>
              </td>
              <td class="text-secondary small">{{ item.description || "—" }}</td>
              <td class="text-center">
                <span
                  class="badge cursor-pointer"
                  :class="item.isActive ? 'bg-success bg-opacity-25 text-success border border-success' : 'bg-secondary text-muted'"
                  style="cursor: pointer; font-size: 0.72rem;"
                  title="Click to toggle status"
                  @click="toggleStatus(item)"
                >
                  {{ item.isActive ? "Active" : "Inactive" }}
                </span>
              </td>
              <td class="text-end">
                <div class="d-flex justify-content-end gap-1">
                  <button
                    class="btn btn-sm btn-outline-secondary py-0 px-2"
                    title="Edit"
                    @click="openEditModal(item)"
                  >
                    <i class="bi bi-pencil-fill" style="font-size: 0.78rem;"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger py-0 px-2"
                    title="Delete"
                    @click="deletePaymentMethod(item)"
                  >
                    <i class="bi bi-trash3-fill" style="font-size: 0.78rem;"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Form -->
    <div v-if="showModal" class="modal fade show d-block" tabindex="-1" style="background: rgba(0,0,0,0.75);">
      <div class="modal-dialog modal-dialog-centered" style="max-width: 480px;">
        <div class="modal-content bg-dark border border-secondary shadow-lg">
          <div class="modal-header border-secondary">
            <h5 class="modal-title text-white fw-bold">
              <i class="bi bi-wallet2 text-primary me-2"></i>
              {{ isEditing ? "Edit Payment Method" : "Add Payment Method" }}
            </h5>
            <button type="button" class="btn-close btn-close-white" @click="showModal = false"></button>
          </div>
          <div class="modal-body">
            <div v-if="formError" class="alert alert-danger py-2 small mb-3">{{ formError }}</div>

            <div class="mb-3">
              <label class="form-label text-light small fw-semibold">Method Name <span class="text-danger">*</span></label>
              <input
                v-model="form.name"
                type="text"
                class="form-control bg-secondary bg-opacity-25 text-white border-secondary"
                placeholder="e.g. Send Money, Cash Out, Payment"
                autofocus
                @keydown.enter="savePaymentMethod"
              />
            </div>

            <div class="mb-3">
              <label class="form-label text-light small fw-semibold">Category / Type</label>
              <select v-model="form.type" class="form-select bg-secondary bg-opacity-25 text-white border-secondary">
                <option value="mfs">MFS (Mobile Financial Services)</option>
                <option value="bank">Bank / Cheque</option>
                <option value="cash">Cash</option>
                <option value="general">General / Other</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label text-light small fw-semibold">Description (Optional)</label>
              <textarea
                v-model="form.description"
                rows="2"
                class="form-control bg-secondary bg-opacity-25 text-white border-secondary"
                placeholder="e.g. Personal bKash/Nagad send money transfer"
              ></textarea>
            </div>

            <div class="form-check form-switch">
              <input v-model="form.isActive" class="form-check-input" type="checkbox" id="methodActive" />
              <label class="form-check-label text-light small" for="methodActive">Active</label>
            </div>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="showModal = false">Cancel</button>
            <button
              type="button"
              class="btn btn-primary btn-sm px-3"
              :disabled="isSaving"
              @click="savePaymentMethod"
            >
              <span v-if="isSaving" class="spinner-border spinner-border-sm me-1"></span>
              {{ isEditing ? "Save Changes" : "Create Method" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
