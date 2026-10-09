<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import axios from "axios";

export interface ClientOption {
  id: number;
  name?: string;
  companyName?: string;
  proprietorName?: string | null;
  bin?: string;
  binNumber?: string;
  mobile?: string;
  vatServiceType?: string;
  vatUserId?: string;
  vatPassword?: string;
}

const props = withDefaults(
  defineProps<{
    clients?: ClientOption[];
    modelValue?: number | null;
    placeholder?: string;
    disabled?: boolean;
    showBinOnly?: boolean;
    remote?: boolean;
  }>(),
  {
    clients: () => [],
    modelValue: null,
    placeholder: "Type to search Client, BIN, Mobile, Proprietor...",
    disabled: false,
    showBinOnly: false,
    remote: true
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", id: number | null): void;
  (e: "select", client: ClientOption | null): void;
}>();

const searchText = ref("");
const isDropdownOpen = ref(false);
const isLoading = ref(false);
const remoteList = ref<ClientOption[]>([]);
const selectedClient = ref<ClientOption | null>(null);
const activeIndex = ref<number>(-1);
const dropdownRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

let debounceTimer: any = null;

// Combined list: local prop clients + remote results deduplicated (only when searching and unselected)
const displayList = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q || props.modelValue) return [];
  
  // 1. Filter local prop clients if provided
  let localFiltered: ClientOption[] = [];
  if (Array.isArray(props.clients) && props.clients.length > 0) {
    localFiltered = props.clients.filter((c) => {
      const name = (c.name || c.companyName || "").toLowerCase();
      const prop = (c.proprietorName || "").toLowerCase();
      const bin = (c.bin || c.binNumber || "").toLowerCase();
      const mobile = (c.mobile || "").toLowerCase();
      return name.includes(q) || prop.includes(q) || bin.includes(q) || mobile.includes(q);
    });
  }

  // 2. Combine with remote list avoiding duplicates
  const map = new Map<number, ClientOption>();
  for (const c of localFiltered) {
    if (c?.id) map.set(c.id, c);
  }
  for (const c of remoteList.value) {
    if (c?.id) map.set(c.id, c);
  }

  return Array.from(map.values()).slice(0, 30);
});

// Perform Server-Side Remote Search
const fetchRemoteClients = async (q: string) => {
  if (!props.remote) return;
  const trimmed = (q || "").trim();
  if (!trimmed) {
    remoteList.value = [];
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  try {
    const params: any = {
      limit: 25,
      isActive: "true",
      search: trimmed
    };
    const res = await axios.get("/api/clients", { params });
    const rawData = res.data?.data || [];
    remoteList.value = rawData.map((item: any) => ({
      id: item.id,
      companyName: item.companyName,
      name: item.companyName,
      proprietorName: item.proprietorName,
      binNumber: item.binNumber,
      bin: item.binNumber,
      mobile: item.mobile,
      vatServiceType: item.vatServiceType,
      vatUserId: item.vatUserId,
      vatPassword: item.vatPassword
    }));
  } catch (err) {
    // Graceful error fallback
    remoteList.value = [];
  } finally {
    isLoading.value = false;
  }
};

// Resolve selected client by ID (either from local list or via single API call)
const resolveClientById = async (id: number | null) => {
  if (!id) {
    selectedClient.value = null;
    searchText.value = "";
    return;
  }

  // 1. Check if already selected or in prop list / remote list
  if (selectedClient.value && selectedClient.value.id === id) {
    searchText.value = selectedClient.value.companyName || selectedClient.value.name || "";
    return;
  }

  const allKnown = [...(props.clients || []), ...remoteList.value];
  const found = allKnown.find((c) => c.id === id);
  if (found) {
    selectedClient.value = found;
    searchText.value = found.companyName || found.name || "";
    return;
  }

  // 2. Fetch single client details by ID from server
  try {
    const res = await axios.get(`/api/clients/${id}`);
    const cl = res.data?.data;
    if (cl) {
      const opt: ClientOption = {
        id: cl.id,
        companyName: cl.companyName,
        name: cl.companyName,
        proprietorName: cl.proprietorName,
        binNumber: cl.binNumber,
        bin: cl.binNumber,
        mobile: cl.mobile,
        vatServiceType: cl.vatServiceType,
        vatUserId: cl.vatUserId,
        vatPassword: cl.vatPassword
      };
      selectedClient.value = opt;
      searchText.value = opt.companyName || opt.name || "";
    }
  } catch {
    // If not found, keep empty
  }
};

watch(
  () => props.modelValue,
  (newId) => {
    resolveClientById(newId);
  },
  { immediate: true }
);

const onInput = () => {
  if (selectedClient.value && searchText.value !== (selectedClient.value.companyName || selectedClient.value.name)) {
    emit("update:modelValue", null);
    emit("select", null);
    selectedClient.value = null;
  }

  const query = searchText.value.trim();
  if (!query) {
    isDropdownOpen.value = false;
    remoteList.value = [];
    isLoading.value = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    return;
  }

  isDropdownOpen.value = true;
  activeIndex.value = -1;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchRemoteClients(searchText.value);
  }, 220);
};

const onFocus = () => {
  if (props.disabled) return;
  // Only show dropdown if the user has already typed a search query and has no confirmed selection
  if (searchText.value.trim().length > 0 && !props.modelValue) {
    isDropdownOpen.value = true;
  } else {
    isDropdownOpen.value = false;
  }
};

const selectItem = (c: ClientOption) => {
  selectedClient.value = c;
  searchText.value = c.companyName || c.name || "";
  isDropdownOpen.value = false;
  activeIndex.value = -1;
  emit("update:modelValue", c.id);
  emit("select", c);
};

const clearSelection = () => {
  searchText.value = "";
  selectedClient.value = null;
  remoteList.value = [];
  isDropdownOpen.value = false;
  activeIndex.value = -1;
  emit("update:modelValue", null);
  emit("select", null);
  inputRef.value?.focus();
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (!isDropdownOpen.value) {
    if ((e.key === "ArrowDown" || e.key === "Enter") && searchText.value.trim().length > 0 && !props.modelValue) {
      isDropdownOpen.value = true;
      if (displayList.value.length === 0) fetchRemoteClients(searchText.value);
    }
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (displayList.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % displayList.value.length;
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (displayList.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + displayList.value.length) % displayList.value.length;
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeIndex.value >= 0 && activeIndex.value < displayList.value.length) {
      selectItem(displayList.value[activeIndex.value]);
    }
  } else if (e.key === "Escape") {
    isDropdownOpen.value = false;
  }
};

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (dropdownRef.value && !dropdownRef.value.contains(target)) {
    isDropdownOpen.value = false;
    // If text was typed without selecting an item, revert to selected client or keep text
    if (!props.modelValue && selectedClient.value) {
      searchText.value = selectedClient.value.companyName || selectedClient.value.name || "";
    }
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<template>
  <div ref="dropdownRef" class="client-search-select position-relative">
    <div class="input-wrapper position-relative">
      <i class="bi bi-building position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
      <input
        ref="inputRef"
        v-model="searchText"
        type="text"
        class="form-control idp-input"
        :style="{
          paddingLeft: '38px !important',
          paddingRight: (searchText || isLoading) ? '38px !important' : '14px !important',
          height: '38px'
        }"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @focus="onFocus"
        @keydown="handleKeyDown"
      />

      <!-- Right loading indicator or clear button -->
      <div class="position-absolute top-50 end-0 translate-middle-y me-2 d-flex align-items-center">
        <span v-if="isLoading" class="spinner-border spinner-border-sm text-primary me-1" style="width: 14px; height: 14px;"></span>
        <button
          v-else-if="searchText && !disabled"
          type="button"
          class="btn-clear text-muted border-0 bg-transparent p-1 d-flex align-items-center"
          title="Clear (Esc)"
          @mousedown.prevent="clearSelection"
        >
          <i class="bi bi-x-circle-fill text-secondary"></i>
        </button>
      </div>
    </div>

    <!-- Dropdown Menu (Only shown when typing and unselected) -->
    <div
      v-if="isDropdownOpen && searchText.trim().length > 0 && !props.modelValue"
      class="search-dropdown-menu shadow-lg position-absolute top-100 start-0 w-100 mt-1 p-1"
      style="max-height: 260px; overflow-y: auto; z-index: 1150;"
    >
      <div v-if="isLoading && displayList.length === 0" class="p-3 text-center text-muted small">
        <span class="spinner-border spinner-border-sm text-primary me-2"></span>
        Searching clients...
      </div>

      <div v-else-if="displayList.length === 0" class="p-3 text-center text-muted small">
        <i class="bi bi-search me-1"></i> No matching clients found
      </div>

      <div
        v-for="(c, idx) in displayList"
        v-else
        :key="c.id"
        class="search-item px-3 py-2 rounded cursor-pointer"
        :class="{ 'search-item-active': activeIndex === idx || props.modelValue === c.id }"
        @mousedown.prevent="selectItem(c)"
      >
        <div class="fw-bold text-white text-truncate" style="font-size: 0.92rem;">
          {{ c.companyName || c.name }}
        </div>
        <div class="mt-0.5" style="font-size: 0.82rem;">
          <span class="text-info font-monospace fw-semibold">
            BIN: {{ c.bin || c.binNumber || "N/A" }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.client-search-select .search-dropdown-menu {
  background: #181b1f;
  border: 1px solid #343a40;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

.search-item {
  transition: background-color 0.15s ease;
}

.search-item:hover,
.search-item-active {
  background: #2a313a !important;
}

.cursor-pointer {
  cursor: pointer;
}

.btn-clear {
  cursor: pointer;
}
.btn-clear:hover i {
  color: #f8f9fa !important;
}
</style>
