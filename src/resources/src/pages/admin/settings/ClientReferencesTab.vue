<script setup lang="ts">
import { computed, ref } from "vue";
import SearchInput from "@/components/common/SearchInput.vue";
import type { ClientReference } from "@/composables/useServicesApi";
import { useServicesApi } from "@/composables/useServicesApi";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  references: ClientReference[];
  canEdit: boolean;
}>();

const emit = defineEmits<(e: "refresh") => void>();

const toast = useToast();
const { createReference, updateReference, toggleReference, deleteReference } = useServicesApi();

const showReferenceModal = ref(false);
const isEditingReference = ref(false);
const referenceForm = ref<ClientReference>({
  id: 0,
  name: "",
  phone: "",
  email: "",
  notes: "",
  isActive: true
});
const referenceSearch = ref("");

const filteredReferences = computed(() => {
  if (!referenceSearch.value.trim()) return props.references;
  const q = referenceSearch.value.toLowerCase().trim();
  return props.references.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (r.phone && r.phone.toLowerCase().includes(q)) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q))
  );
});

const openAddReferenceModal = () => {
  isEditingReference.value = false;
  referenceForm.value = {
    id: 0,
    name: "",
    phone: "",
    email: "",
    notes: "",
    isActive: true
  };
  showReferenceModal.value = true;
};

const openEditReferenceModal = (refItem: ClientReference) => {
  isEditingReference.value = true;
  referenceForm.value = { ...refItem };
  showReferenceModal.value = true;
};

const saveReference = async () => {
  const trimmedName = referenceForm.value.name.trim();
  if (!trimmedName) {
    toast.error("Please enter a reference name");
    return;
  }

  try {
    if (isEditingReference.value) {
      await updateReference(referenceForm.value.id, {
        name: trimmedName,
        phone: referenceForm.value.phone?.trim() || undefined,
        email: referenceForm.value.email?.trim() || undefined,
        notes: referenceForm.value.notes?.trim() || undefined,
        isActive: referenceForm.value.isActive
      });
      toast.success("Reference updated");
    } else {
      await createReference({
        name: trimmedName,
        phone: referenceForm.value.phone?.trim() || undefined,
        email: referenceForm.value.email?.trim() || undefined,
        notes: referenceForm.value.notes?.trim() || undefined,
        isActive: referenceForm.value.isActive
      });
      toast.success("Reference added");
    }
    showReferenceModal.value = false;
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to save reference");
  }
};

const handleToggleReferenceStatus = async (refItem: ClientReference) => {
  try {
    await toggleReference(refItem.id);
    toast.success("Status updated");
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to update status");
  }
};

const handleDeleteReference = async (id: number) => {
  if (confirm("Are you sure you want to remove this reference?")) {
    try {
      await deleteReference(id);
      toast.info("Reference removed");
      emit("refresh");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to remove reference");
    }
  }
};
</script>

<template>
  <div class="row g-4">
    <div class="col-12">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h5 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
            <i class="bi bi-people-fill text-primary"></i> Client References & Introducers
          </h5>
          <p class="text-muted small mb-0">
            Manage partner references, tax associates, and introducers who refer client organizations to your firm.
          </p>
        </div>
        <button
          v-if="canEdit"
          type="button"
          class="btn btn-primary btn-sm px-3 fw-semibold d-flex align-items-center gap-1 text-nowrap flex-shrink-0 shadow-sm"
          style="white-space: nowrap; height: 38px;"
          @click="openAddReferenceModal"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Add Reference</span>
        </button>
      </div>

      <!-- Filter & Search Toolbar -->
      <div class="p-3 mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2 idp-card">
        <div class="d-flex flex-wrap align-items-center gap-2 flex-grow-1">
          <SearchInput
            v-model="referenceSearch"
            placeholder="Search reference name, phone, email..."
            min-width="260px"
            max-width="360px"
          />
        </div>
        <div class="text-muted small ps-2">
          Total: <strong class="text-white">{{ filteredReferences.length }}</strong> References
        </div>
      </div>

      <!-- References Table Card -->
      <div class="table-card shadow-sm">
        <table class="table-custom">
          <thead>
            <tr>
              <th style="width: 28%;">Reference / Introducer Name</th>
              <th style="width: 18%;">Phone Number</th>
              <th style="width: 22%;">Email Address</th>
              <th style="width: 16%;">Notes</th>
              <th style="width: 8%; text-align: center;">Status</th>
              <th v-if="canEdit" style="width: 8%; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="refItem in filteredReferences" :key="refItem.id">
              <td>
                <div class="fw-semibold text-white">{{ refItem.name }}</div>
              </td>
              <td>
                <span v-if="refItem.phone" class="font-monospace text-info small">
                  <i class="bi bi-telephone me-1"></i>{{ refItem.phone }}
                </span>
                <span v-else class="text-muted small">—</span>
              </td>
              <td>
                <span v-if="refItem.email" class="text-light small">
                  <i class="bi bi-envelope me-1 text-muted"></i>{{ refItem.email }}
                </span>
                <span v-else class="text-muted small">—</span>
              </td>
              <td>
                <span v-if="refItem.notes" class="text-muted small text-truncate d-inline-block" style="max-width: 220px;" :title="refItem.notes">
                  {{ refItem.notes }}
                </span>
                <span v-else class="text-muted small">—</span>
              </td>
              <td style="text-align: center;">
                <button
                  type="button"
                  class="badge-btn"
                  :class="refItem.isActive ? 'badge-active' : 'badge-inactive'"
                  :disabled="!canEdit"
                  @click="handleToggleReferenceStatus(refItem)"
                  title="Click to toggle active status"
                >
                  <span class="dot"></span> {{ refItem.isActive ? 'Active' : 'Inactive' }}
                </button>
              </td>
              <td v-if="canEdit" style="text-align: right;">
                <div class="d-flex gap-1 justify-content-end">
                  <button class="action-btn btn-edit" title="Edit Reference" @click="openEditReferenceModal(refItem)">
                    <i class="bi bi-pencil-fill"></i>
                  </button>
                  <button class="action-btn btn-del" title="Delete Reference" @click="handleDeleteReference(refItem.id)">
                    <i class="bi bi-trash3-fill"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredReferences.length === 0">
              <td :colspan="canEdit ? 6 : 5" class="text-center py-5 text-muted">
                <div class="d-flex flex-column align-items-center gap-2">
                  <i class="bi bi-people fs-2 text-secondary"></i>
                  <span>No references found. Click "Add Reference" to register an introducer.</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div
      v-if="showReferenceModal"
      class="modal fade show d-block"
      tabindex="-1"
      style="background: rgba(0, 0, 0, 0.75);"
    >
      <div class="modal-dialog modal-dialog-centered" style="max-width: 480px;">
        <div class="modal-content idp-card shadow-lg border border-secondary border-opacity-25" style="border-radius: 12px;">
          <div class="modal-header border-0 pb-0 pt-4 px-4 d-flex justify-content-between align-items-start">
            <div>
              <h5 class="modal-title text-white fw-bold mb-1">
                <i class="bi bi-people-fill text-primary me-2"></i>
                {{ isEditingReference ? 'Edit Reference' : 'Add Client Reference' }}
              </h5>
              <p class="text-muted small mb-0">
                {{ isEditingReference ? 'Update introducer details and contact info' : 'Register a new referral person or partner organization' }}
              </p>
            </div>
            <button type="button" class="btn-close btn-close-white" @click="showReferenceModal = false"></button>
          </div>
          <div class="modal-body px-4 py-3">
            <div class="mb-3">
              <label class="form-label text-light small fw-medium">Reference / Introducer Name <span class="text-danger">*</span></label>
              <input
                v-model="referenceForm.name"
                type="text"
                class="form-control idp-input"
                placeholder="e.g. Md. Aminul Islam or Rahman & Associates"
                required
              />
            </div>

            <div class="row g-3 mb-3">
              <div class="col-6">
                <label class="form-label text-light small fw-medium">Phone Number</label>
                <input
                  v-model="referenceForm.phone"
                  type="text"
                  class="form-control idp-input"
                  placeholder="017XXXXXXXX"
                />
              </div>
              <div class="col-6">
                <label class="form-label text-light small fw-medium">Email Address</label>
                <input
                  v-model="referenceForm.email"
                  type="email"
                  class="form-control idp-input"
                  placeholder="name@email.com"
                />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label text-light small fw-medium">Notes / Remarks</label>
              <textarea
                v-model="referenceForm.notes"
                rows="2"
                class="form-control idp-input"
                placeholder="Designation, firm name, commission arrangement, or notes..."
              ></textarea>
            </div>

            <div class="form-check form-switch pt-1">
              <input v-model="referenceForm.isActive" class="form-check-input" type="checkbox" id="refActiveCheck" />
              <label class="form-check-label text-light small" for="refActiveCheck">Active (Selectable when adding clients)</label>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0 pb-4 px-4 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-secondary btn-sm px-3 text-light" style="background-color: #1e293b; border: 1px solid #334155;" @click="showReferenceModal = false">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm px-4 fw-semibold" @click="saveReference">
              {{ isEditingReference ? 'Update Reference' : 'Save Reference' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
