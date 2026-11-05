<script setup lang="ts">
import { ref } from "vue";
import MonthNavigator from "@/components/MonthNavigator.vue";

const props = defineProps<{
  selectedMonth: string;
  selectedFile: File | null;
  fileName: string;
  fileSize: string;
  isRebate: boolean;
  isFfs: boolean;
  isProcessing: boolean;
}>();

const emit = defineEmits<{
  "update:selectedMonth": [val: string];
  "update:isRebate": [val: boolean];
  "update:isFfs": [val: boolean];
  "fileSelected": [file: File];
  "fileCleared": [];
  "process": [];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    emit("fileSelected", target.files[0]);
  }
};

const clearSelectedFile = (e?: Event) => {
  if (e) e.stopPropagation();
  if (fileInputRef.value) fileInputRef.value.value = "";
  emit("fileCleared");
};

const onRebateChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked;
  emit("update:isRebate", checked);
  if (checked) {
    emit("update:isFfs", false);
  }
};

const onFfsChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked;
  emit("update:isFfs", checked);
  if (checked) {
    emit("update:isRebate", false);
  }
};
</script>

<template>
  <div>
    <!-- Hidden Native File Input -->
    <input
      ref="fileInputRef"
      type="file"
      class="d-none"
      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
      @change="handleFileSelect"
    />

    <!-- TOP UPLOAD CARD -->
    <div class="idp-card p-3 mb-4">
      <div class="d-flex flex-wrap align-items-center gap-3">
        <!-- 1. Month Navigator -->
        <div class="flex-shrink-0" style="width: 210px;">
          <MonthNavigator
            :model-value="selectedMonth"
            @update:model-value="emit('update:selectedMonth', $event)"
          />
        </div>

        <!-- 2. 2-Segment Choose File Box -->
        <div
          class="choose-file-group d-flex align-items-center flex-grow-1"
          :class="{ 'has-file-active': selectedFile }"
        >
          <!-- Left Button Part -->
          <button
            type="button"
            class="choose-file-btn-part d-flex align-items-center gap-2 px-3 border-0 cursor-pointer"
            @click="triggerFileInput"
          >
            <i class="bi bi-cloud-arrow-up text-primary fs-5"></i>
            <span class="choose-file-title fw-semibold">Choose File</span>
          </button>

          <!-- Right Display Part -->
          <div class="choose-file-display-part flex-grow-1 px-3 d-flex align-items-center justify-content-between text-truncate">
            <span v-if="fileName" class="text-white small fw-medium text-truncate font-monospace">
              {{ fileName }} <span class="text-muted fw-normal">({{ fileSize }})</span>
            </span>
            <span v-else class="text-muted small">
              No file chosen
            </span>
            <button
              v-if="selectedFile"
              type="button"
              class="btn-close btn-close-white ms-2"
              style="font-size: 0.65rem;"
              title="Remove file"
              @click="clearSelectedFile"
            ></button>
          </div>
        </div>

        <!-- 3. Rebate Checkbox -->
        <div class="d-flex align-items-center gap-2 user-select-none flex-shrink-0">
          <input
            id="rebateCheck"
            :checked="isRebate"
            type="checkbox"
            class="form-check-input mt-0 cursor-pointer"
            @change="onRebateChange"
          />
          <label for="rebateCheck" class="text-white small fw-semibold mb-0 cursor-pointer">
            Rebate
          </label>
        </div>

        <!-- 4. FFS Checkbox -->
        <div class="d-flex align-items-center gap-2 user-select-none flex-shrink-0">
          <input
            id="ffsCheck"
            :checked="isFfs"
            type="checkbox"
            class="form-check-input mt-0 cursor-pointer"
            @change="onFfsChange"
          />
          <label for="ffsCheck" class="text-white small fw-semibold mb-0 cursor-pointer">
            FFS
          </label>
        </div>

        <!-- 5. Add to Temp Button -->
        <button
          class="btn btn-idp-primary px-4 fw-semibold d-flex align-items-center gap-2 flex-shrink-0"
          style="height: 38px;"
          :disabled="!selectedFile || isProcessing"
          @click="emit('process')"
        >
          <span v-if="isProcessing" class="spinner-border spinner-border-sm"></span>
          <i v-else class="bi bi-play-fill fs-5"></i>
          <span>{{ isProcessing ? "Processing..." : "Add to Temp" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.choose-file-group {
  background: #181b1f;
  border: 1px solid #3b424b;
  border-radius: 6px;
  height: 38px;
  overflow: hidden;
  user-select: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.choose-file-group.has-file-active {
  border-color: #3b8eed;
}

.choose-file-btn-part {
  background: rgba(255, 255, 255, 0.05);
  border-right: 1px solid #3b424b !important;
  height: 100%;
  flex-shrink: 0;
  cursor: pointer;
  outline: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.choose-file-btn-part:hover,
.choose-file-btn-part:focus-visible {
  background: rgba(59, 142, 237, 0.2);
}

.choose-file-btn-part:active {
  background: rgba(59, 142, 237, 0.3);
}

.choose-file-title {
  font-size: 0.85rem;
  color: #f8f9fa;
  white-space: nowrap;
}

.choose-file-display-part {
  height: 100%;
  background: transparent;
}
</style>
