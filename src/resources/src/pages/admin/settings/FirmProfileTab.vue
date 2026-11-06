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

const isEditingProfile = ref(false);

const handleSaveProfile = async () => {
  try {
    await updateCompanySettings(props.form);
    isEditingProfile.value = false;
    toast.success("Firm profile saved and locked");
    emit("saved");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to update firm profile");
  }
};

const cancelProfileEdit = () => {
  Object.assign(props.form, company.value);
  isEditingProfile.value = false;
};
</script>

<template>
  <div class="row g-4">
    <div class="col-lg-8">
      <div class="idp-card p-4 h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
            <i class="bi bi-building-gear text-primary"></i> Company / Firm Information
          </h5>
          <span v-if="!isEditingProfile" class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25 font-monospace">
            <i class="bi bi-lock-fill me-1"></i> Locked
          </span>
          <span v-else class="badge bg-warning bg-opacity-25 text-warning border border-warning border-opacity-25 font-monospace">
            <i class="bi bi-pencil-fill me-1"></i> Editing
          </span>
        </div>

        <div class="row g-3">
          <div class="col-md-12">
            <label class="form-label text-light small fw-medium">Firm / Company Name <span class="text-danger">*</span></label>
            <input
              v-model="form.companyName"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="e.g. ASSOCIATES & CO. VAT & TAX CONSULTANCY"
            />
            <div class="form-text text-muted small">This name will appear as the header on all printed Invoices and Money Receipts.</div>
          </div>

          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Authorized Signatory / Proprietor</label>
            <input
              v-model="form.proprietorName"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="e.g. Advocate Md. Ruhul Amin"
            />
          </div>

          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Official Contact Phone</label>
            <input
              v-model="form.phone"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="e.g. +880 1819-234567"
            />
          </div>

          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Billing / Support Email</label>
            <input
              v-model="form.email"
              type="email"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="billing@associatesvat.com"
            />
          </div>

          <div class="col-md-6">
            <label class="form-label text-light small fw-medium">Website</label>
            <input
              v-model="form.website"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="https://associatesvat.com"
            />
          </div>

          <div class="col-md-12">
            <label class="form-label text-light small fw-medium">Full Office Address</label>
            <textarea
              v-model="form.address"
              rows="2"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="Suite # 504, City Heart Building, 67 Naya Paltan, VIP Road, Dhaka-1000"
            ></textarea>
          </div>
        </div>

        <h5 class="text-white fw-bold mt-4 mb-3 d-flex align-items-center gap-2 border-top border-secondary pt-3">
          <i class="bi bi-shield-check text-info"></i> Statutory Identifiers
        </h5>

        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label text-light small fw-medium">Firm BIN (13-Digit)</label>
            <input
              v-model="form.binNumber"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="001234567-0101"
            />
          </div>

          <div class="col-md-4">
            <label class="form-label text-light small fw-medium">TIN Number (12-Digit)</label>
            <input
              v-model="form.tinNumber"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="782910384721"
            />
          </div>

          <div class="col-md-4">
            <label class="form-label text-light small fw-medium">Trade License Number</label>
            <input
              v-model="form.tradeLicenseNo"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="TRAD/DSCC/038291"
            />
          </div>
        </div>

        <h5 class="text-white fw-bold mt-4 mb-3 d-flex align-items-center gap-2 border-top border-secondary pt-3">
          <i class="bi bi-phone text-success"></i> Mobile Money Collection
        </h5>

        <p class="text-muted small mb-3">
          These numbers are printed on invoices and shared over WhatsApp so clients can pay directly. Only the numbers you fill in are shown; leave the rest blank to fall back to the default bank account.
        </p>

        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label text-light small fw-medium">bKash Number</label>
            <input
              v-model="form.bkashNumber"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="01XXXXXXXXX"
            />
          </div>

          <div class="col-md-4">
            <label class="form-label text-light small fw-medium">Nagad Number</label>
            <input
              v-model="form.nagadNumber"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="01XXXXXXXXX"
            />
          </div>

          <div class="col-md-4">
            <label class="form-label text-light small fw-medium">Rocket Number</label>
            <input
              v-model="form.rocketNumber"
              type="text"
              class="form-control idp-input"
              :disabled="!isEditingProfile || !canEdit"
              placeholder="01XXXXXXXXX"
            />
          </div>
        </div>

        <div v-if="canEdit" class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top border-secondary border-opacity-50">
          <button
            v-if="!isEditingProfile"
            type="button"
            class="btn btn-warning btn-sm px-4 fw-semibold text-dark shadow-sm"
            @click="isEditingProfile = true"
          >
            <i class="bi bi-pencil-square me-1"></i> Edit Profile
          </button>
          <template v-else>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm px-3"
              @click="cancelProfileEdit"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm px-4 fw-semibold shadow-sm"
              @click="handleSaveProfile"
            >
              <i class="bi bi-check2-circle me-1"></i> Save Changes
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Firm Header Live Preview -->
    <div class="col-lg-4">
      <div class="idp-card p-4 h-100">
        <h6 class="text-white fw-bold mb-3 d-flex align-items-center gap-2">
          <i class="bi bi-eye text-warning"></i> Header Preview
        </h6>
        <div class="preview-bill-header p-3 rounded bg-dark border border-secondary text-center">
          <div class="fw-bold text-white fs-6 mb-1 text-uppercase">{{ form.companyName || 'YOUR FIRM NAME' }}</div>
          <div class="text-muted small mb-1">{{ form.address || 'Your office address here' }}</div>
          <div class="text-muted small">
            <span v-if="form.phone">📞 {{ form.phone }}</span>
            <span v-if="form.email" class="ms-2">✉️ {{ form.email }}</span>
          </div>
          <div v-if="form.binNumber" class="mt-2 text-info small font-monospace">
            BIN: {{ form.binNumber }}
          </div>
        </div>

        <div class="mt-4 p-3 rounded border border-secondary border-opacity-50 bg-dark small text-light text-opacity-75">
          <i class="bi bi-info-circle text-primary me-1"></i>
          This firm profile is uniquely tied to your admin account. When generating printable invoices, money receipts, and VAT compliance documents, these details will be rendered automatically.
        </div>
      </div>
    </div>
  </div>
</template>
