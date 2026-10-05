<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import axios from "axios";
import { pulse } from "@/plugins/pulse";
import { useToast } from "@/composables/useToast";
import SearchInput from "@/components/common/SearchInput.vue";

const toast = useToast();

interface ClientReference {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isActive: boolean;
  referredClientsCount?: number;
}

const references = ref<ClientReference[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const searchQuery = ref("");
const showModal = ref(false);
const isEditing = ref(false);
const form = ref({ id: 0, name: "", phone: "", email: "", notes: "", isActive: true });
const formError = ref("");

onBeforeRouteLeave(() => {
  if (showModal.value) {
    toast.error("Please close or save the modal before leaving this page.");
    return false;
  }
});

const fetchReferences = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get("/api/superadmin/references");
    if (res.data?.success && Array.isArray(res.data.data)) {
      references.value = res.data.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        email: item.email,
        notes: item.notes,
        isActive: item.isActive !== false,
        referredClientsCount: item.referredClientsCount || 0
      }));
    }
  } catch (err: any) {
    console.error("Error loading references:", err);
    toast.error(err?.response?.data?.error || "Failed to load references");
  } finally {
    isLoading.value = false;
  }
};

const handleRealtimeUpdate = (p: any) => {
  if (!p?.type || p.type === "references") fetchReferences();
};

onMounted(() => {
  fetchReferences();
  pulse.channel("auth").listen("global:settings-updated", handleRealtimeUpdate);
});

onUnmounted(() => {
  pulse.channel("auth").stopListening("global:settings-updated", handleRealtimeUpdate);
});

const filteredReferences = computed(() => {
  if (!searchQuery.value.trim()) return references.value;
  const q = searchQuery.value.toLowerCase().trim();
  return references.value.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (r.phone && r.phone.toLowerCase().includes(q)) ||
      (r.email && r.email.toLowerCase().includes(q))
  );
});

const openAddModal = () => {
  isEditing.value = false;
  form.value = { id: 0, name: "", phone: "", email: "", notes: "", isActive: true };
  formError.value = "";
  showModal.value = true;
};

const openEditModal = (r: ClientReference) => {
  isEditing.value = true;
  form.value = {
    id: r.id,
    name: r.name,
    phone: r.phone || "",
    email: r.email || "",
    notes: r.notes || "",
    isActive: r.isActive
  };
  formError.value = "";
  showModal.value = true;
};

const handleSave = async () => {
  if (!form.value.name.trim()) {
    formError.value = "Reference name is required.";
    return;
  }
  isSaving.value = true;
  formError.value = "";
  const payload = {
    name: form.value.name.trim(),
    phone: form.value.phone.trim(),
    email: form.value.email.trim(),
    notes: form.value.notes.trim(),
    isActive: form.value.isActive
  };
  try {
    const res = isEditing.value
      ? await axios.put(`/api/superadmin/references/${form.value.id}`, payload)
      : await axios.post("/api/superadmin/references", payload);
    if (res.data?.success) {
      showModal.value = false;
      toast.success(isEditing.value ? "Reference updated successfully" : "Reference created successfully");
      await fetchReferences();
    } else {
      formError.value = res.data?.error || "Failed to save reference";
      toast.error(formError.value);
    }
  } catch (err: any) {
    formError.value = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Server error";
    toast.error(formError.value);
  } finally {
    isSaving.value = false;
  }
};

const toggleStatus = async (r: ClientReference) => {
  const prev = r.isActive;
  r.isActive = !r.isActive;
  try {
    const res = await axios.patch(`/api/superadmin/references/${r.id}/toggle`);
    if (!res.data?.success) {
      r.isActive = prev;
      toast.error("Failed to update status");
    } else {
      toast.success(`Reference "${r.name}" status updated`);
    }
  } catch (err: any) {
    r.isActive = prev;
    toast.error(err?.response?.data?.error || "Error toggling status");
  }
};

const deleteReference = async (r: ClientReference) => {
  if (!confirm(`Are you sure you want to permanently delete reference "${r.name}"?`)) return;
  const backup = [...references.value];
  references.value = references.value.filter((item) => item.id !== r.id);
  try {
    const res = await axios.delete(`/api/superadmin/references/${r.id}`);
    if (!res.data?.success) {
      references.value = backup;
      toast.error(res.data?.error || "Failed to delete reference");
    } else {
      toast.success(`Reference "${r.name}" deleted`);
    }
  } catch (err: any) {
    references.value = backup;
    toast.error(err?.response?.data?.error || "Failed to delete reference");
  }
};
</script>

<template>
  <div class="settings-page">
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <div>
        <h5 class="text-white fw-bold mb-1">Client References</h5>
        <p class="text-muted small mb-0">Manage the referral sources that clients can be linked to.</p>
      </div>
      <button id="add-reference-btn" class="btn btn-primary btn-sm d-flex align-items-center gap-1" @click="openAddModal">
        <i class="bi bi-plus-lg"></i> Add Reference
      </button>
    </div>

    <div v-if="references.length > 0 || searchQuery" class="d-flex gap-2 mb-3">
      <SearchInput v-model="searchQuery" placeholder="Search references..." max-width="320px" />
    </div>

    <div class="table-card position-relative">
      <div v-if="isLoading" class="p-5 text-center text-muted">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
        <span>Loading references from database...</span>
      </div>
      <table v-else class="table-custom">
        <thead>
          <tr>
            <th style="width: 50px;">#</th>
            <th>Reference Name</th>
            <th>Contact</th>
            <th style="width: 110px;">Clients</th>
            <th style="width: 120px;">Status</th>
            <th style="width: 100px; text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, idx) in filteredReferences" :key="r.id">
            <td class="text-muted">{{ idx + 1 }}</td>
            <td>
              <span class="fw-semibold text-white">{{ r.name }}</span>
              <div v-if="r.notes" class="text-muted small">{{ r.notes }}</div>
            </td>
            <td class="text-muted small">
              <div v-if="r.phone"><i class="bi bi-telephone me-1"></i>{{ r.phone }}</div>
              <div v-if="r.email"><i class="bi bi-envelope me-1"></i>{{ r.email }}</div>
              <span v-if="!r.phone && !r.email">—</span>
            </td>
            <td class="text-muted small">{{ r.referredClientsCount ?? 0 }}</td>
            <td>
              <button
                type="button"
                class="badge-btn"
                :class="r.isActive ? 'badge-active' : 'badge-inactive'"
                @click="toggleStatus(r)"
              >
                <span class="dot"></span> {{ r.isActive ? 'Active' : 'Inactive' }}
              </button>
            </td>
            <td style="text-align: right;">
              <div class="d-flex gap-1 justify-content-end">
                <button class="action-btn btn-edit" title="Edit" @click="openEditModal(r)">
                  <i class="bi bi-pencil-fill"></i>
                </button>
                <button class="action-btn btn-del" title="Delete" @click="deleteReference(r)">
                  <i class="bi bi-trash3-fill"></i>
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredReferences.length === 0">
            <td colspan="6" class="text-center py-5 text-muted">
              <div class="d-flex flex-column align-items-center justify-content-center gap-2">
                <i class="bi bi-inbox fs-2 text-secondary"></i>
                <span v-if="searchQuery">No references found matching "{{ searchQuery }}"</span>
                <span v-else>No references defined yet. Click "+ Add Reference" to create one.</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showModal" class="modal-overlay">
      <div class="modal-box">
        <div class="modal-hdr">
          <h6 class="text-white fw-bold mb-0">
            {{ isEditing ? 'Edit Reference' : 'Add New Reference' }}
          </h6>
          <button class="btn-close btn-close-white" @click="showModal = false"></button>
        </div>
        <div class="modal-bdy">
          <div v-if="formError" class="alert alert-danger py-2 small mb-3">
            {{ formError }}
          </div>
          <div class="mb-3">
            <label class="form-label small fw-semibold">Reference Name <span class="text-danger">*</span></label>
            <input id="reference-name" v-model="form.name" type="text" class="form-control form-control-sm idp-input" placeholder="e.g. Direct Acquisition" />
          </div>
          <div class="row g-2 mb-3">
            <div class="col-6">
              <label class="form-label small fw-semibold">Phone</label>
              <input id="reference-phone" v-model="form.phone" type="text" class="form-control form-control-sm idp-input" placeholder="01XXXXXXXXX" />
            </div>
            <div class="col-6">
              <label class="form-label small fw-semibold">Email</label>
              <input id="reference-email" v-model="form.email" type="email" class="form-control form-control-sm idp-input" placeholder="name@example.com" />
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label small fw-semibold">Notes</label>
            <textarea id="reference-notes" v-model="form.notes" rows="2" class="form-control form-control-sm idp-input" placeholder="Optional notes..."></textarea>
          </div>
          <div class="form-check form-switch">
            <input id="referenceActiveSwitch" v-model="form.isActive" class="form-check-input" type="checkbox" />
            <label class="form-check-label small text-muted" for="referenceActiveSwitch">Active Status</label>
          </div>
        </div>
        <div class="modal-ftr">
          <button class="btn btn-dark border-secondary btn-sm" :disabled="isSaving" @click="showModal = false">Cancel</button>
          <button id="save-reference-btn" class="btn btn-primary btn-sm d-flex align-items-center gap-1" :disabled="isSaving" @click="handleSave">
            <span v-if="isSaving" class="spinner-border spinner-border-sm me-1" role="status"></span>
            {{ isSaving ? 'Saving...' : 'Save Reference' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  font-family: 'Inter', sans-serif;
}
.table-card {
  background: #212529;
  border: 1px solid #3b424b;
  border-radius: 8px;
  overflow: hidden;
}
.table-custom {
  width: 100%;
  border-collapse: collapse;
}
.table-custom thead tr {
  background: #1a1d21;
  border-bottom: 1px solid #3b424b;
}
.table-custom th {
  padding: 10px 14px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #adb5bd;
  text-align: left;
}
.table-custom td {
  padding: 12px 14px;
  font-size: 0.85rem;
  border-bottom: 1px solid #2e343b;
  vertical-align: middle;
}
.table-custom tbody tr:hover td {
  background: #2c3238;
}
.badge-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.badge-active {
  background: rgba(25, 135, 84, 0.15);
  color: #20c997;
  border: 1px solid rgba(25, 135, 84, 0.3);
}
.badge-inactive {
  background: rgba(108, 117, 125, 0.15);
  color: #adb5bd;
  border: 1px solid rgba(108, 117, 125, 0.3);
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-edit { background: rgba(59, 142, 237, 0.15); color: #3b8eed; border: 1px solid rgba(59, 142, 237, 0.3); }
.btn-edit:hover { background: rgba(59, 142, 237, 0.25); }
.btn-del { background: rgba(220, 53, 69, 0.12); color: #ea868f; border: 1px solid rgba(220, 53, 69, 0.25); }
.btn-del:hover { background: rgba(220, 53, 69, 0.25); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}
.modal-box {
  background: #212529;
  border: 1px solid #3b424b;
  border-radius: 8px;
  width: 100%;
  max-width: 480px;
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0,0,0,0.5);
}
.modal-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: #1a1d21;
  border-bottom: 1px solid #3b424b;
}
.modal-bdy { padding: 18px; }
.modal-ftr {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  background: #1a1d21;
  border-top: 1px solid #3b424b;
}
</style>
