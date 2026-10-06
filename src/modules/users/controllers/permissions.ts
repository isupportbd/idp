/**
 * Why: Single source of truth for sub-user permissions (module + action).
 * When: Used by requirePermission middleware, the users API (catalog endpoint),
 *       and auth payloads so the UI and backend always agree on permission keys.
 * Where: users module (tenant team management).
 * How: Each module lists its actions; a permission key is `${moduleId}.${action}`.
 */

export type PermissionAction = {
  key: string;
  label: string;
};

export type PermissionModule = {
  id: string;
  name: string;
  description: string;
  icon: string;
  requiresAccounts?: boolean;
  actions: PermissionAction[];
};

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "clients",
    name: "Clients Organization",
    description: "Manage client profiles, TIN/BIN and details",
    icon: "bi-briefcase",
    actions: [
      { key: "clients.view", label: "View" },
      { key: "clients.create", label: "Create" },
      { key: "clients.edit", label: "Edit" },
      { key: "clients.delete", label: "Delete" },
      { key: "clients.vat_password", label: "View VAT Password" }
    ]
  },
  {
    id: "activity_filter",
    name: "Activity Filter",
    description: "Filter client activities and monthly operations",
    icon: "bi-funnel",
    actions: [{ key: "activity_filter.view", label: "View" }]
  },
  {
    id: "submissions",
    name: "Submissions & Filing",
    description: "Monthly VAT submissions and filing records",
    icon: "bi-journal-text",
    actions: [
      { key: "submissions.view", label: "View" },
      { key: "submissions.create", label: "Record / Update" },
      { key: "submissions.delete", label: "Delete" }
    ]
  },
  {
    id: "bin_formatter",
    name: "BIN Formatter",
    description: "Batch validate and format 9-13 digit BIN numbers",
    icon: "bi-card-checklist",
    actions: [{ key: "bin_formatter.view", label: "View" }]
  },
  {
    id: "purchases",
    name: "Purchases",
    description: "Upload and reconcile purchase registers",
    icon: "bi-cart3",
    actions: [
      { key: "purchases.view", label: "View" },
      { key: "purchases.create", label: "Upload" },
      { key: "purchases.edit", label: "Replace Duplicates" },
      { key: "purchases.delete", label: "Delete" }
    ]
  },
  {
    id: "sales_rates",
    name: "Sales Rates",
    description: "Maintain product sales rates and VAT vatable value",
    icon: "bi-currency-dollar",
    actions: [
      { key: "sales_rates.view", label: "View" },
      { key: "sales_rates.create", label: "Create" },
      { key: "sales_rates.edit", label: "Edit" },
      { key: "sales_rates.delete", label: "Delete" }
    ]
  },
  {
    id: "reports",
    name: "Audit & Analytics Reports",
    description: "Generate tenant audit reports and summaries",
    icon: "bi-file-earmark-bar-graph",
    actions: [
      { key: "reports.view", label: "View" },
      { key: "reports.export", label: "Export" }
    ]
  },
  {
    id: "billing",
    name: "Billing & Invoices",
    description: "Create bills, track payments and ledger",
    icon: "bi-receipt-cutoff",
    requiresAccounts: true,
    actions: [
      { key: "billing.view", label: "View Bills" },
      { key: "billing.create", label: "Create Bills" },
      { key: "billing.edit", label: "Edit Bills" },
      { key: "billing.delete", label: "Delete Bills" },
      { key: "collections.view", label: "View Collections" },
      { key: "collections.create", label: "Record Collections" },
      { key: "collections.delete", label: "Cancel Collections" }
    ]
  },
  {
    id: "settings",
    name: "Firm Settings",
    description: "Configure organization profile and preferences",
    icon: "bi-sliders",
    actions: [
      { key: "settings.view", label: "View" },
      { key: "settings.edit", label: "Edit" }
    ]
  }
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_MODULES.flatMap((m) => m.actions.map((a) => a.key));

/** Default permissions for a newly created sub-user (view-only on routine modules). */
export const DEFAULT_SUB_USER_PERMISSIONS: string[] = [
  "activity_filter.view",
  "submissions.view",
  "sales_rates.view",
  "reports.view"
];

/**
 * Why: Users saved before action-level permissions stored only module ids (e.g. "clients").
 * How: A bare module id is expanded to every action of that module, so existing sub-users keep
 *      exactly the access they had. Unknown keys are dropped. Saving the user stores the new format.
 */
export function normalizePermissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result = new Set<string>();
  for (const entry of raw) {
    const value = String(entry ?? "").trim();
    if (!value) continue;
    const legacyModule = PERMISSION_MODULES.find((m) => m.id === value);
    if (legacyModule) {
      legacyModule.actions.forEach((a) => result.add(a.key));
      continue;
    }
    if (ALL_PERMISSION_KEYS.includes(value)) result.add(value);
  }
  return [...result];
}
