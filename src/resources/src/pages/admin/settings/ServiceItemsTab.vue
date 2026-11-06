<script setup lang="ts">
import { computed, ref } from "vue";
import SearchInput from "@/components/common/SearchInput.vue";
import type { ServiceItem } from "@/composables/useServicesApi";
import { useServicesApi } from "@/composables/useServicesApi";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  serviceItems: ServiceItem[];
  canEdit: boolean;
}>();

const emit = defineEmits<(e: "refresh") => void>();

const toast = useToast();
const { createServiceItem, updateServiceItem, toggleServiceItem, deleteServiceItem } = useServicesApi();

const newServiceItemName = ref("");
const showItemModal = ref(false);
const isEditingItem = ref(false);
const itemForm = ref({
  id: 0,
  itemName: "",
  isActive: true
});
const itemSearch = ref("");

const filteredItems = computed(() => {
  if (!itemSearch.value.trim()) return props.serviceItems;
  const q = itemSearch.value.toLowerCase().trim();
  return props.serviceItems.filter((s) => s.itemName.toLowerCase().includes(q));
});

const addQuickServiceItem = async () => {
  const trimmed = newServiceItemName.value.trim();
  if (!trimmed) {
    toast.error("Please enter a service name");
    return;
  }
  try {
    await createServiceItem(trimmed);
    newServiceItemName.value = "";
    toast.success("Service item added");
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || err.message || "Failed to add service item");
  }
};

const openEditItemModal = (item: ServiceItem) => {
  isEditingItem.value = true;
  itemForm.value = {
    id: item.id,
    itemName: item.itemName,
    isActive: item.isActive
  };
  showItemModal.value = true;
};

const saveServiceItem = async () => {
  const trimmedName = itemForm.value.itemName.trim();
  if (!trimmedName) {
    toast.error("Please enter a service item name");
    return;
  }

  try {
    await updateServiceItem(itemForm.value.id, trimmedName);
    showItemModal.value = false;
    toast.success("Service item updated");
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to update service item");
  }
};

const handleToggleServiceStatus = async (id: number) => {
  try {
    await toggleServiceItem(id);
    toast.success("Status updated");
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to toggle status");
  }
};

const handleDeleteServiceItem = async (id: number) => {
  if (confirm("Are you sure you want to remove this service item from master catalog?")) {
    try {
      await deleteServiceItem(id);
      toast.info("Service item removed");
      emit("refresh");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to remove service item");
    }
  }
};
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <!-- Add Service Item Card -->
    <div v-if="canEdit" class="idp-card p-3 p-md-4">
      <div class="d-flex align-items-center gap-2 mb-3">
        <div class="p-2 rounded-2 bg-primary bg-opacity-10 text-primary">
          <i class="bi bi-briefcase-fill fs-5"></i>
        </div>
        <div>
          <h6 class="text-white fw-bold mb-0">Add Master Service Item</h6>
          <div class="text-muted small">Define a billable consulting, filing, or audit service item for your firm.</div>
        </div>
      </div>
      <form @submit.prevent="addQuickServiceItem" class="d-flex gap-2">
        <input
          v-model="newServiceItemName"
          type="text"
          class="form-control idp-input"
          placeholder="Item name (e.g. Monthly VAT Return Submission - Mushak 9.1)"
          required
          maxlength="100"
        />
        <button type="submit" class="btn btn-primary px-4 fw-semibold text-nowrap d-flex align-items-center gap-1">
          <i class="bi bi-plus-lg"></i> <span>Add Item</span>
        </button>
      </form>
    </div>

    <!-- Service Items Table Card -->
    <div class="table-card">
      <div class="d-flex flex-wrap justify-content-between align-items-center p-3 p-md-4 pb-3 gap-2 border-bottom border-secondary border-opacity-25">
        <div>
          <h6 class="text-white fw-bold mb-1">Master Service Items</h6>
          <p class="text-muted small mb-0">
            Master catalog of billable services for automatic invoicing and rate mapping.
          </p>
        </div>

        <SearchInput
          v-model="itemSearch"
          placeholder="Search service items..."
          max-width="260px"
        />
      </div>

      <div class="table-responsive">
        <table class="table-custom">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Service Item Name</th>
              <th style="width: 140px;">Status</th>
              <th v-if="canEdit" style="width: 100px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in filteredItems" :key="s.id">
              <td class="text-muted">{{ idx + 1 }}</td>
              <td>
                <span class="fw-semibold text-white">{{ s.itemName }}</span>
              </td>
              <td>
                <button
                  type="button"
                  class="badge-btn"
                  :class="s.isActive ? 'badge-active' : 'badge-inactive'"
                  :disabled="!canEdit"
                  @click="handleToggleServiceStatus(s.id)"
                  title="Click to toggle active status"
                >
                  <span class="dot"></span> {{ s.isActive ? 'Active' : 'Inactive' }}
                </button>
              </td>
              <td v-if="canEdit" style="text-align: right;">
                <div class="d-flex gap-1 justify-content-end">
                  <button class="action-btn btn-edit" title="Edit Service Item" @click="openEditItemModal(s)">
                    <i class="bi bi-pencil-fill"></i>
                  </button>
                  <button class="action-btn btn-del" title="Delete Service Item" @click="handleDeleteServiceItem(s.id)">
                    <i class="bi bi-trash3-fill"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredItems.length === 0">
              <td :colspan="canEdit ? 4 : 3" class="text-center py-5 text-muted">
                <div class="d-flex flex-column align-items-center gap-2">
                  <i class="bi bi-inbox fs-2 text-secondary"></i>
                  <span>No service items found. Add your first service item above.</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Service Item Modal -->
    <div
      v-if="showItemModal"
      class="modal fade show d-block"
      tabindex="-1"
      style="background: rgba(0, 0, 0, 0.75);"
    >
      <div class="modal-dialog modal-dialog-centered" style="max-width: 460px;">
        <div class="modal-content idp-card shadow-lg border border-secondary border-opacity-25" style="border-radius: 12px;">
          <div class="modal-header border-0 pb-0 pt-4 px-4 d-flex justify-content-between align-items-start">
            <h5 class="modal-title text-white fw-bold mb-0">
              <i class="bi bi-briefcase text-primary me-2"></i> Edit Service Item
            </h5>
            <button type="button" class="btn-close btn-close-white" @click="showItemModal = false"></button>
          </div>
          <div class="modal-body px-4 py-3">
            <div class="mb-3">
              <label class="form-label text-light small fw-medium">Service Item Name <span class="text-danger">*</span></label>
              <input
                v-model="itemForm.itemName"
                type="text"
                class="form-control idp-input"
                placeholder="Item name (e.g. Books Of Accounts Maintenance)"
                required
              />
            </div>

            <div class="form-check form-switch pt-1">
              <input v-model="itemForm.isActive" class="form-check-input" type="checkbox" id="itemActiveCheck" />
              <label class="form-check-label text-light small" for="itemActiveCheck">Active in Firm Service List</label>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0 pb-4 px-4 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-secondary btn-sm px-3 text-light" style="background-color: #1e293b; border: 1px solid #334155;" @click="showItemModal = false">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm px-4 fw-semibold" @click="saveServiceItem">
              Save Service Item
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
