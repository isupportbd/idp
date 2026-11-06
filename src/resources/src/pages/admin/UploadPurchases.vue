<script setup lang="ts">
import axios from "axios";
import { onMounted, ref } from "vue";
import { useToast } from "@/composables/useToast";
import DuplicateCompareModal from "./purchases/DuplicateCompareModal.vue";
import FfsResolutionModal from "./purchases/FfsResolutionModal.vue";
import MissingClientsModal, { type MissingClient } from "./purchases/MissingClientsModal.vue";
import MissingItemsModal, { type MissingItem } from "./purchases/MissingItemsModal.vue";
import PurchasesPreviewTable from "./purchases/PurchasesPreviewTable.vue";
import UploadDropzone from "./purchases/UploadDropzone.vue";

const toast = useToast();

// Global Measurement Units
const globalUnits = ref<Array<{ id?: number; code: string; name: string }>>([
  { code: "U", name: "Unit" },
  { code: "KG", name: "Kilogram" },
  { code: "MT", name: "Metric Ton" },
  { code: "PCS", name: "Pieces" },
  { code: "LTR", name: "Liter" }
]);

const loadGlobalUnits = async () => {
  try {
    const res = await axios.get("/api/superadmin/measurement-units");
    if (res.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
      globalUnits.value = res.data.data
        .filter((u: any) => u.isActive !== false && u.is_active !== false)
        .map((u: any) => ({
          id: u.id,
          code: u.code || "",
          name: u.name || ""
        }));
    }
  } catch (err) {
    console.error("Error loading global measurement units:", err);
  }
};

onMounted(() => {
  loadGlobalUnits();
});

const formatBin = (raw?: string): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 13) {
    return `${digits.slice(0, 9)}-${digits.slice(9, 13)}`;
  }
  return String(raw).trim();
};

// Top Upload Bar State
const selectedFile = ref<File | null>(null);
const fileName = ref("");
const fileSize = ref("");

const getLastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};
const selectedMonth = ref(getLastMonth());
const isRebate = ref(false);
const isFfs = ref(false);

const isProcessing = ref(false);
const isSaving = ref(false);

// Temp Data Table State
const tempData = ref<any[]>([]);

// Modal States
const showMissingItemsModal = ref(false);
const missingItems = ref<MissingItem[]>([]);

const showMissingClientsModal = ref(false);
const missingClients = ref<MissingClient[]>([]);

const showCompareModal = ref(false);
const duplicateList = ref<any[]>([]);

const showFfsModal = ref(false);
const ffsPendingList = ref<any[]>([]);

// Dropdown Master Options
const clientTypeOptions = [
  { id: 1, name: "Importer" },
  { id: 2, name: "Commercial Importer" },
  { id: 3, name: "Manufacturer" },
  { id: 4, name: "Trader / Wholesaler" },
  { id: 5, name: "Exporter" },
  { id: 6, name: "Service Provider" }
];

// File Selection Handlers
const onFileSelected = (f: File) => {
  selectedFile.value = f;
  fileName.value = f.name;
  fileSize.value = (f.size / 1024).toFixed(1) + " KB";
};

const onFileCleared = () => {
  selectedFile.value = null;
  fileName.value = "";
  fileSize.value = "";
};

// Process File (Add to Temp)
const processFile = async (silent: boolean | Event = false) => {
  if (!selectedFile.value) return;

  const isSilent = typeof silent === "boolean" ? silent : false;
  isProcessing.value = true;

  try {
    const formData = new FormData();
    formData.append("file", selectedFile.value);
    formData.append("month", selectedMonth.value);
    formData.append("isRebate", String(isRebate.value));
    formData.append("isFfs", String(isFfs.value));

    const response = await axios.post("/api/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });

    const data = response.data;
    if (data.success) {
      tempData.value = data.data || [];
      if (!isSilent) {
        toast.success(`File processed successfully. ${tempData.value.length} records ready for preview.`);
      }
    } else if (data.requiresItemMapping) {
      missingItems.value = (data.missingItems || []).map((item: any) => ({
        ...item,
        unit: item.unit || globalUnits.value[0]?.code || "U"
      }));
      showMissingItemsModal.value = true;
    } else if (data.requiresClientMapping) {
      missingClients.value = (data.missingClients || []).map((c: any) => ({
        ...c,
        bin: formatBin(c.bin)
      }));
      showMissingClientsModal.value = true;
    } else {
      toast.error(data.message || "Failed to process file.");
    }
  } catch (error: any) {
    const data = error.response?.data;
    if (data?.requiresItemMapping) {
      missingItems.value = (data.missingItems || []).map((item: any) => ({
        ...item,
        unit: item.unit || globalUnits.value[0]?.code || "U"
      }));
      showMissingItemsModal.value = true;
    } else if (data?.requiresClientMapping) {
      missingClients.value = (data.missingClients || []).map((c: any) => ({
        ...c,
        bin: formatBin(c.bin)
      }));
      showMissingClientsModal.value = true;
    } else {
      toast.error(data?.message || error.message || "An error occurred during file processing.");
    }
  } finally {
    isProcessing.value = false;
  }
};

// Missing Items Handlers
const cancelMissingItems = () => {
  showMissingItemsModal.value = false;
  missingItems.value = [];
  toast.error("Upload cancelled due to missing item mappings.");
};

const skipMissingItems = () => {
  const missingHsSet = new Set(missingItems.value.map((i) => (i.awHsCode || i.hsCode || "").replace(/[.\s]/g, "")));
  const beforeCount = tempData.value.length;
  tempData.value = tempData.value.filter((row) => {
    const rawAw = (row.awHsCode || row.hsCode || "").replace(/[.\s]/g, "");
    return !missingHsSet.has(rawAw);
  });
  const skippedCount = beforeCount - tempData.value.length;
  showMissingItemsModal.value = false;
  missingItems.value = [];
  toast.warning(`Skipped ${skippedCount} row(s) with unmapped items. ${tempData.value.length} row(s) ready in preview.`);
};

const saveMissingItems = async () => {
  for (const item of missingItems.value) {
    if (!item.name || !item.name.trim()) {
      toast.error(`Please provide an Item Name for HS Code: ${item.hsCode || item.awHsCode}`);
      return;
    }
    if (!item.hsCode || !item.hsCode.trim()) {
      toast.error(`Please provide a standard HS Code for: ${item.name}`);
      return;
    }
  }

  isSaving.value = true;
  try {
    const res = await axios.post("/api/items/bulk", { items: missingItems.value });
    if (res.data?.success || res.status === 200) {
      toast.success(res.data?.message || "Item mappings saved to global catalog successfully!");
      showMissingItemsModal.value = false;
      missingItems.value = [];
      await processFile(true);
    } else {
      toast.error(res.data?.message || "Failed to save item mappings.");
    }
  } catch (err: any) {
    console.error("Error saving items:", err);
    toast.error(err.response?.data?.message || "Failed to save item mappings.");
  } finally {
    isSaving.value = false;
  }
};

// Missing Clients Handlers
const cancelMissingClients = () => {
  showMissingClientsModal.value = false;
  missingClients.value = [];
  toast.error("Upload cancelled due to unverified clients.");
};

const skipMissingClients = () => {
  const missingBinSet = new Set(missingClients.value.map((c) => String(c.bin).trim()));
  const beforeCount = tempData.value.length;
  tempData.value = tempData.value.filter((row) => !missingBinSet.has(String(row.bin).trim()));
  const skippedCount = beforeCount - tempData.value.length;
  showMissingClientsModal.value = false;
  missingClients.value = [];
  toast.warning(`Skipped ${skippedCount} row(s) for unregistered clients. ${tempData.value.length} row(s) ready in preview.`);
};

const saveMissingClients = async () => {
  for (const client of missingClients.value) {
    if (!client.name || !client.name.trim()) {
      toast.error(`Please provide a name for BIN: ${client.bin}`);
      return;
    }
  }

  isSaving.value = true;
  try {
    const clientsPayload = missingClients.value.map((c) => ({
      ...c,
      bin: formatBin(c.bin),
      binNumber: formatBin(c.bin),
      companyName: c.name
    }));
    const res = await axios.post("/api/clients/bulk", { clients: clientsPayload });
    if (res.data?.success || res.status === 200) {
      toast.success(res.data?.message || "Missing clients registered successfully!");
      showMissingClientsModal.value = false;
      missingClients.value = [];
      await processFile(true);
    } else {
      toast.error(res.data?.message || "Failed to register missing clients.");
    }
  } catch (err: any) {
    showMissingClientsModal.value = false;
    missingClients.value = [];
    await processFile();
  } finally {
    isSaving.value = false;
  }
};

// Save Temp Data to Database
const saveToDatabase = async () => {
  if (!tempData.value || tempData.value.length === 0) return;

  isSaving.value = true;

  try {
    const response = await axios.post("/api/upload/save", {
      data: tempData.value,
      month: selectedMonth.value,
      isRebate: isRebate.value,
      isFfs: isFfs.value
    });

    const data = response.data;
    if (data.success) {
      if (data.duplicatesList && data.duplicatesList.length > 0) {
        duplicateList.value = data.duplicatesList;
        showCompareModal.value = true;
      }
      if (data.ffsPendingList && data.ffsPendingList.length > 0) {
        ffsPendingList.value = data.ffsPendingList;
        showFfsModal.value = true;
      }

      if ((!data.duplicatesList || data.duplicatesList.length === 0) && (!data.ffsPendingList || data.ffsPendingList.length === 0)) {
        toast.success(`${data.totalRowsProcessed || tempData.value.length} records saved to database successfully!`);
        resetUpload();
      }
    } else {
      toast.error(data.message || "Failed to save data.");
    }
  } catch (error: any) {
    toast.error(error.response?.data?.message || "An error occurred during save.");
  } finally {
    isSaving.value = false;
  }
};

// Duplicate Compare Modal Handlers
const handleIgnoreDuplicate = (index: number) => {
  duplicateList.value.splice(index, 1);
  toast.info("Duplicate record skipped.");
  if (duplicateList.value.length === 0) {
    showCompareModal.value = false;
    resetUpload();
  }
};

const handleReplaceDuplicate = async (item: any, index: number) => {
  try {
    isSaving.value = true;
    await axios.post("/api/upload/replace", { itemsToReplace: [item] });
    toast.success("Duplicate record updated successfully.");
    duplicateList.value.splice(index, 1);
    if (duplicateList.value.length === 0) {
      showCompareModal.value = false;
      resetUpload();
    }
  } catch (err: any) {
    toast.error(err?.response?.data?.message || "Failed to replace duplicate record.");
    duplicateList.value.splice(index, 1);
    if (duplicateList.value.length === 0) {
      showCompareModal.value = false;
      resetUpload();
    }
  } finally {
    isSaving.value = false;
  }
};

const handleReplaceAll = async () => {
  if (duplicateList.value.length === 0) return;
  try {
    isSaving.value = true;
    await axios.post("/api/upload/replace", { itemsToReplace: duplicateList.value });
    toast.success(`All ${duplicateList.value.length} duplicate records updated successfully.`);
    duplicateList.value = [];
    showCompareModal.value = false;
    resetUpload();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || "Failed to replace all duplicate records.");
  } finally {
    isSaving.value = false;
  }
};

const handleIgnoreAll = () => {
  const count = duplicateList.value.length;
  duplicateList.value = [];
  showCompareModal.value = false;
  resetUpload();
  toast.info(`Skipped ${count} duplicate record(s).`);
};

// FFS Resolution Modal Handlers
const handleSavePendingFfs = async (takeRebate: boolean) => {
  isSaving.value = true;
  try {
    const res = await axios.post("/api/upload/save-pending-ffs", {
      itemsToSave: ffsPendingList.value,
      takeRebate
    });
    toast.success(res.data.message || "FFS records saved successfully!");
    showFfsModal.value = false;
    ffsPendingList.value = [];
    resetUpload();
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to save FFS items");
    showFfsModal.value = false;
    ffsPendingList.value = [];
    resetUpload();
  } finally {
    isSaving.value = false;
  }
};

const cancelFfsModal = () => {
  showFfsModal.value = false;
  ffsPendingList.value = [];
  resetUpload();
  toast.info("Pending FFS records discarded.");
};

// Reset State
const resetUpload = () => {
  tempData.value = [];
  selectedFile.value = null;
  fileName.value = "";
  fileSize.value = "";
};
</script>

<template>
  <div class="py-2">
    <!-- Breadcrumbs -->
    <div class="d-flex align-items-center gap-2 mb-3">
      <router-link to="/" class="text-muted text-decoration-none small">
        <i class="bi bi-arrow-left me-1"></i> Dashboard
      </router-link>
      <span class="text-muted small">/</span>
      <span class="text-primary small fw-semibold">Upload Purchases</span>
    </div>

    <!-- Top Upload Bar Subcomponent -->
    <UploadDropzone
      :selected-month="selectedMonth"
      :selected-file="selectedFile"
      :file-name="fileName"
      :file-size="fileSize"
      :is-rebate="isRebate"
      :is-ffs="isFfs"
      :is-processing="isProcessing"
      @update:selected-month="selectedMonth = $event"
      @update:is-rebate="isRebate = $event"
      @update:is-ffs="isFfs = $event"
      @file-selected="onFileSelected"
      @file-cleared="onFileCleared"
      @process="() => processFile(false)"
    />

    <!-- Preview Panel Subcomponent -->
    <PurchasesPreviewTable
      :temp-data="tempData"
      :selected-month="selectedMonth"
      :is-saving="isSaving"
      @cancel="resetUpload"
      @save="saveToDatabase"
    />

    <!-- MODAL 1: Missing Items Mapping Modal -->
    <MissingItemsModal
      v-if="showMissingItemsModal"
      :missing-items="missingItems"
      :global-units="globalUnits"
      :is-saving="isSaving"
      @cancel="cancelMissingItems"
      @skip="skipMissingItems"
      @save="saveMissingItems"
    />

    <!-- MODAL 2: Missing Clients Mapping Modal -->
    <MissingClientsModal
      v-if="showMissingClientsModal"
      :missing-clients="missingClients"
      :client-type-options="clientTypeOptions"
      :is-saving="isSaving"
      @cancel="cancelMissingClients"
      @skip="skipMissingClients"
      @save="saveMissingClients"
    />

    <!-- MODAL 3: Duplicate Compare & Replace Modal -->
    <DuplicateCompareModal
      v-if="showCompareModal"
      :duplicate-list="duplicateList"
      :is-saving="isSaving"
      @ignore-duplicate="handleIgnoreDuplicate"
      @replace-duplicate="handleReplaceDuplicate"
      @replace-all="handleReplaceAll"
      @ignore-all="handleIgnoreAll"
      @close="showCompareModal = false"
    />

    <!-- MODAL 4: FFS Resolution Modal -->
    <FfsResolutionModal
      v-if="showFfsModal && ffsPendingList.length > 0"
      :ffs-pending-list="ffsPendingList"
      :is-saving="isSaving"
      @save-pending-ffs="handleSavePendingFfs"
      @cancel="cancelFfsModal"
    />
  </div>
</template>
