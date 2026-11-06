<script setup lang="ts">
import { computed } from "vue";

export type PermissionAction = { key: string; label: string };
export type PermissionModule = {
  id: string;
  name: string;
  description: string;
  icon: string;
  requiresAccounts?: boolean;
  actions: PermissionAction[];
};

const props = defineProps<{
  availableModules: PermissionModule[];
  permissions: string[];
  isEditMode: boolean;
  isSubmitting: boolean;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  "update:permissions": [val: string[]];
  submit: [];
}>();

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

const availableKeys = computed(() => props.availableModules.flatMap((m) => m.actions.map((a) => a.key)));

const viewKeys = (mod: PermissionModule) => mod.actions.filter((a) => a.key.endsWith(".view")).map((a) => a.key);
const moduleKeys = (mod: PermissionModule) => mod.actions.map((a) => a.key);

const hasKey = (key: string) => props.permissions.includes(key);
const isModuleEnabled = (mod: PermissionModule) => viewKeys(mod).some(hasKey);

const enabledModuleCount = computed(() => props.availableModules.filter(isModuleEnabled).length);

const toggleAction = (mod: PermissionModule, key: string) => {
  if (hasKey(key)) {
    emit(
      "update:permissions",
      props.permissions.filter((k) => k !== key)
    );
    return;
  }
  const next = new Set([...props.permissions, key]);
  const prefix = key.split(".")[0];
  const sectionView = `${prefix}.view`;
  if (moduleKeys(mod).includes(sectionView)) next.add(sectionView);
  emit("update:permissions", [...next]);
};

const isActionDisabled = (mod: PermissionModule, key: string) => {
  if (!key.endsWith(".view")) return false;
  const prefix = key.split(".")[0];
  return moduleKeys(mod).some((k) => k !== key && k.startsWith(`${prefix}.`) && hasKey(k));
};

const selectAllModules = () => {
  emit("update:permissions", [...availableKeys.value]);
};

const clearAllModules = () => {
  emit("update:permissions", []);
};

const matrixRows = computed<MatrixRow[]>(() =>
  props.availableModules.flatMap((mod) => {
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
    emit(
      "update:permissions",
      props.permissions.filter((k) => !row.keys.includes(k))
    );
  } else {
    emit("update:permissions", [...new Set([...props.permissions, ...row.keys])]);
  }
};

const cellCaption = (action: PermissionAction | undefined, columnLabel: string) =>
  action && !action.label.toLowerCase().startsWith(columnLabel.toLowerCase()) ? action.label : "";
</script>

<template>
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
        v-if="!isEditMode"
        type="button"
        class="btn btn-primary px-4 fw-semibold d-flex align-items-center gap-2"
        :disabled="isSubmitting || isLoading"
        @click="emit('submit')"
      >
        <span v-if="isSubmitting" class="spinner-border spinner-border-sm"></span>
        <i v-else class="bi bi-check2-circle"></i>
        Save Sub-User
      </button>
    </div>
  </div>
</template>

<style scoped>
.idp-form-card {
  background: var(--idp-card);
  border: 1px solid var(--idp-border);
  border-radius: var(--idp-radius);
}

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
