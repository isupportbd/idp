<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";

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

type PermissionAction = { key: string; label: string };
type PermissionModule = {
  id: string;
  name: string;
  description: string;
  icon: string;
  requiresAccounts?: boolean;
  actions: PermissionAction[];
};

const catalog = ref<PermissionModule[]>([]);
const defaultPermissions = ref<string[]>([]);

const availableModules = computed(() =>
  catalog.value.filter((m) => !m.requiresAccounts || hasAccountsAccess.value)
);

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

// The first action(s) ending in ".view" grant entry to the module (billing has two: bills and collections)
const viewKeys = (mod: PermissionModule) => mod.actions.filter((a) => a.key.endsWith(".view")).map((a) => a.key);
const moduleKeys = (mod: PermissionModule) => mod.actions.map((a) => a.key);

const hasKey = (key: string) => form.value.permissions.includes(key);
const isModuleEnabled = (mod: PermissionModule) => viewKeys(mod).some(hasKey);

const toggleAction = (mod: PermissionModule, key: string) => {
  if (hasKey(key)) {
    form.value.permissions = form.value.permissions.filter((k) => k !== key);
    return;
  }
  const next = new Set([...form.value.permissions, key]);
  // Any action implies view access to its section (e.g. collections.create needs collections.view)
  const prefix = key.split(".")[0];
  const sectionView = `${prefix}.view`;
  if (moduleKeys(mod).includes(sectionView)) next.add(sectionView);
  form.value.permissions = [...next];
};

const isActionDisabled = (mod: PermissionModule, key: string) => {
  // A view key cannot be removed while other actions of the same section are granted
  if (!key.endsWith(".view")) return false;
  const prefix = key.split(".")[0];
  return moduleKeys(mod).some((k) => k !== key && k.startsWith(`${prefix}.`) && hasKey(k));
};

const selectAllModules = () => {
  form.value.permissions = [...availableKeys.value];
};

const clearAllModules = () => {
  form.value.permissions = [];
};

const enabledModuleCount = computed(() => availableModules.value.filter(isModuleEnabled).length);

// ── Permission matrix ───────────────────────────────────────────────
// One row per section ("clients", "billing", "collections"...), fixed action columns,
// so every row has the same height regardless of what is ticked.
const STANDARD_COLUMNS = [
  { suffix: "view", label: "View" },
  { suffix: "create", label: "Create" },
  { suffix: "edit", label: "Edit" },
  { suffix: "delete", label: "Delete" }
] as const;

type MatrixRow = {
  key: string;
  mod: PermissionModule;
  title: string;
  subtitle: string;
  keys: string[];
  cells: Record<string, PermissionAction | undefined>;
  extras: PermissionAction[];
};

const matrixRows = computed<MatrixRow[]>(() =>
  availableModules.value.flatMap((mod) => {
    const prefixes = [...new Set(mod.actions.map((a) => a.key.split(".")[0]))];
    return prefixes.map((prefix) => {
      const actions = mod.actions.filter((a) => a.key.startsWith(`${prefix}.`));
      const cells: Record<string, PermissionAction | undefined> = {};
      STANDARD_COLUMNS.forEach((col) => {
        cells[col.suffix] = actions.find((a) => a.key === `${prefix}.${col.suffix}`);
      });
      const standardKeys = STANDARD_COLUMNS.map((col) => `${prefix}.${col.suffix}`);
      const isSubSection = prefix !== mod.id;
      const prefixLabel = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      return {
        key: prefix,
        mod,
        title: isSubSection ? prefixLabel : mod.name,
        subtitle: isSubSection ? `Part of ${mod.name}` : mod.description,
        keys: actions.map((a) => a.key),
        cells,
        extras: actions.filter((a) => !standardKeys.includes(a.key))
      };
    });
  })
);

const rowGrantedCount = (row: MatrixRow) => row.keys.filter(hasKey).length;
const isRowFull = (row: MatrixRow) => row.keys.length > 0 && row.keys.every(hasKey);
const isRowPartial = (row: MatrixRow) => !isRowFull(row) && row.keys.some(hasKey);

const toggleRow = (row: MatrixRow) => {
  if (isRowFull(row)) {
    form.value.permissions = form.value.permissions.filter((k) => !row.keys.includes(k));
  } else {
    form.value.permissions = [...new Set([...form.value.permissions, ...row.keys])];
  }
};

// Show the catalog label under the checkbox only when it adds meaning (e.g. "Upload" under Create)
const cellCaption = (action: PermissionAction | undefined, columnLabel: string) =>
  action && !action.label.toLowerCase().startsWith(columnLabel.toLowerCase()) ? action.label : "";

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

  try {
    if (isEditMode.value) {
      await axios.put(`/api/users/${userId.value}`, payload);
      toast.success("Sub-user updated successfully!");
    } else {
      await axios.post("/api/users", payload);
      toast.success("Sub-user created successfully and saved to database!");
    }

    setTimeout(() => {
      if (window.opener) {
        try {
          window.opener.location.reload();
        } catch (e) {}
      }
      router.push("/admin/users");
    }, 1000);
  } catch (err: any) {
    const errorMsg = err.response?.data?.message || err.response?.data?.error || "Failed to save user. Please try again.";
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
                  class="form-control idp-field font-monospace"
                  placeholder="017XXXXXXXX"
                  required
                />
              </div>
            </div>

            <!-- Password -->
            <div class="col-md-6 col-xl-4">
              <label class="form-label text-muted small fw-semibold mb-1 d-flex justify-content-between">
                <span>PASSWORD {{ isEditMode ? '(Leave blank to keep unchanged)' : '*' }}</span>
                <span v-if="!isEditMode" class="text-muted fw-normal">Min 6 chars</span>
              </label>
              <div class="idp-input-wrap">
                <span class="input-icon">
                  <i class="bi bi-key"></i>
                </span>
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-control idp-field pe-5"
                  :placeholder="isEditMode ? '••••••••' : 'Enter login password'"
                  :required="!isEditMode"
                />
                <button
                  type="button"
                  class="btn-eye-toggle"
                  title="Toggle password visibility"
                  @click="showPassword = !showPassword"
                >
                  <i class="bi" :class="showPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                </button>
              </div>
            </div>

            <!-- Role Selection -->
            <div class="col-md-6 col-xl-4">
              <label class="form-label text-muted small fw-semibold mb-1">ACCOUNT ROLE</label>
              <div class="role-badge-card px-3 rounded d-flex align-items-center gap-3">
                <div class="role-icon-box">
                  <i class="bi bi-person-gear text-primary fs-5"></i>
                </div>
                <div class="lh-sm">
                  <div class="text-white fw-bold small">Staff / Sub-User</div>
                  <div class="text-muted" style="font-size: 0.75rem;">Permissions are assigned below</div>
                </div>
              </div>
            </div>

            <!-- Account Status -->
            <div class="col-md-6 col-xl-4">
              <label class="form-label text-muted small fw-semibold mb-1">ACCOUNT STATUS</label>
              <select v-model="form.status" class="form-select idp-select">
                <option value="active">Active (Can log in immediately)</option>
                <option value="inactive">Inactive / Suspended (Access disabled)</option>
              </select>
            </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: Granular Module Permissions -->
      <div class="col-12">
        <div class="card idp-form-card shadow-sm">
          <div class="card-header bg-transparent border-secondary border-opacity-25 py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <h5 class="card-title text-white mb-0 d-flex align-items-center gap-2 fs-6 fw-bold">
                <i class="bi bi-shield-lock text-primary"></i> Module Access & Permissions
              </h5>
              <span class="text-muted small">Tick the actions this sub-user can perform in each module</span>
            </div>

            <div class="d-flex align-items-center gap-2">
              <button
                type="button"
                class="btn btn-sm btn-outline-primary px-2"
                @click="selectAllModules"
              >
                <i class="bi bi-check-all me-1"></i> Select All
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary px-2"
                @click="clearAllModules"
              >
                <i class="bi bi-x me-1"></i> Clear All
              </button>
            </div>
          </div>

          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table-custom permission-matrix">
                <thead>
                  <tr>
                    <th class="col-module">Module</th>
                    <th class="col-action text-center">All</th>
                    <th v-for="col in STANDARD_COLUMNS" :key="col.suffix" class="col-action text-center">
                      {{ col.label }}
                    </th>
                    <th class="col-other">Other</th>
                    <th class="col-count text-end">Granted</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in matrixRows" :key="row.key" :class="{ 'row-granted': rowGrantedCount(row) > 0 }">
                    <!-- Module -->
                    <td class="col-module">
                      <div class="d-flex align-items-center gap-2">
                        <i :class="row.mod.icon" class="text-primary module-icon"></i>
                        <div class="lh-sm">
                          <div class="text-white fw-semibold">{{ row.title }}</div>
                          <div class="text-muted module-desc">{{ row.subtitle }}</div>
                        </div>
                      </div>
                    </td>

                    <!-- Row: select all -->
                    <td class="col-action text-center">
                      <input
                        :id="'perm-row-' + row.key"
                        type="checkbox"
                        class="form-check-input matrix-check"
                        :checked="isRowFull(row)"
                        :indeterminate="isRowPartial(row)"
                        :title="isRowFull(row) ? 'Remove all' : 'Grant all'"
                        @change="toggleRow(row)"
                      />
                    </td>

                    <!-- Standard actions -->
                    <td v-for="col in STANDARD_COLUMNS" :key="col.suffix" class="col-action text-center">
                      <template v-if="row.cells[col.suffix]">
                        <input
                          :id="'perm-' + row.cells[col.suffix]!.key"
                          type="checkbox"
                          class="form-check-input matrix-check"
                          :checked="hasKey(row.cells[col.suffix]!.key)"
                          :disabled="isActionDisabled(row.mod, row.cells[col.suffix]!.key)"
                          :title="row.cells[col.suffix]!.label"
                          @change="toggleAction(row.mod, row.cells[col.suffix]!.key)"
                        />
                        <div v-if="cellCaption(row.cells[col.suffix], col.label)" class="cell-caption">
                          {{ cellCaption(row.cells[col.suffix], col.label) }}
                        </div>
                      </template>
                      <span v-else class="text-muted cell-empty">—</span>
                    </td>

                    <!-- Special actions -->
                    <td class="col-other">
                      <div v-if="row.extras.length" class="d-flex flex-wrap gap-3">
                        <label
                          v-for="extra in row.extras"
                          :key="extra.key"
                          :for="'perm-' + extra.key"
                          class="extra-check"
                        >
                          <input
                            :id="'perm-' + extra.key"
                            type="checkbox"
                            class="form-check-input matrix-check"
                            :checked="hasKey(extra.key)"
                            @change="toggleAction(row.mod, extra.key)"
                          />
                          <span>{{ extra.label }}</span>
                        </label>
                      </div>
                      <span v-else class="text-muted cell-empty">—</span>
                    </td>

                    <!-- Count -->
                    <td class="col-count text-end">
                      <span class="badge action-count fw-normal">{{ rowGrantedCount(row) }} / {{ row.keys.length }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="px-4 py-2 text-muted matrix-hint">
              <i class="bi bi-info-circle me-1"></i>
              Granting any action also grants <strong>View</strong> for that row. View cannot be removed while other actions are granted.
            </div>
          </div>

          <div class="card-footer bg-transparent border-secondary border-opacity-25 py-3 d-flex justify-content-between align-items-center">
            <span class="text-muted small">
              Enabled Modules: <strong class="text-white">{{ enabledModuleCount }} / {{ availableModules.length }}</strong>
            </span>
            <button
              type="button"
              class="btn btn-primary px-4 fw-semibold d-flex align-items-center gap-2"
              :disabled="isSubmitting || isLoading"
              @click="handleSubmit"
            >
              <span v-if="isSubmitting" class="spinner-border spinner-border-sm"></span>
              <i v-else class="bi bi-check2-circle"></i>
              {{ isEditMode ? 'Update Sub-User' : 'Save Sub-User' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

.idp-form-card {
  background: var(--idp-card);
  border: 1px solid var(--idp-border);
  border-radius: var(--idp-radius);
}

/* Unified Input Wrapper to Eliminate Broken Borders */
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

.idp-select {
  height: 40px;
  background-color: var(--idp-bg) !important;
  border: 1px solid var(--idp-border) !important;
  border-radius: 6px !important;
  color: var(--idp-text-main) !important;
  font-size: 0.88rem;
}

.idp-select:focus {
  border-color: var(--idp-primary) !important;
  box-shadow: none !important;
}

/* Role Card */
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

/* Permission matrix (same look as the IDP data tables, theme variables only) */
.table-custom {
  width: 100%;
  border-collapse: collapse;
}

.table-custom thead tr {
  background: var(--idp-bg);
  border-bottom: 1px solid var(--idp-border);
}

.table-custom th {
  padding: 12px 16px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--idp-text-muted);
  white-space: nowrap;
}

.table-custom td {
  height: 64px;
  padding: 10px 16px;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--idp-border);
  vertical-align: middle;
  color: var(--idp-text-main);
}

.table-custom tbody tr:last-child td {
  border-bottom: none;
}

.table-custom tbody tr:hover td {
  background: var(--idp-card-hover);
}

.permission-matrix .col-module {
  min-width: 260px;
}

.permission-matrix .col-action {
  width: 84px;
}

.permission-matrix .col-other {
  min-width: 180px;
}

.permission-matrix .col-count {
  width: 96px;
}

.module-icon {
  font-size: 1.05rem;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.module-desc {
  font-size: 0.75rem;
  margin-top: 2px;
}

.matrix-check {
  float: none;
  margin: 0;
  vertical-align: middle;
}

.cell-caption {
  margin-top: 3px;
  font-size: 0.68rem;
  color: var(--idp-text-dim);
  white-space: nowrap;
}

.cell-empty {
  font-size: 0.85rem;
  opacity: 0.6;
}

.extra-check {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  cursor: pointer;
  white-space: nowrap;
}

.action-count {
  background: var(--idp-bg);
  border: 1px solid var(--idp-border);
  color: var(--idp-text-muted);
}

.row-granted .action-count {
  color: var(--idp-text-main);
  border-color: var(--idp-border-light);
}

.matrix-hint {
  font-size: 0.75rem;
  border-top: 1px solid var(--idp-border);
}
</style>
