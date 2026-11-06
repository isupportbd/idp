<script setup lang="ts">
import { debounce } from "lodash-es";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import SearchInput from "@/components/common/SearchInput.vue";
import { usePagination } from "@/composables/usePagination";
import { type PendingSignup, type Tenant, useSuperAdminApi } from "@/composables/useSuperAdminApi";
import { pulse } from "@/plugins/pulse";
import ExtendSubscriptionModal from "./tenants/ExtendSubscriptionModal.vue";
import PendingRechargesCard from "./tenants/PendingRechargesCard.vue";
import PendingSignupsCard from "./tenants/PendingSignupsCard.vue";

const router = useRouter();
const route = useRoute();

const {
  tenants,
  pendingSignups,
  pendingRecharges,
  isLoadingTenants,
  isLoadingPending,
  fetchTenants,
  fetchPendingSignups,
  fetchPendingRecharges,
  approveSignup,
  rejectSignup,
  approveRecharge,
  rejectRecharge,
  extendTenant,
  toggleTenantStatus,
  deleteTenant
} = useSuperAdminApi();

const TENANTS_FILTER_KEY = "idp_superadmin_tenants_filters";

const getSavedFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = sessionStorage.getItem(TENANTS_FILTER_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Tenants.vue]", uiErr?.message || uiErr);
  }
  return {};
};

const savedFilters = getSavedFilters();

const searchTerm = ref(savedFilters.searchTerm || "");
const statusFilter = ref<"all" | "active" | "suspended">(savedFilters.statusFilter || "all");
const approveDays = ref<{ [key: number]: number | undefined }>({});
const showExtendModal = ref(false);
const selectedTenant = ref<Tenant | null>(null);
const extendDaysCount = ref(30);
const isSubmittingAction = ref(false);

const saveFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(
        TENANTS_FILTER_KEY,
        JSON.stringify({
          searchTerm: searchTerm.value,
          statusFilter: statusFilter.value
        })
      );
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Tenants.vue]", uiErr?.message || uiErr);
  }
};

const debouncedSaveFilters = debounce(saveFilters, 250);

watch([searchTerm, statusFilter], debouncedSaveFilters);

onBeforeRouteLeave((to) => {
  if (!to.path.startsWith("/superadmin/tenants") && !to.path.startsWith("/superadmin/tenant-ledger")) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.removeItem(TENANTS_FILTER_KEY);
      }
    } catch (uiErr: any) {
      console.warn("[UI Component Warning: Tenants.vue]", uiErr?.message || uiErr);
    }
  }
});

const hasActiveFilters = computed(() => {
  return searchTerm.value.trim() !== "" || statusFilter.value !== "all";
});

const clearAllFilters = () => {
  searchTerm.value = "";
  statusFilter.value = "all";
  currentPage.value = 1;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.removeItem(TENANTS_FILTER_KEY);
    }
  } catch (uiErr: any) {
    console.warn("[UI Component Warning: Tenants.vue]", uiErr?.message || uiErr);
  }
};

const filteredTenants = computed(() => {
  let list = tenants.value.filter((t) => t.roleName !== "superadmin" && (t as any).role !== "superadmin");
  if (statusFilter.value !== "all") {
    list = list.filter((t) => t.status === statusFilter.value);
  }
  if (!searchTerm.value.trim()) return list;
  const q = searchTerm.value.toLowerCase();
  return list.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      (t.mobile && t.mobile.includes(q)) ||
      (t.planName && t.planName.toLowerCase().includes(q))
  );
});

// Reusable Persistent Pagination for 1,000+ Tenants
const perPageOptions = [10, 15, 25, 50, 100];
const filteredTenantsCount = computed(() => filteredTenants.value.length);
const {
  currentPage,
  itemsPerPage: perPage,
  totalPages,
  paginateList
} = usePagination("tenants", {
  defaultPerPage: 15,
  totalItems: filteredTenantsCount,
  syncUrl: false
});

const activeCount = computed(() => tenants.value.filter((t) => t.status === "active").length);
const suspendedCount = computed(() => tenants.value.filter((t) => t.status === "suspended").length);

const startIndex = computed(() => (currentPage.value - 1) * perPage.value);
const endIndex = computed(() => Math.min(startIndex.value + perPage.value, filteredTenants.value.length));
const paginatedTenants = computed(() => paginateList(filteredTenants.value));

watch([searchTerm, statusFilter, perPage], () => {
  currentPage.value = 1;
});

const openLedgerTab = (t: Tenant) => {
  const routeData = router.resolve({
    name: "superadmin-tenant-ledger",
    params: { id: t.id }
  });
  window.open(routeData.href, "_blank");
};

const handleApprove = async (p: PendingSignup) => {
  isSubmittingAction.value = true;
  try {
    const rawDays = approveDays.value[p.id];
    const days = rawDays && Number(rawDays) > 0 ? Number(rawDays) : undefined;
    await approveSignup(p.id, days);
    delete approveDays.value[p.id];
  } catch (e: any) {
    const err = e?.response?.data?.error;
    const msg = typeof err === "string" ? err : e?.response?.data?.message || e?.message || "Approval failed";
    alert(msg);
  } finally {
    isSubmittingAction.value = false;
  }
};

const handleReject = async (p: PendingSignup) => {
  if (!confirm(`Are you sure you want to reject and delete registration for "${p.name}"?`)) return;
  isSubmittingAction.value = true;
  try {
    await rejectSignup(p.id);
  } catch (e: any) {
    const err = e?.response?.data?.error;
    const msg = typeof err === "string" ? err : e?.response?.data?.message || e?.message || "Rejection failed";
    alert(msg);
  } finally {
    isSubmittingAction.value = false;
  }
};

const handleApproveRechargeAction = async (txId: number) => {
  isSubmittingAction.value = true;
  try {
    const res = await approveRecharge(txId);
    if (res?.message) {
      alert(res.message);
    }
  } catch (e: any) {
    alert(e?.response?.data?.message || "Failed to approve recharge");
  } finally {
    isSubmittingAction.value = false;
  }
};

const handleRejectRechargeAction = async (txId: number) => {
  if (!confirm("Are you sure you want to reject this recharge request?")) return;
  isSubmittingAction.value = true;
  try {
    await rejectRecharge(txId);
  } catch (e: any) {
    alert(e?.response?.data?.message || "Failed to reject recharge");
  } finally {
    isSubmittingAction.value = false;
  }
};

const openExtendModal = (t: Tenant) => {
  selectedTenant.value = t;
  showExtendModal.value = true;
};

const handleConfirmExtend = async (days: number = 30) => {
  if (!selectedTenant.value || days < 1) return;
  isSubmittingAction.value = true;
  try {
    await extendTenant(selectedTenant.value.id, days);
    showExtendModal.value = false;
    selectedTenant.value = null;
  } catch (e: any) {
    alert(e?.response?.data?.error || "Failed to extend subscription");
  } finally {
    isSubmittingAction.value = false;
  }
};

const handleToggleStatus = async (t: Tenant) => {
  const actionText = t.status === "active" ? "suspend" : "activate";
  if (!confirm(`Are you sure you want to ${actionText} tenant "${t.name}"?`)) return;
  try {
    await toggleTenantStatus(t.id);
  } catch (e: any) {
    alert(e?.response?.data?.error || "Failed to toggle status");
  }
};

const handleDeleteTenant = async (t: Tenant) => {
  if (!confirm(`Are you sure you want to permanently delete tenant "${t.name}"? This action cannot be undone.`)) return;
  isSubmittingAction.value = true;
  try {
    await deleteTenant(t.id);
  } catch (e: any) {
    alert(e?.response?.data?.error || "Failed to delete tenant");
  } finally {
    isSubmittingAction.value = false;
  }
};

const getDaysRemaining = (expDate?: string) => {
  if (!expDate) return { text: "Pending Activation", badgeClass: "bg-warning text-dark fw-semibold" };
  const exp = new Date(expDate);
  const now = new Date();
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `Expired (${Math.abs(diffDays)}d ago)`, badgeClass: "bg-danger text-white" };
  } else if (diffDays <= 7) {
    return { text: `${diffDays} days left`, badgeClass: "bg-warning text-dark" };
  } else {
    return { text: `${diffDays} days left`, badgeClass: "bg-success text-white" };
  }
};

const extractRawTrxId = (trx?: string) => {
  if (!trx) return "N/A";
  return trx.replace(/\s*\((monthly|yearly|m|y)\)/gi, "").trim();
};

const getBillingCycleText = (trx?: string, cycle?: string) => {
  if (cycle) return cycle === "yearly" ? "Yearly" : "Monthly";
  if (!trx) return "Monthly";
  const lower = trx.toLowerCase();
  if (lower.includes("yearly") || lower.includes("(y)")) {
    return "Yearly";
  }
  return "Monthly";
};

const handleRealtimeSignup = () => {
  fetchPendingSignups();
  fetchPendingRecharges();
  fetchTenants();
};

onMounted(async () => {
  await Promise.all([fetchTenants(), fetchPendingSignups(), fetchPendingRecharges()]);
  // Listeners are socket-scoped; registering the same event on two channels
  // would run the handler twice (the socket already auto-joins role rooms).
  pulse.channel("auth").listen("tenant:signup", handleRealtimeSignup);
  pulse.channel("auth").listen("tenant:recharge", handleRealtimeSignup);
});

onUnmounted(() => {
  pulse.channel("auth").stopListening("tenant:signup", handleRealtimeSignup);
  pulse.channel("auth").stopListening("tenant:recharge", handleRealtimeSignup);
});
</script>

<template>
  <div class="tenants-page py-2">
    <!-- Header -->
    <div class="d-flex align-items-center justify-content-between mb-4">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">Tenants</span>
        </div>
        <h4 class="text-white fw-bold mb-0">Tenants & Admin Approvals</h4>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-secondary btn-sm" @click="fetchTenants(); fetchPendingSignups(); fetchPendingRecharges();">
          <i class="bi bi-arrow-clockwise me-1"></i> Refresh
        </button>
      </div>
    </div>

    <!-- 0. PENDING WALLET RECHARGES & STORAGE REQUESTS QUEUE -->
    <PendingRechargesCard
      :pending-recharges="pendingRecharges"
      :is-submitting-action="isSubmittingAction"
      @approve="handleApproveRechargeAction"
      @reject="handleRejectRechargeAction"
    />

    <!-- 1. PENDING REGISTRATIONS QUEUE -->
    <PendingSignupsCard
      :pending-signups="pendingSignups"
      :is-submitting-action="isSubmittingAction"
      @approve="handleApprove"
      @reject="handleReject"
    />

    <!-- 2. ORGANIZATION TENANTS DIRECTORY -->
    <div class="table-card shadow-sm mb-4">
      <div class="p-3 border-bottom border-secondary border-opacity-50 d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3" style="background: #181b1f;">
        <div class="d-flex align-items-center gap-2.5">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-buildings text-primary fs-5"></i>
            <h6 class="text-white fw-bold mb-0">Organization Tenants</h6>
          </div>
          <span class="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25 px-2.5 py-1 fw-bold rounded-pill">
            {{ filteredTenants.length }} Found
          </span>
          <span v-if="suspendedCount > 0" class="badge bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25 px-2.5 py-1 fw-bold rounded-pill">
            {{ suspendedCount }} Suspended
          </span>
        </div>

        <div class="d-flex align-items-center gap-3 flex-nowrap">
          <!-- Status Filter Tabs (Modern Segmented Pill Control) -->
          <div class="d-inline-flex align-items-center p-1 rounded-3" style="background-color: #121417; border: 1px solid #2d3239;">
            <button
              type="button"
              class="btn btn-sm py-1 px-3 rounded-2 text-nowrap fw-semibold transition-all"
              style="font-size: 0.82rem;"
              :class="statusFilter === 'all' ? 'btn-primary shadow-sm' : 'text-light border-0 bg-transparent opacity-75'"
              @click="statusFilter = 'all'"
            >
              All <span class="opacity-75">({{ tenants.length }})</span>
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-3 rounded-2 text-nowrap fw-semibold transition-all"
              style="font-size: 0.82rem;"
              :class="statusFilter === 'active' ? 'btn-success shadow-sm' : 'text-light border-0 bg-transparent opacity-75'"
              @click="statusFilter = 'active'"
            >
              Active <span class="opacity-75">({{ activeCount }})</span>
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-3 rounded-2 text-nowrap fw-semibold transition-all"
              style="font-size: 0.82rem;"
              :class="statusFilter === 'suspended' ? 'btn-danger shadow-sm' : 'text-light border-0 bg-transparent opacity-75'"
              @click="statusFilter = 'suspended'"
            >
              Suspended <span class="opacity-75">({{ suspendedCount }})</span>
            </button>
          </div>

          <!-- Search Box -->
          <SearchInput
            v-model="searchTerm"
            placeholder="Search tenant or email..."
            max-width="280px"
            min-width="200px"
          />

          <!-- Clear Filter Icon Button -->
          <button
            v-if="hasActiveFilters"
            type="button"
            class="btn btn-outline-danger btn-sm px-2 d-flex align-items-center justify-content-center"
            title="Clear all filters"
            style="height: 38px;"
            @click="clearAllFilters"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table-custom mb-0">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Organization Tenant</th>
              <th>Contact Details</th>
              <th>Plan & Limit</th>
              <th>Advance Credit</th>
              <th>Managed Clients</th>
              <th>Subscription Expiry</th>
              <th>Status</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoadingTenants">
              <td colspan="9" class="text-center py-5 text-muted">
                <span class="spinner-border spinner-border-sm text-primary me-2"></span>
                Loading tenants database...
              </td>
            </tr>
            <tr v-else-if="filteredTenants.length === 0">
              <td colspan="9" class="text-center py-5 text-muted">
                No tenants matching your search or filter.
              </td>
            </tr>
            <tr
              v-for="(t, idx) in paginatedTenants"
              :key="t.id"
              class="tenant-row"
              title="Click row to open dedicated payment ledger in new tab"
              @click="openLedgerTab(t)"
            >
              <td class="text-muted small">{{ startIndex + idx + 1 }}</td>
              <td>
                <div class="fw-bold text-white fs-6 d-flex align-items-center gap-1.5">
                  {{ t.name }}
                  <i class="bi bi-box-arrow-up-right text-muted small opacity-50" title="Open full statement ledger"></i>
                </div>
                <div class="text-muted small">Tenant ID: #{{ t.id }}</div>
              </td>
              <td>
                <div class="text-light">{{ t.email }}</div>
                <div class="text-muted small font-monospace">{{ t.mobile || '—' }}</div>
              </td>
              <td>
                <div class="text-light">{{ t.planName || 'Standard Plan' }}</div>
                <div class="text-muted small">Max {{ t.planMaxUsers || 5 }} Sub-users</div>
              </td>
              <td>
                <span
                  v-if="t.advanceBalance && t.advanceBalance > 0"
                  class="badge bg-success text-white px-2.5 py-1.5 fw-bold font-monospace shadow-sm d-inline-flex align-items-center"
                  title="Click to view statement ledger"
                >
                  <i class="bi bi-wallet2 me-1"></i> ৳ {{ Number(t.advanceBalance).toLocaleString() }}
                </span>
                <span
                  v-else
                  class="badge bg-dark border border-secondary text-muted px-2.5 py-1 font-monospace d-inline-flex align-items-center"
                  title="Click to view statement ledger"
                >
                  ৳ 0
                </span>
              </td>
              <td>
                <span class="badge bg-secondary bg-opacity-50 text-light px-2.5 py-1">
                  {{ t.clientsCount || 0 }} Clients
                </span>
              </td>
              <td>
                <div class="d-flex flex-column gap-1">
                  <span class="text-light small font-monospace">
                    {{ t.expDate ? t.expDate.slice(0, 10) : '—' }}
                  </span>
                  <span class="badge rounded-pill px-2 py-0.5 small" :class="getDaysRemaining(t.expDate).badgeClass" style="width: fit-content;">
                    {{ getDaysRemaining(t.expDate).text }}
                  </span>
                </div>
              </td>
              <td @click.stop>
                <div
                  class="d-inline-flex align-items-center status-toggle-wrapper"
                  role="button"
                  :title="t.status === 'active' ? 'Active: Click to Suspend' : 'Suspended: Click to Activate'"
                  @click="handleToggleStatus(t)"
                >
                  <div
                    class="custom-switch"
                    :class="t.status === 'active' ? 'switch-on' : 'switch-off'"
                  >
                    <div class="switch-handle"></div>
                  </div>
                </div>
              </td>
              <td class="text-end" @click.stop>
                <div class="d-flex gap-1.5 justify-content-end align-items-center">
                  <button
                    class="btn btn-sm btn-outline-info uniform-icon-btn d-inline-flex align-items-center justify-content-center"
                    title="Open Full-Page Payment Ledger"
                    @click="openLedgerTab(t)"
                  >
                    <i class="bi bi-clock-history"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-light uniform-icon-btn d-inline-flex align-items-center justify-content-center"
                    title="Extend Subscription"
                    @click="openExtendModal(t)"
                  >
                    <i class="bi bi-calendar-plus"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger uniform-icon-btn d-inline-flex align-items-center justify-content-center"
                    title="Delete Tenant Permanently"
                    :disabled="isSubmittingAction"
                    @click="handleDeleteTenant(t)"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer for 1000+ Tenants -->
      <div v-if="filteredTenants.length > 0" class="p-3 border-top border-secondary d-flex flex-column flex-sm-row justify-content-between align-items-center gap-3" style="background: #181b1f;">
        <div class="text-muted small">
          Showing <span class="text-white fw-bold">{{ startIndex + 1 }}</span> to <span class="text-white fw-bold">{{ endIndex }}</span> of <span class="text-white fw-bold">{{ filteredTenants.length }}</span> tenants
        </div>

        <div class="d-flex align-items-center gap-3">
          <!-- Rows Per Page -->
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted small text-nowrap">Rows per page:</span>
            <select v-model="perPage" class="form-select form-select-sm idp-select" style="width: 75px;">
              <option v-for="opt in perPageOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>

          <!-- Page Navigation -->
          <div v-if="totalPages > 1" class="d-flex align-items-center gap-1">
            <button
              type="button"
              class="btn btn-dark border-secondary btn-sm"
              :disabled="currentPage <= 1"
              @click="currentPage--"
            >
              <i class="bi bi-chevron-left"></i> Prev
            </button>

            <template v-for="p in totalPages" :key="p">
              <button
                v-if="p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)"
                type="button"
                class="btn btn-sm"
                :class="currentPage === p ? 'btn-primary' : 'btn-dark border-secondary text-muted'"
                style="min-width: 32px;"
                @click="currentPage = p"
              >
                {{ p }}
              </button>
              <span
                v-else-if="p === currentPage - 3 || p === currentPage + 3"
                class="text-muted px-1"
              >
                ...
              </span>
            </template>

            <button
              type="button"
              class="btn btn-dark border-secondary btn-sm"
              :disabled="currentPage >= totalPages"
              @click="currentPage++"
            >
              Next <i class="bi bi-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>


    <!-- EXTEND SUBSCRIPTION MODAL -->
    <ExtendSubscriptionModal
      :show="showExtendModal"
      :tenant="selectedTenant"
      :is-submitting="isSubmittingAction"
      @close="showExtendModal = false"
      @confirm="handleConfirmExtend"
    />
  </div>
</template>

<style scoped>
.tenants-page {
  font-family: 'Inter', sans-serif;
}

.table-card {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  overflow: hidden;
}

.table-custom {
  width: 100%;
  border-collapse: collapse;
}

.table-custom thead th {
  background: #181b1f;
  color: #adb5bd;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #343a40;
  white-space: nowrap;
}

.table-custom tbody td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #2a3038;
  vertical-align: middle;
  white-space: nowrap;
}

.tenant-row {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.tenant-row:hover td {
  background-color: #242930;
}

.search-box {
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #6c757d;
  pointer-events: none;
  font-size: 0.8rem;
}

.idp-search-input {
  background-color: #181b1f !important;
  border: 1px solid #3b424b !important;
  color: #f8f9fa !important;
  padding-left: 34px !important;
  padding-right: 28px !important;
  border-radius: 6px;
  font-size: 0.85rem;
}

.idp-search-input:focus {
  border-color: #0d6efd !important;
  box-shadow: 0 0 0 0.15rem rgba(13, 110, 253, 0.25) !important;
}

.idp-select {
  background-color: #181b1f !important;
  border: 1px solid #3b424b !important;
  color: #f8f9fa !important;
  border-radius: 6px;
}

.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #6c757d;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 0.85rem;
}

.clear-btn:hover {
  color: #f8f9fa;
}

.uniform-icon-btn {
  height: 32px;
  width: 32px;
  padding: 0;
  border-radius: 6px;
  font-size: 0.9rem;
}

/* Status Switch Toggle */
.status-toggle-wrapper {
  cursor: pointer;
  user-select: none;
  padding: 4px 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
}
.status-toggle-wrapper:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

.custom-switch {
  width: 38px;
  height: 20px;
  border-radius: 10px;
  position: relative;
  transition: background-color 0.25s ease, box-shadow 0.25s ease;
  flex-shrink: 0;
}

.custom-switch.switch-on {
  background-color: #198754;
  box-shadow: 0 0 6px rgba(25, 135, 84, 0.4);
}

.custom-switch.switch-off {
  background-color: #dc3545;
  box-shadow: 0 0 6px rgba(220, 53, 69, 0.4);
}

.switch-handle {
  width: 14px;
  height: 14px;
  background-color: #ffffff;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.custom-switch.switch-on .switch-handle {
  transform: translateX(18px);
}

.custom-switch.switch-off .switch-handle {
  transform: translateX(0);
}
</style>
