<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";

export interface ServiceItemOption {
  id: number;
  name?: string;
  itemName?: string;
}

const props = withDefaults(
  defineProps<{
    items?: ServiceItemOption[];
    modelValue?: number | string | null;
    placeholder?: string;
    disabled?: boolean;
    minChars?: number;
  }>(),
  {
    items: () => [],
    modelValue: null,
    placeholder: "Type to search Service Item...",
    disabled: false,
    minChars: 1
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", id: number | string | null): void;
  (e: "select", item: ServiceItemOption | null): void;
}>();

const searchText = ref("");
const isDropdownOpen = ref(false);
const selectedItem = ref<ServiceItemOption | null>(null);
const activeIndex = ref<number>(-1);
const dropdownRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

const getItemLabel = (item: ServiceItemOption): string => {
  return item.itemName || item.name || String(item.id);
};

const displayList = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q || props.modelValue != null) return [];
  if (q.length < props.minChars) return [];

  const items = Array.isArray(props.items) ? props.items : [];
  const filtered = items.filter((item) => {
    const label = getItemLabel(item).toLowerCase();
    return label.includes(q);
  });

  return filtered.slice(0, 50);
});

const selectItem = (item: ServiceItemOption) => {
  selectedItem.value = item;
  searchText.value = getItemLabel(item);
  isDropdownOpen.value = false;
  activeIndex.value = -1;
  emit("update:modelValue", item.id);
  emit("select", item);
};

const clearSelection = () => {
  selectedItem.value = null;
  searchText.value = "";
  isDropdownOpen.value = false;
  activeIndex.value = -1;
  emit("update:modelValue", null);
  emit("select", null);
  inputRef.value?.focus();
};

const onInput = () => {
  activeIndex.value = -1;
  if (selectedItem.value) {
    selectedItem.value = null;
    emit("update:modelValue", null);
    emit("select", null);
  }
  const q = searchText.value.trim();
  isDropdownOpen.value = q.length >= props.minChars && displayList.value.length > 0;
};

const onFocus = () => {
  const q = searchText.value.trim();
  if (q.length >= props.minChars && displayList.value.length > 0) {
    isDropdownOpen.value = true;
  }
};

const onBlur = () => {
  setTimeout(() => {
    if (!dropdownRef.value?.contains(document.activeElement)) {
      isDropdownOpen.value = false;
      if (selectedItem.value) {
        searchText.value = getItemLabel(selectedItem.value);
      } else if (searchText.value.trim()) {
        // If user typed but didn't select, keep text; don't force selection
        // But close dropdown
        isDropdownOpen.value = false;
      }
    }
  }, 150);
};

const onKeyDown = (e: KeyboardEvent) => {
  if (!isDropdownOpen.value || displayList.value.length === 0) {
    if (e.key === "ArrowDown" && searchText.value.trim().length >= props.minChars) {
      isDropdownOpen.value = true;
    }
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % displayList.value.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + displayList.value.length) % displayList.value.length;
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeIndex.value >= 0 && displayList.value[activeIndex.value]) {
      selectItem(displayList.value[activeIndex.value]);
    }
  } else if (e.key === "Escape") {
    isDropdownOpen.value = false;
  }
};

const handleClickOutside = (event: MouseEvent) => {
  if (!dropdownRef.value?.contains(event.target as Node) && !inputRef.value?.contains(event.target as Node)) {
    isDropdownOpen.value = false;
    if (selectedItem.value) {
      searchText.value = getItemLabel(selectedItem.value);
    }
  }
};

watch(
  () => props.modelValue,
  (val) => {
    if (val == null) {
      selectedItem.value = null;
      searchText.value = "";
      return;
    }
    if (selectedItem.value && selectedItem.value.id === val) return;
    const found = (props.items || []).find((item) => item.id === val);
    if (found) {
      selectedItem.value = found;
      searchText.value = getItemLabel(found);
    }
  },
  { immediate: true }
);

watch(displayList, () => {
  if (searchText.value.trim().length >= props.minChars) {
    isDropdownOpen.value = displayList.value.length > 0;
  }
});

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <div ref="dropdownRef" class="service-item-search position-relative">
    <div class="input-wrapper position-relative">
      <i class="bi bi-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
      <input
        ref="inputRef"
        v-model="searchText"
        type="text"
        class="form-control idp-field search-input"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeyDown"
      />
      <button
        v-if="selectedItem || searchText"
        type="button"
        class="btn-clear text-muted border-0 bg-transparent p-0 position-absolute top-50 end-0 translate-middle-y me-3 d-flex align-items-center"
        title="Clear (Esc)"
        @mousedown.prevent="clearSelection"
        tabindex="-1"
      >
        <i class="bi bi-x-circle-fill text-secondary"></i>
      </button>
    </div>

    <!-- Dropdown Menu -->
    <div
      v-if="isDropdownOpen && displayList.length > 0"
      class="search-dropdown-menu shadow-lg position-absolute top-100 start-0 w-100 mt-1 p-1"
    >
      <div
        v-for="(item, idx) in displayList"
        :key="item.id"
        class="search-item px-3 py-2 rounded cursor-pointer"
        :class="{ 'search-item-active': idx === activeIndex }"
        @mousedown.prevent="selectItem(item)"
        @mouseenter="activeIndex = idx"
      >
        <div class="fw-semibold text-white text-truncate" style="font-size: 0.9rem;">
          {{ getItemLabel(item) }}
        </div>
      </div>
    </div>

    <div
      v-if="isDropdownOpen && searchText.trim().length >= minChars && displayList.length === 0"
      class="search-dropdown-menu shadow-lg position-absolute top-100 start-0 w-100 mt-1 p-3 text-center text-muted small"
    >
      <i class="bi bi-search me-1"></i> No matching service items found
    </div>
  </div>
</template>

<style scoped>
.service-item-search {
  position: relative;
  width: 100%;
}

.search-input {
  height: 38px !important;
  padding-left: 36px !important;
  padding-right: 36px !important;
  font-size: 0.88rem;
}

.search-dropdown-menu {
  z-index: 1150;
  max-height: 260px;
  overflow-y: auto;
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
  line-height: 1;
}

.btn-clear:hover i {
  color: #f8f9fa !important;
}
</style>
