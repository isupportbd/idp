<script setup lang="ts">
import { ref } from "vue";
import type { CompanySettings } from "@/composables/useFirmApi";
import { useFirmApi } from "@/composables/useFirmApi";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  form: CompanySettings;
  canEdit: boolean;
}>();

const emit = defineEmits<(e: "saved") => void>();

const toast = useToast();
const { company, updateCompanySettings } = useFirmApi();

const isEditingBranding = ref(false);

const termPresets = [
  {
    label: "Standard (Due in 15 days)",
    value:
      "1. Payment is due within 15 days of invoice date.\n2. Please mention the invoice number as reference in payment.\n3. Checks/Transfers are subject to realization."
  },
  {
    label: "Due on Receipt",
    value: "1. Payment is due immediately upon receipt of this bill.\n2. Please settle via bank transfer or bKash merchant account."
  },
  {
    label: "Net 30 Days",
    value: "1. Payment term is Net 30 days from billing date.\n2. Overdue bills may accrue statutory late processing fees."
  },
  {
    label: "Advance Payment Condition",
    value: "1. 50% advance required before submission filing.\n2. Balance payable upon receipt of Mushak submission acknowledgment."
  }
];

const applyTermPreset = (e: Event) => {
  const val = (e.target as HTMLSelectElement).value;
  if (val) {
    props.form.invoiceTerms = val;
  }
};

const handleSaveBranding = async () => {
  try {
    await updateCompanySettings(props.form);
    isEditingBranding.value = false;
    toast.success("Invoice branding saved and locked");
    emit("saved");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to update invoice branding");
  }
};

const cancelBrandingEdit = () => {
  Object.assign(props.form, company.value);
  isEditingBranding.value = false;
};
</script>

<template>
  <div class="row g-4">
    <div class="col-lg-8">
      <div class="idp-card p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
            <i class="bi bi-file-earmark-text text-primary"></i> Numbering & Formats
          </h5>
          <span v-if="!isEditingBranding" class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25 font-monospace">
            <i class="bi bi-lock-fill me-1"></i> Locked
          </span>
          <span v-else class="badge bg-warning bg-opacity-25 text-warning border border-warning border-opacity-25 font-monospace">
            <i class="bi bi-pencil-fill me-1"></i> Editing
          </span>
        </div>

        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Invoice Number Prefix</label>
            <input
              v-model="form.invoicePrefix"
              type="text"
              class="form-control idp-input font-monospace"
              :disabled="!isEditingBranding || !canEdit"
              placeholder="INV"
            />
          </div>

          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Money Receipt Prefix</label>
            <input
              v-model="form.receiptPrefix"
              type="text"
              class="form-control idp-input font-monospace"
              :disabled="!isEditingBranding || !canEdit"
              placeholder="RCP"
            />
          </div>

          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Currency Label</label>
            <input
              v-model="form.currency"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingBranding || !canEdit"
              placeholder="BDT (৳)"
            />
          </div>

          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Decimal Places</label>
            <select v-model="form.decimalPlaces" class="form-select idp-input" :disabled="!isEditingBranding || !canEdit">
              <option :value="0">0 (e.g. 5000 Tk)</option>
              <option :value="2">2 (e.g. 5000.00 Tk)</option>
            </select>
          </div>
        </div>

        <h5 class="text-white fw-bold mt-4 mb-3 d-flex align-items-center gap-2 border-top border-secondary pt-3">
          <i class="bi bi-card-text text-info"></i> Terms & Footer Branding
        </h5>

        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <label class="form-label text-light small fw-medium mb-0">Invoice Terms & Conditions</label>
            <select class="form-select form-select-sm idp-input py-0" style="width: auto;" :disabled="!isEditingBranding || !canEdit" @change="applyTermPreset">
              <option value="">-- Apply Preset Terms --</option>
              <option v-for="(t, idx) in termPresets" :key="idx" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <textarea
            v-model="form.invoiceTerms"
            rows="3"
            class="form-control idp-input small"
            :disabled="!isEditingBranding || !canEdit"
            placeholder="Enter standard payment terms and billing conditions..."
          ></textarea>
        </div>

        <div class="mb-3">
          <label class="form-label text-light small fw-medium">Invoice Footer Note</label>
          <textarea
            v-model="form.invoiceFooterText"
            rows="2"
            class="form-control idp-input small"
            :disabled="!isEditingBranding || !canEdit"
            placeholder="Thank you for your trusted business relationship..."
          ></textarea>
        </div>

        <div class="mb-3">
          <label class="form-label text-light small fw-medium">Money Receipt Footer Note</label>
          <textarea
            v-model="form.receiptFooterText"
            rows="2"
            class="form-control idp-input small"
            :disabled="!isEditingBranding || !canEdit"
            placeholder="Official money receipt acknowledgment..."
          ></textarea>
        </div>

        <div v-if="canEdit" class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top border-secondary border-opacity-50">
          <button
            v-if="!isEditingBranding"
            type="button"
            class="btn btn-warning btn-sm px-4 fw-semibold text-dark shadow-sm"
            @click="isEditingBranding = true"
          >
            <i class="bi bi-pencil-square me-1"></i> Edit Branding & Terms
          </button>
          <template v-else>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm px-3"
              @click="cancelBrandingEdit"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm px-4 fw-semibold shadow-sm"
              @click="handleSaveBranding"
            >
              <i class="bi bi-check2-circle me-1"></i> Save Changes
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Live Numbering Preview Card -->
    <div class="col-lg-4">
      <div class="idp-card p-4">
        <h6 class="text-white fw-bold mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-tag text-success"></i> Live Formatting Preview
        </h6>

        <div class="p-3 bg-dark border border-secondary rounded mb-3">
          <div class="text-muted small mb-1">Next Generated Invoice No:</div>
          <div class="text-success font-monospace fs-5 fw-bold">
            {{ (form.invoicePrefix || 'INV').replace(/-+$/, '') }}-{{ new Date().getFullYear() }}-{{ String(form.currentInvoiceSequence || 1).padStart(6, '0') }}
          </div>
        </div>

        <div class="p-3 bg-dark border border-secondary rounded mb-3">
          <div class="text-muted small mb-1">Next Money Receipt No:</div>
          <div class="text-info font-monospace fs-5 fw-bold">
            {{ (form.receiptPrefix || 'RCP').replace(/-+$/, '') }}-{{ new Date().getFullYear() }}-{{ String(form.currentReceiptSequence || 1).padStart(6, '0') }}
          </div>
        </div>

        <div class="p-3 bg-dark border border-secondary rounded">
          <div class="text-muted small mb-1">Currency Preview:</div>
          <div class="text-light font-monospace fw-bold">
            {{ form.decimalPlaces === 2 ? '5000.00' : '5000' }} {{ form.currency }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
