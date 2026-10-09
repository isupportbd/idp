<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";

export type OptionItem = {
  value: string | number | null;
  label: string;
  badge?: string;
  icon?: string;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    options: (OptionItem | string | number)[];
    placeholder?: string;
    disabled?: boolean;
    minWidth?: string;
    width?: string;
    height?: string;
    size?: "sm" | "md" | "lg";
    icon?: string;
  }>(),
  {
    modelValue: null,
    placeholder: "Select...",
    disabled: false,
    minWidth: "140px",
    width: "auto",
    height: "38px",
    size: "md",
    icon: ""
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string | number | null): void;
  (e: "change", value: string | number | null): void;
}>();

const isOpen = ref(false);
const selectRef = ref<HTMLElement | null>(null);

// Normalize options to OptionItem[]
const normalizedOptions = computed<OptionItem[]>(() => {
  return props.options.map((opt) => {
    if (typeof opt === "object" && opt !== null) {
      return opt as OptionItem;
    }
    return {
      value: opt,
      label: String(opt)
    };
  });
});

const selectedOption = computed(() => {
  return normalizedOptions.value.find((opt) => String(opt.value) === String(props.modelValue)) || null;
});

const displayText = computed(() => {
  if (selectedOption.value) {
    return selectedOption.value.label;
  }
  return props.placeholder;
});

const toggleDropdown = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
};

const selectOption = (opt: OptionItem) => {
  if (opt.disabled) return;
  emit("update:modelValue", opt.value);
  emit("change", opt.value);
  isOpen.value = false;
};

const handleClickOutside = (e: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (props.disabled) return;
  if (e.key === "Escape") {
    isOpen.value = false;
  } else if (e.key === "ArrowDown" || e.key === "Enter") {
    if (!isOpen.value) {
      isOpen.value = true;
      e.preventDefault();
    }
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <div
    ref="selectRef"
    class="idp-custom-select-wrapper"
    :class="{ 'is-open': isOpen, 'is-disabled': disabled, [`size-${size}`]: true }"
    :style="{ minWidth, width }"
    @keydown="handleKeyDown"
  >
    <!-- Trigger Button -->
    <div
      tabindex="0"
      class="idp-custom-select-trigger"
      :style="{ height }"
      @click="toggleDropdown"
    >
      <i v-if="icon" :class="[icon, 'select-leading-icon']"></i>
      <span class="select-label text-truncate" :class="{ 'text-muted': !selectedOption }">
        {{ displayText }}
      </span>
      <i class="bi bi-chevron-down select-chevron" :class="{ 'rotate-180': isOpen }"></i>
    </div>

    <!-- Dropdown Menu -->
    <transition name="dropdown-fade">
      <div v-if="isOpen" class="idp-custom-select-menu shadow-lg">
        <div class="menu-inner custom-scrollbar">
          <div
            v-for="opt in normalizedOptions"
            :key="String(opt.value)"
            class="idp-custom-select-option"
            :class="{
              'is-active': String(opt.value) === String(modelValue),
              'is-disabled': opt.disabled
            }"
            @click.stop="selectOption(opt)"
          >
            <div class="d-flex align-items-center justify-content-between gap-2 w-100">
              <div class="d-flex align-items-center gap-2 text-truncate">
                <i v-if="opt.icon" :class="[opt.icon, 'text-muted small']"></i>
                <span class="option-text text-truncate">{{ opt.label }}</span>
              </div>
              <span v-if="opt.badge" class="badge bg-secondary bg-opacity-25 text-light small px-1.5 py-0.5">
                {{ opt.badge }}
              </span>
              <i
                v-if="String(opt.value) === String(modelValue)"
                class="bi bi-check2 text-primary fw-bold ms-auto flex-shrink-0"
              ></i>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.idp-custom-select-wrapper {
  position: relative;
  display: inline-block;
  user-select: none;
  font-family: inherit;
  vertical-align: middle;
}

.idp-custom-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background-color: #15181c;
  border: 1px solid #343a40;
  border-radius: 6px;
  padding: 0 12px;
  color: #f8f9fa;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
  box-sizing: border-box;
}

.idp-custom-select-trigger:hover {
  background-color: #1a1e23;
  border-color: #495057;
}

.idp-custom-select-wrapper.is-open .idp-custom-select-trigger,
.idp-custom-select-trigger:focus {
  border-color: #3b8eed;
  background-color: #1a1e23;
  box-shadow: 0 0 0 2px rgba(59, 142, 237, 0.2);
}

.idp-custom-select-wrapper.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}

.select-leading-icon {
  font-size: 0.9rem;
  color: #6c757d;
  flex-shrink: 0;
}

.select-label {
  flex-grow: 1;
  text-align: left;
  line-height: 1.2;
}

.select-chevron {
  font-size: 0.72rem;
  color: #adb5bd;
  transition: transform 0.18s ease;
  flex-shrink: 0;
  margin-left: 2px;
}

.select-chevron.rotate-180 {
  transform: rotate(180deg);
}

/* Dropdown Menu Popup */
.idp-custom-select-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: 340px;
  z-index: 1050;
  background-color: #1e2227;
  border: 1px solid #3b424b;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.menu-inner {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
}

/* Option Items */
.idp-custom-select-option {
  padding: 8px 12px;
  font-size: 0.84rem;
  color: #e9ecef;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.idp-custom-select-option:hover {
  background-color: #2c3238;
  color: #ffffff;
}

.idp-custom-select-option.is-active {
  background-color: #272d34;
  color: #3b8eed;
  font-weight: 600;
}

.idp-custom-select-option.is-active:hover {
  background-color: #2e353e;
  color: #4da3ff;
}

.idp-custom-select-option.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* Scrollbar styling */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #1e2227;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #3b424b;
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #4e5763;
}

/* Transitions */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
