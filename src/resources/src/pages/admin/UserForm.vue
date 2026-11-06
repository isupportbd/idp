<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import IdpSelect from "@/components/common/IdpSelect.vue";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";
import UserPermissionsCard, { type PermissionModule } from "./users/UserPermissionsCard.vue";
import UserServiceRatesCard, { type AssignedRate, type ServiceItem } from "./users/UserServiceRatesCard.vue";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const isEditMode = computed(() => !!route.params.id && route.params.id !== "create");
const userId = computed(() => Number(route.params.id) || 0);

const hasAccountsAccess = computed(() => {
  const user = authStore.user as any;
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.plan) {
    return user.plan.hasAccounts === true;
  }
  return false;
});

const catalog = ref<PermissionModule[]>([]);
const defaultPermissions = ref<string[]>([]);

const availableModules = computed(() => catalog.value.filter((m) => !m.requiresAccounts || hasAccountsAccess.value));

const availableKeys = computed(() => availableModules.value.flatMap((m) => m.actions.map((a) => a.key)));

const isSubmitting = ref(false);
const isLoading = ref(false);
const showPassword = ref(false);

const form = ref({
  name: "",
  email: "",
  mobile: "",
  password: "",
  role: "user" as "user",
  status: "active" as "active" | "inactive",
  permissions: [] as string[]
});

const fetchCatalog = async () => {
  try {
    const res = await axios.get("/api/users/permissions");
    catalog.value = res.data?.data || [];
    defaultPermissions.value = res.data?.defaults || [];
  } catch (err: any) {
    toast.error("Failed to load the permission list.");
  }
};

// Fetch user data if in edit mode
const fetchUserData = async () => {
  if (!isEditMode.value) {
    // Default create mode: view-only access to routine modules
    form.value.permissions = [...defaultPermissions.value];
    return;
  }

  isLoading.value = true;
  try {
    const res = await axios.get("/api/users");
    const list = res.data?.data || res.data || [];
    const target = list.find((u: any) => u.id === userId.value);
    if (target) {
      form.value = {
        name: target.name || "",
        email: target.email || "",
        mobile: target.mobile || "",
        password: "",
        role: "user",
        status: target.status || "active",
        permissions: Array.isArray(target.permissions) ? [...target.permissions] : [...defaultPermissions.value]
      };
    } else {
      toast.error("User record not found.");
    }
  } catch (err: any) {
    toast.error("Failed to load user information.");
  } finally {
    isLoading.value = false;
  }
};

// Service assignment & rates state
const serviceCatalog = ref<ServiceItem[]>([]);
const rates = ref<AssignedRate[]>([]);
const retiredRates = ref<AssignedRate[]>([]);
const ratesLoading = ref(false);
const ratesLoaded = ref(false);
const ratesDirty = ref(false);

const mapRate = (r: any): AssignedRate => ({
  serviceItemId: Number(r.serviceItemId),
  itemName: r.itemName,
  rate: Number(r.rate) || 0,
  effectiveFrom: r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : new Date().toISOString().slice(0, 10),
  effectiveTo: r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : "",
  isActive: r.isActive !== false,
  versionCount: Number(r.versionCount) || 1,
  history: Array.isArray(r.history)
    ? r.history.map((h: any) => ({
        rate: Number(h.rate) || 0,
        effectiveFrom: h.effectiveFrom ? String(h.effectiveFrom).slice(0, 10) : "",
        effectiveTo: h.effectiveTo ? String(h.effectiveTo).slice(0, 10) : "",
        isActive: h.isActive !== false
      }))
    : []
});

const fetchRates = async () => {
  if (!isEditMode.value || !userId.value) return;
  ratesLoading.value = true;
  try {
    const res = await axios.get(`/api/payouts/users/${userId.value}/rates`);
    serviceCatalog.value = (res.data?.catalog || []).map((i: any) => ({
      id: Number(i.id),
      itemName: i.itemName
    }));
    rates.value = (res.data?.data || []).map(mapRate);
    retiredRates.value = (res.data?.retired || []).map(mapRate);
    ratesLoaded.value = true;
    ratesDirty.value = false;
  } catch {
    serviceCatalog.value = [];
    rates.value = [];
    retiredRates.value = [];
    ratesLoaded.value = false;
    toast.error("Failed to load the service rate card. Reload the page and try again.");
  } finally {
    ratesLoading.value = false;
  }
};

// Handle Submit
const handleSubmit = async () => {
  if (!form.value.name.trim()) {
    toast.warning("Full name is required.");
    return;
  }
  if (!form.value.email.trim() || !form.value.email.includes("@")) {
    toast.warning("A valid email address is required.");
    return;
  }
  if (!form.value.mobile.trim()) {
    toast.warning("Mobile number is required.");
    return;
  }
  if (!isEditMode.value && (!form.value.password || form.value.password.length < 6)) {
    toast.warning("Password is required and must be at least 6 characters long.");
    return;
  }

  isSubmitting.value = true;

  const payload: any = {
    name: form.value.name.trim(),
    email: form.value.email.trim(),
    mobile: form.value.mobile.trim(),
    role: "user",
    status: form.value.status,
    permissions: form.value.permissions.filter((k) => availableKeys.value.includes(k))
  };

  if (form.value.password) {
    payload.password = form.value.password;
  }

  let rateSaveError: string | null = null;
  try {
    if (isEditMode.value) {
      await axios.put(`/api/users/${userId.value}`, payload);

      if (userId.value && (ratesLoaded.value || ratesDirty.value)) {
        try {
          await axios.post(`/api/payouts/users/${userId.value}/rates`, {
            rates: rates.value
              .filter((r) => Number(r.rate) > 0)
              .map((r) => ({
                serviceItemId: r.serviceItemId,
                rate: Number(r.rate),
                effectiveFrom: r.effectiveFrom || new Date().toISOString().slice(0, 10)
              }))
          });
          ratesDirty.value = false;
        } catch (rateErr: any) {
          rateSaveError = rateErr.response?.data?.message || "Service rates could not be saved.";
          throw rateErr;
        }
      }

      toast.success("Sub-user and service rates updated successfully!");
    } else {
      await axios.post("/api/users", payload);
      toast.success("Sub-user created successfully and saved to database!");
    }

    setTimeout(() => {
      if (window.opener) {
        try {
          window.opener.location.reload();
        } catch (uiErr: any) {
          console.warn("[UI Component Warning: UserForm.vue]", uiErr?.message || uiErr);
        }
      }
      router.push("/admin/users");
    }, 1000);
  } catch (err: any) {
    const errorMsg = rateSaveError || err.response?.data?.message || err.response?.data?.error || "Failed to save user. Please try again.";
    toast.error(errorMsg);
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(async () => {
  isLoading.value = true;
  await fetchCatalog();
  isLoading.value = false;
  fetchUserData();
  fetchRates();
});
</script>

<template>
  <div class="user-form-page container-fluid py-3">
    <!-- Breadcrumbs & Header -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/admin/users" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Team Users
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">{{ isEditMode ? 'Edit User' : 'Create New Sub-User' }}</span>
        </div>
        <h3 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-person-plus-fill text-primary"></i>
          <span>{{ isEditMode ? 'Edit Sub-User Account' : 'Add New Sub-User' }}</span>
        </h3>
        <span class="text-muted small">
          Configure sub-user credentials, contact info, and granular module permissions
        </span>
      </div>

      <div class="d-flex align-items-center gap-2 mt-2 mt-md-0">
        <router-link to="/admin/users" class="btn btn-outline-secondary btn-sm px-3">
          <i class="bi bi-x me-1"></i> Cancel
        </router-link>
        <span
          v-if="isEditMode && ratesDirty"
          class="badge pending-badge"
          title="Service rate changes are pending — click Update Sub-User to save"
        >
          <i class="bi bi-exclamation-circle me-1"></i>Unsaved rate changes
        </span>
        <button
          type="button"
          class="btn btn-primary btn-sm px-4 d-flex align-items-center gap-2 fw-semibold"
          :disabled="isSubmitting || isLoading"
          @click="handleSubmit"
        >
          <span v-if="isSubmitting" class="spinner-border spinner-border-sm"></span>
          <i v-else class="bi bi-check2-circle"></i>
          {{ isEditMode ? 'Update Sub-User' : 'Save Sub-User' }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="text-muted mt-2">Loading user details...</p>
    </div>

    <!-- Main Form Grid -->
    <div v-else class="row g-4">
      <!-- Top: User Profile & Credentials -->
      <div class="col-12">
        <div class="card idp-form-card shadow-sm">
          <div class="card-header bg-transparent border-secondary border-opacity-25 py-3">
            <h5 class="card-title text-white mb-0 d-flex align-items-center gap-2 fs-6 fw-bold">
              <i class="bi bi-person-badge text-primary"></i> Account & Profile Information
            </h5>
          </div>

          <div class="card-body p-4">
            <div class="row g-3">
              <!-- Full Name -->
              <div class="col-md-6 col-xl-4">
                <label class="form-label text-muted small fw-semibold mb-1">
                  FULL NAME <span class="text-danger">*</span>
                </label>
                <div class="idp-input-wrap">
                  <span class="input-icon">
                    <i class="bi bi-person"></i>
                  </span>
                  <input
                    v-model="form.name"
                    type="text"
                    class="form-control idp-field"
                    placeholder="e.g. Md. Ashiqur Rahman"
                    required
                  />
                </div>
              </div>

              <!-- Email Address -->
              <div class="col-md-6 col-xl-4">
                <label class="form-label text-muted small fw-semibold mb-1">
                  EMAIL ADDRESS <span class="text-danger">*</span>
                </label>
                <div class="idp-input-wrap">
                  <span class="input-icon">
                    <i class="bi bi-envelope"></i>
                  </span>
                  <input
                    v-model="form.email"
                    type="email"
                    class="form-control idp-field"
                    placeholder="staff@firm.com"
                    required
                  />
                </div>
              </div>

              <!-- Mobile Number -->
              <div class="col-md-6 col-xl-4">
                <label class="form-label text-muted small fw-semibold mb-1">
                  MOBILE NUMBER <span class="text-danger">*</span>
                </label>
                <div class="idp-input-wrap">
                  <span class="input-icon">
                    <i class="bi bi-telephone"></i>
                  </span>
                  <input
                    v-model="form.mobile"
                    type="tel"
                    class="form-control idp-field"
                    placeholder="017xxxxxxxx"
                    required
                  />
                </div>
              </div>

              <!-- Password -->
              <div class="col-md-6 col-xl-4">
                <label class="form-label text-muted small fw-semibold mb-1">
                  PASSWORD <span v-if="!isEditMode" class="text-danger">*</span>
                  <span v-else class="text-muted fw-normal">(Leave blank to keep unchanged)</span>
                </label>
                <div class="idp-input-wrap">
                  <span class="input-icon">
                    <i class="bi bi-key"></i>
                  </span>
                  <input
                    v-model="form.password"
                    :type="showPassword ? 'text' : 'password'"
                    class="form-control idp-field"
                    :placeholder="isEditMode ? '••••••••' : 'Min 6 characters'"
                    :required="!isEditMode"
                  />
                  <button
                    type="button"
                    class="btn-eye-toggle"
                    tabindex="-1"
                    @click="showPassword = !showPassword"
                  >
                    <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                  </button>
                </div>
              </div>

              <!-- Role (Read-only User) -->
              <div class="col-md-6 col-xl-4">
                <label class="form-label text-muted small fw-semibold mb-1">USER ROLE</label>
                <div class="role-badge-card d-flex align-items-center gap-2 px-3 rounded">
                  <div class="role-icon-box text-primary">
                    <i class="bi bi-person-gear"></i>
                  </div>
                  <div>
                    <div class="text-white small fw-bold">Standard Sub-User</div>
                    <div class="text-muted" style="font-size: 0.72rem;">Limited by module permissions</div>
                  </div>
                </div>
              </div>

              <!-- Account Status -->
              <div class="col-md-6 col-xl-4">
                <label class="form-label text-muted small fw-semibold mb-1">ACCOUNT STATUS</label>
                <IdpSelect
                  v-model="form.status"
                  :options="[
                    { value: 'active', label: 'Active - User can log in' },
                    { value: 'inactive', label: 'Inactive - Access disabled' }
                  ]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: Granular Module Permissions Subcomponent -->
      <div class="col-12">
        <UserPermissionsCard
          :available-modules="availableModules"
          :permissions="form.permissions"
          :is-edit-mode="isEditMode"
          :is-submitting="isSubmitting"
          :is-loading="isLoading"
          @update:permissions="form.permissions = $event"
          @submit="handleSubmit"
        />
      </div>

      <!-- Bottom: Service assignment & rates Subcomponent (edit mode only) -->
      <div v-if="isEditMode" class="col-12">
        <UserServiceRatesCard
          :rates="rates"
          :retired-rates="retiredRates"
          :service-catalog="serviceCatalog"
          :rates-loading="ratesLoading"
          :rates-dirty="ratesDirty"
          @update:rates="rates = $event"
          @update:rates-dirty="ratesDirty = $event"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.idp-form-card {
  background: var(--idp-card);
  border: 1px solid var(--idp-border);
  border-radius: var(--idp-radius);
}

.idp-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.idp-input-wrap .input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--idp-text-dim);
  font-size: 1rem;
  pointer-events: none;
  z-index: 5;
}

.idp-field {
  width: 100%;
  height: 40px;
  padding: 8px 12px 8px 38px;
  background-color: var(--idp-bg) !important;
  border: 1px solid var(--idp-border) !important;
  border-radius: 6px !important;
  color: var(--idp-text-main) !important;
  font-size: 0.88rem;
}

.idp-field:focus {
  border-color: var(--idp-primary) !important;
  box-shadow: none !important;
  outline: none;
}

.idp-field::placeholder {
  color: var(--idp-text-dim);
}

.btn-eye-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--idp-text-dim);
  padding: 4px 6px;
  cursor: pointer;
  z-index: 5;
}

.btn-eye-toggle:hover {
  color: var(--idp-text-main);
}

.role-badge-card {
  height: 40px;
  background: var(--idp-bg);
  border: 1px solid var(--idp-border);
}

.role-icon-box {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--idp-bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pending-badge {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 193, 7, 0.16);
  color: #ffca2c;
  border: 1px solid rgba(255, 193, 7, 0.45);
}
</style>
