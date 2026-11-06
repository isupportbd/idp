import axios from "axios";
import { computed, ref } from "vue";
import { useMasterDataStore } from "@/stores/masterData";

export interface ClientItem {
  id: number;
  companyName: string;
  proprietorName?: string;
  mobile?: string;
  alternativeMobile?: string;
  email?: string;
  address?: string;
  binNumber?: string;
  tinNumber?: string;
  tradeLicenseNo?: string;
  customerTypeId?: number;
  customerTypeName?: string;
  referenceId?: number;
  referenceName?: string;
  vatUserId?: string;
  vatPassword?: string;
  vatServiceType?: "FULL" | "ONLY_RETURN";
  isActive: boolean;
  notes?: string;
  managers?: Array<{ id: number; name: string; email: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientManagerAssignment {
  id: number;
  companyName: string;
  binNumber?: string;
  mobile?: string;
  customerTypeId?: number;
  customerTypeName?: string;
  referenceId?: number;
  referenceName?: string;
  isActive: boolean;
  managerIds: number[];
  managers: Array<{ id: number; name: string; email: string }>;
}

export interface AssignableUser {
  id: number;
  name: string;
  email: string;
}

function getSession<T>(key: string): T | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  return null;
}

function setSession(key: string, val: unknown) {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(key, JSON.stringify(val));
    }
  } catch {}
}

const initialClients = getSession<ClientItem[]>("idp_cache_clients") || [];
const initialCount = getSession<number>("idp_cache_clients_count") || 0;

// Module-scoped persistent reactive state (SWR / Stale-While-Revalidate)
// Ensures that on route transitions, existing client & lookup data is rendered immediately
// (0ms latency, no empty table flash / prolonged loading spinner) while background revalidation occurs.
const cachedClients = ref<ClientItem[]>(initialClients);
const cachedAssignments = ref<ClientManagerAssignment[]>([]);
const cachedAssignmentStats = ref<{ total: number; assigned: number; shared: number; unassigned: number }>({
  total: 0,
  assigned: 0,
  shared: 0,
  unassigned: 0
});
const cachedAssignableUsers = ref<AssignableUser[]>([]);
const cachedTotalCount = ref(initialCount || initialClients.length);
const hasLoadedClientsOnce = ref(initialClients.length > 0);
const hasLoadedAssignmentsOnce = ref(false);
const hasLoadedUsersOnce = ref(false);

export function useClientsApi() {
  const masterStore = useMasterDataStore();
  const clients = cachedClients;
  const assignments = cachedAssignments;
  const assignmentStats = cachedAssignmentStats;
  const assignableUsers = computed(() => masterStore.assignableUsers);
  const totalCount = cachedTotalCount;
  const loading = ref(false);
  const error = ref<string | null>(null);

  const getErrorMessage = (err: unknown, fallback: string): string => {
    if (axios.isAxiosError(err)) {
      return err.response?.data?.message || err.message;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return fallback;
  };

  const fetchClients = async (
    params: {
      search?: string;
      customerTypeId?: number;
      referenceId?: number;
      vatServiceType?: "FULL" | "ONLY_RETURN" | "all";
      isActive?: string;
      page?: number;
      limit?: number;
    } = {}
  ) => {
    // Only display blocking loader if we don't have any cached clients yet
    if (!hasLoadedClientsOnce.value || clients.value.length === 0) {
      loading.value = true;
    }
    error.value = null;
    try {
      const res = await axios.get("/api/clients", { params });
      clients.value = res.data?.data || [];
      totalCount.value = res.data?.pagination?.total || clients.value.length;
      hasLoadedClientsOnce.value = true;
      if (!params.search && (!params.page || params.page === 1) && !params.customerTypeId && !params.referenceId) {
        setSession("idp_cache_clients", clients.value);
        setSession("idp_cache_clients_count", totalCount.value);
      }
      return res.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to fetch clients");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchClient = async (id: number) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.get(`/api/clients/${id}`);
      return res.data?.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to fetch client details");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createClient = async (payload: Partial<ClientItem> & { managerIds?: number[] }) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.post("/api/clients", payload);
      const created = res.data?.data;
      if (created) clients.value = [created, ...clients.value];
      totalCount.value += 1;
      return res.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to create client");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const updateClient = async (id: number, payload: Partial<ClientItem> & { managerIds?: number[] }) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.patch(`/api/clients/${id}`, payload);
      const updated = res.data?.data;
      const idx = clients.value.findIndex((c) => c.id === id);
      if (idx !== -1 && updated) clients.value[idx] = { ...clients.value[idx], ...updated };
      return res.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to update client");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const toggleClient = async (id: number, isActive: boolean) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.patch(`/api/clients/${id}/toggle`, { isActive });
      const found = clients.value.find((c) => c.id === id);
      if (found) found.isActive = isActive;
      return res.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to toggle client status");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const deleteClient = async (id: number) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.delete(`/api/clients/${id}`);
      clients.value = clients.value.filter((c) => c.id !== id);
      return res.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to delete client");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const checkBinUnique = async (bin: string, excludeId?: number) => {
    try {
      const res = await axios.post("/api/clients/check-bin", { bin, excludeId });
      return res.data as { unique: boolean; status?: string; message?: string; existingClient?: ClientItem | null };
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to verify BIN");
      return { unique: false, status: "ERROR", message: msg, existingClient: null };
    }
  };

  const checkMobileExists = async (mobile: string, excludeId?: number) => {
    try {
      const res = await axios.post("/api/clients/check-mobile", { mobile, excludeId });
      return res.data?.matches || [];
    } catch (err: unknown) {
      console.warn("[Clients API Warning]: Failed to check mobile uniqueness:", (err as Error)?.message || err);
      return [];
    }
  };

  const fetchAssignments = async (params: { search?: string; filter?: "all" | "assigned" | "shared" | "unassigned" } = {}) => {
    if (!hasLoadedAssignmentsOnce.value || assignments.value.length === 0) {
      loading.value = true;
    }
    error.value = null;
    try {
      const res = await axios.get("/api/clients/assignments", { params });
      assignments.value = res.data?.data || [];
      if (res.data?.stats) {
        assignmentStats.value = res.data.stats;
      }
      hasLoadedAssignmentsOnce.value = true;
      return res.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to fetch assignments");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const saveAssignments = async (clientId: number, managerIds: number[]) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.post("/api/clients/assignments", { clientId, managerIds });
      return res.data;
    } catch (err) {
      error.value = getErrorMessage(err, "Failed to save assignments");
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchAssignableUsers = async (force = false) => {
    return masterStore.fetchAssignableUsers(force);
  };

  return {
    clients,
    assignments,
    assignmentStats,
    assignableUsers,
    totalCount,
    loading,
    error,
    fetchClients,
    fetchClient,
    createClient,
    updateClient,
    toggleClient,
    deleteClient,
    checkBinUnique,
    checkMobileExists,
    fetchAssignments,
    saveAssignments,
    fetchAssignableUsers
  };
}
