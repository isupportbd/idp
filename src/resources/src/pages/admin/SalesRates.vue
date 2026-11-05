<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import axios from "axios";
import { usePagination } from "@/composables/usePagination";
import { can } from "@/composables/useAuth";
import { usePulseListener } from "@/composables/usePulseListener";
import SalesRatesToolbar from "./sales-rates/SalesRatesToolbar.vue";
import SalesRatesTable from "./sales-rates/SalesRatesTable.vue";
import type {
  SalesRate,
  ClientOption,
  ItemOption,
  UnitOption
} from "./sales-rates/types";
import SalesRateModal from "./sales-rates/SalesRateModal.vue";
import RateHistoryModal from "./sales-rates/RateHistoryModal.vue";

// Master Clients
const clientsList = ref<ClientOption[]>([]);

// Master Items for table filtering
const itemsList = ref<ItemOption[]>([]);

// Selected Client's Purchased Items ONLY (Dynamically fetched per client)
const clientPurchasedItems = ref<ItemOption[]>([]);
const isFetchingClientItems = ref(false);

// Units
const unitsList = ref<UnitOption[]>([]);

// Master Sales Rates Database
const salesRates = ref<SalesRate[]>([]);

const clientOptions = computed(() => [
  { value: "", label: "All Clients" },
  ...clientsList.value.map((c: ClientOption) => ({ value: String(c.id), label: c.name }))
]);

const itemOptions = computed(() => [
  { value: "", label: "All Commodity Items" },
  ...itemsList.value.map((i: ItemOption) => ({ value: String(i.id), label: `${i.name} (${i.hsCode || '—'})` }))
]);

const statusOptions = [
  { value: "", label: "All Status" },
  { value: "Active", label: "Active Only" },
  { value: "Frozen", label: "Frozen Only" }
];

const SALES_RATES_FILTER_KEY = "idp_sales_rates_filters";

const getSavedFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = sessionStorage.getItem(SALES_RATES_FILTER_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (uiErr: any) { console.warn("[UI Component Warning: SalesRates.vue]", uiErr?.message || uiErr); }
  return {};
};

const savedFilters = getSavedFilters();

// Filters State
const searchQuery = ref(savedFilters.searchQuery || "");
const selectedClient = ref(savedFilters.selectedClient || "");
const selectedItem = ref(savedFilters.selectedItem || "");
const selectedStatus = ref(savedFilters.selectedStatus || "");
const isLoading = ref(false);

const saveFilters = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(
        SALES_RATES_FILTER_KEY,
        JSON.stringify({
          searchQuery: searchQuery.value,
          selectedClient: selectedClient.value,
          selectedItem: selectedItem.value,
          selectedStatus: selectedStatus.value
        })
      );
    }
  } catch (uiErr: any) { console.warn("[UI Component Warning: SalesRates.vue]", uiErr?.message || uiErr); }
};

watch([searchQuery, selectedClient, selectedItem, selectedStatus], saveFilters);

onBeforeRouteLeave((to) => {
  if (!to.path.startsWith("/admin/sales-rates")) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        sessionStorage.removeItem(SALES_RATES_FILTER_KEY);
      }
    } catch (uiErr: any) { console.warn("[UI Component Warning: SalesRates.vue]", uiErr?.message || uiErr); }
  }
});

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value.trim() !== "" ||
    selectedClient.value !== "" ||
    selectedItem.value !== "" ||
    selectedStatus.value !== ""
  );
});

const clearAllFilters = () => {
  searchQuery.value = "";
  selectedClient.value = "";
  selectedItem.value = "";
  selectedStatus.value = "";
  currentPage.value = 1;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.removeItem(SALES_RATES_FILTER_KEY);
    }
  } catch (uiErr: any) { console.warn("[UI Component Warning: SalesRates.vue]", uiErr?.message || uiErr); }
};

// Filtered Rates for Table
const filteredRates = computed(() => {
  let list = salesRates.value;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        r.clientBin.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q) ||
        r.itemHsCode.toLowerCase().includes(q) ||
        r.unitName.toLowerCase().includes(q)
    );
  }

  if (selectedClient.value) {
    const cId = Number(selectedClient.value);
    list = list.filter((r) => r.clientId === cId);
  }

  if (selectedItem.value) {
    const iId = Number(selectedItem.value);
    list = list.filter((r) => r.itemId === iId);
  }

  if (selectedStatus.value) {
    list = list.filter((r) => r.status === selectedStatus.value);
  }

  return list;
});

// Pagination
const filteredRatesCount = computed(() => filteredRates.value.length);
const { currentPage, itemsPerPage, totalPages, paginateList } = usePagination("sales_rates", {
  defaultPerPage: 10,
  totalItems: filteredRatesCount
});

const paginatedRates = computed(() => paginateList(filteredRates.value));

watch([searchQuery, selectedClient, selectedItem, selectedStatus, itemsPerPage], () => {
  currentPage.value = 1;
});

// Modal State
const showModal = ref(false);
const isEditing = ref(false);
const formError = ref("");
const isSubmitting = ref(false);

const getDefaultActivationDate = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
};

const modalInitialData = ref({
  id: 0,
  clientId: "" as string | number,
  itemId: "" as string | number,
  unitId: 1,
  salesRate: "" as string | number,
  vatRate: 15.00,
  additionPercent: 36.00,
  activationDate: getDefaultActivationDate(),
  status: "Active" as "Active" | "Frozen",
  clientName: "",
  itemName: ""
});

// Rate History Modal State
const showHistoryModal = ref(false);
const historyClientItem = ref<{ clientName: string; itemName: string; records: SalesRate[] }>({
  clientName: "",
  itemName: "",
  records: []
});

const fetchMasterData = async () => {
  try {
    const [cRes, iRes, uRes] = await Promise.allSettled([
      axios.get("/api/clients", { params: { limit: 1000, isActive: "all" } }),
      axios.get("/api/items", { params: { limit: 1000 } }),
      axios.get("/api/superadmin/unit-conversions", { params: { all: "true" } })
    ]);
    if (cRes.status === "fulfilled" && cRes.value.data?.data) {
      clientsList.value = cRes.value.data.data.map((c: any) => ({
        id: c.id,
        name: c.companyName || c.name,
        bin: c.binNumber || c.bin || ""
      }));
    }
    if (iRes.status === "fulfilled" && iRes.value.data?.data) {
      itemsList.value = iRes.value.data.data.map((i: any) => ({
        id: i.id,
        name: i.itemName || i.name,
        hsCode: i.hsCode || ""
      }));
    }
    if (uRes.status === "fulfilled" && uRes.value.data?.data) {
      unitsList.value = uRes.value.data.data.map((u: any) => ({
        id: u.id,
        purchaseUnit: u.purchaseUnit,
        salesUnit: u.salesUnit,
        factor: Number(u.factor || 1)
      }));
    }
  } catch (err) {
    console.error("Failed to load master data:", err);
  }
};

const fetchRates = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get("/api/sales-rates", { params: { limit: 1000 } });
    if (res.data?.success && Array.isArray(res.data?.data)) {
      salesRates.value = res.data.data;
    } else if (Array.isArray(res.data)) {
      salesRates.value = res.data;
    } else {
      salesRates.value = [];
    }
  } catch (e) {
    salesRates.value = [];
  } finally {
    isLoading.value = false;
  }
};

const fetchClientPurchasedItems = async (clientId: number | string) => {
  const cId = Number(clientId);
  if (!cId || isNaN(cId)) {
    clientPurchasedItems.value = [];
    return;
  }
  isFetchingClientItems.value = true;
  try {
    const res = await axios.get(`/api/clients/${cId}/items`);
    if (res.data?.data && Array.isArray(res.data.data)) {
      clientPurchasedItems.value = res.data.data.map((i: any) => ({
        id: i.id,
        name: i.name || i.itemName,
        hsCode: i.hsCode || ""
      }));
    } else {
      clientPurchasedItems.value = [];
    }
  } catch (err) {
    console.error("Failed to fetch client items:", err);
    clientPurchasedItems.value = [];
  } finally {
    isFetchingClientItems.value = false;
  }
};

const openAddModal = () => {
  isEditing.value = false;
  formError.value = "";
  clientPurchasedItems.value = [];

  modalInitialData.value = {
    id: 0,
    clientId: "",
    itemId: "",
    unitId: unitsList.value[0]?.id || 1,
    salesRate: "",
    vatRate: 15.00,
    additionPercent: 36.00,
    activationDate: getDefaultActivationDate(),
    status: "Active",
    clientName: "",
    itemName: ""
  };

  showModal.value = true;
};

const openEditModal = async (r: SalesRate) => {
  isEditing.value = true;
  formError.value = "";
  modalInitialData.value = {
    id: r.id,
    clientId: r.clientId,
    itemId: r.itemId,
    unitId: r.unitId,
    salesRate: r.salesRate,
    vatRate: r.vatRate,
    additionPercent: r.additionPercent,
    activationDate: r.activationDate,
    status: r.status,
    clientName: r.clientName,
    itemName: r.itemName
  };

  showModal.value = true;
  await fetchClientPurchasedItems(r.clientId);
};

const handleSaveRate = async (payload: any) => {
  if (!payload.clientId || !payload.itemId) {
    formError.value = "Please select both Client and Commodity Item.";
    return;
  }

  const numRate = Number(payload.salesRate);
  if (isNaN(numRate) || numRate <= 0) {
    formError.value = "Please enter a valid positive Sales Rate.";
    return;
  }

  const numVat = Number(payload.vatRate);
  if (isNaN(numVat) || numVat < 0) {
    formError.value = "VAT Rate must be zero or a positive percentage.";
    return;
  }

  const selectedDate = new Date(payload.activationDate);
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  if (selectedDate > now) {
    formError.value = "Activation date cannot be in the future.";
    return;
  }

  isSubmitting.value = true;
  formError.value = "";

  try {
    const postData = {
      clientId: Number(payload.clientId),
      itemId: Number(payload.itemId),
      unitId: payload.unitId ? Number(payload.unitId) : null,
      salesRate: numRate,
      vatRate: numVat,
      additionPercent: Number(payload.additionPercent) || 0,
      activationDate: payload.activationDate,
      status: payload.status
    };

    if (isEditing.value && payload.id) {
      await axios.put(`/api/sales-rates/${payload.id}`, postData);
    } else {
      await axios.post("/api/sales-rates", postData);
    }

    await fetchRates();
    showModal.value = false;
  } catch (err: any) {
    console.error("Failed to save sales rate:", err);
    formError.value = err.response?.data?.message || err.message || "Failed to save sales rate.";
  } finally {
    isSubmitting.value = false;
  }
};

const handleDeleteRate = async (r: SalesRate) => {
  if (r.status === "Frozen") {
    alert("Frozen historical rates cannot be deleted directly.");
    return;
  }

  if (!confirm(`Are you sure you want to delete the sales rate for "${r.clientName}" - "${r.itemName}"?`)) {
    return;
  }

  try {
    await axios.delete(`/api/sales-rates/${r.id}`);
    await fetchRates();
  } catch (err: any) {
    console.error("Failed to delete sales rate:", err);
    alert(err.response?.data?.message || "Failed to delete sales rate.");
  }
};

const viewRateHistory = async (r: SalesRate) => {
  try {
    const res = await axios.get("/api/sales-rates/history", {
      params: { clientId: r.clientId, itemId: r.itemId }
    });
    historyClientItem.value = {
      clientName: r.clientName,
      itemName: r.itemName,
      records: res.data?.data || []
    };
    showHistoryModal.value = true;
  } catch (err: any) {
    console.error("Failed to fetch rate history:", err);
    const records = salesRates.value.filter((x) => x.clientId === r.clientId && x.itemId === r.itemId);
    records.sort((a, b) => new Date(b.activationDate).getTime() - new Date(a.activationDate).getTime());
    historyClientItem.value = {
      clientName: r.clientName,
      itemName: r.itemName,
      records
    };
    showHistoryModal.value = true;
  }
};

usePulseListener("sales_rate:created", () => fetchRates());
usePulseListener("sales_rate:updated", () => fetchRates());
usePulseListener("sales_rate:deleted", () => fetchRates());

onMounted(async () => {
  await fetchMasterData();
  await fetchRates();
});
</script>

<template>
  <div class="py-2">
    <!-- Breadcrumbs & Header -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/" class="text-muted text-decoration-none small">
            <i class="bi bi-arrow-left me-1"></i> Dashboard
          </router-link>
          <span class="text-muted small">/</span>
          <span class="text-primary small fw-semibold">Sales Rates</span>
        </div>
        <h4 class="text-white fw-bold mb-0">Sales & VAT Rates</h4>
      </div>

      <button v-if="can('sales_rates.create')" class="btn btn-idp-primary btn-sm d-flex align-items-center gap-2" @click="openAddModal">
        <i class="bi bi-plus-lg"></i> Add Sales Rate
      </button>
    </div>

    <!-- Filter & Search Toolbar Subcomponent -->
    <SalesRatesToolbar
      :search-query="searchQuery"
      :selected-client="selectedClient"
      :selected-item="selectedItem"
      :selected-status="selectedStatus"
      :client-options="clientOptions"
      :item-options="itemOptions"
      :status-options="statusOptions"
      :items-per-page="itemsPerPage"
      :has-active-filters="hasActiveFilters"
      @update:search-query="searchQuery = $event"
      @update:selected-client="selectedClient = $event"
      @update:selected-item="selectedItem = $event"
      @update:selected-status="selectedStatus = $event"
      @update:items-per-page="itemsPerPage = $event"
      @clear-filters="clearAllFilters"
    />

    <!-- Table Subcomponent -->
    <SalesRatesTable
      :rates="paginatedRates"
      :is-loading="isLoading"
      :current-page="currentPage"
      :items-per-page="itemsPerPage"
      :total-filtered="filteredRatesCount"
      :total-pages="totalPages"
      @update:current-page="currentPage = $event"
      @edit="openEditModal"
      @history="viewRateHistory"
      @delete="handleDeleteRate"
    />

    <!-- Modal: Add / Edit Sales Rate Subcomponent -->
    <SalesRateModal
      v-if="showModal"
      :is-editing="isEditing"
      :initial-data="modalInitialData"
      :clients-list="clientsList"
      :units-list="unitsList"
      :client-purchased-items="clientPurchasedItems"
      :is-fetching-client-items="isFetchingClientItems"
      :form-error="formError"
      :is-submitting="isSubmitting"
      @client-selected="fetchClientPurchasedItems($event.id)"
      @save="handleSaveRate"
      @close="showModal = false"
    />

    <!-- Modal: Rate History Timeline Subcomponent -->
    <RateHistoryModal
      v-if="showHistoryModal"
      :history-client-item="historyClientItem"
      @close="showHistoryModal = false"
    />
  </div>
</template>
