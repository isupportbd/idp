import { computed, type Ref, readonly, ref } from "vue";

type UnknownRecord = Record<string, unknown>;

export type RoleLike = {
  id?: string | number;
  name?: string;
  title?: string;
  slug?: string;
} & UnknownRecord;

export type AuthUser = UnknownRecord & {
  id?: string | number;
  name?: string;
  role?: RoleLike | null;
  roles?: RoleLike[] | null;
};

const userRef: Ref<AuthUser | null> = ref(null);

export function setUser(user: AuthUser | null) {
  userRef.value = user;
}

export function clearUser() {
  userRef.value = null;
}

export function useAuth() {
  return {
    user: readonly(userRef),
    isAuthenticated: computed(() => !!userRef.value),
    setUser,
    clearUser
  };
}

export function hasRole(...wanted: string[]): boolean {
  const subject = userRef.value as any;
  if (!subject) return false;

  const current = (subject.roles ?? (subject.role ? [subject.role] : []))
    .map((item: any) => (item.name || item.title || item.slug || (typeof item === 'string' ? item : "")).toLowerCase().trim())
    .filter(Boolean);

  if (!wanted.length) return current.length > 0;

  const expected = wanted.map((item) => item.toLowerCase().trim()).filter(Boolean);
  return current.some((item: string) => expected.includes(item));
}

export function isTenantAdmin(): boolean {
  const subject = userRef.value as any;
  if (!subject) return false;
  if (hasRole("superadmin")) return false;
  const roleName = (typeof subject.role === "object" ? subject.role?.name : subject.role) || "";
  return roleName === "admin" || !subject.adminId;
}

export function hasAccountsAccess(): boolean {
  const subject = userRef.value as any;
  if (!subject) return false;
  // Superadmin is platform owner, not a tenant firm
  if (hasRole("superadmin")) return false;
  if (subject.plan) {
    return subject.plan.hasAccounts === true;
  }
  return false;
}

/**
 * Why: Action-level permission check for sub-users (mirrors backend requirePermission).
 * How: Passes when the user holds ANY of the given keys (e.g. "clients.delete").
 *      Supports both granular keys ("purchases.view") and legacy module keys ("purchases").
 *      Tenant admins pass everything; superadmin never operates tenant modules.
 */
export function can(...keys: string[]): boolean {
  const subject = userRef.value as any;
  if (!subject) return false;
  if (hasRole("superadmin")) return false;
  if (isTenantAdmin()) return true;
  const granted: string[] = Array.isArray(subject.permissions) ? subject.permissions : [];
  if (!granted.length) return false;
  return keys.some((key) => {
    const mod = key.split(".")[0];
    return granted.includes(key) || granted.includes(mod) || granted.some((g) => key.startsWith(`${g}.`));
  });
}

// View permission(s) that unlock each module's menu entry and pages
const MODULE_VIEW_KEYS: Record<string, string[]> = {
  billing: ["billing.view", "collections.view"],
  accounts: ["billing.view", "collections.view"]
};

export function canAccessModule(moduleId: string): boolean {
  const subject = userRef.value as any;
  if (!subject) return false;

  // Superadmin is platform owner and does not operate tenant firm business modules
  if (hasRole("superadmin")) return false;
  if (isTenantAdmin()) return true;

  // Billing module strictly requires tenant plan accounts capability
  if ((moduleId === "billing" || moduleId === "accounts") && !hasAccountsAccess()) {
    return false;
  }

  const views = MODULE_VIEW_KEYS[moduleId] ?? [`${moduleId}.view`];
  return can(...views, moduleId);
}
