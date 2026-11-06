<script setup lang="ts">
import axios from "axios";
import { ref } from "vue";
import type { CompanySettings } from "@/composables/useFirmApi";
import { useFirmApi } from "@/composables/useFirmApi";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{
  form: CompanySettings;
  canEdit: boolean;
}>();

const emit = defineEmits<(e: "saved") => void>();

const toast = useToast();
const authStore = useAuthStore();
const { company, updateCompanySettings } = useFirmApi();

const isEditingRules = ref(false);
const testMobile = ref("");
const isSendingTestSms = ref(false);
const testSmsSuccess = ref(false);

const handleSaveRules = async () => {
  try {
    await updateCompanySettings(props.form);
    isEditingRules.value = false;
    Object.assign(props.form, company.value);
    toast.success("Rules & SMS configuration saved and locked");
    emit("saved");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to update rules");
  }
};

const cancelRulesEdit = () => {
  Object.assign(props.form, company.value);
  isEditingRules.value = false;
};

const sendTestSms = async () => {
  const cleanNumber = testMobile.value.trim().replace(/[\s\-\+]/g, "");
  if (!cleanNumber) {
    toast.error("Please enter a mobile number for test SMS");
    return;
  }
  isSendingTestSms.value = true;
  testSmsSuccess.value = false;
  try {
    const res = await axios.post("/api/auth/send-test-sms", {
      mobile: cleanNumber,
      apiKey: props.form.smsApiKey?.trim() || undefined,
      senderId: props.form.smsSenderId?.trim() || undefined
    });
    if (res.data?.success) {
      testSmsSuccess.value = true;
      toast.success(res.data?.message || "Test SMS sent successfully!");
      if (res.data?.smsBalance !== undefined && authStore.user) {
        (authStore.user as any).smsBalance = res.data.smsBalance;
      }
    } else {
      toast.error(res.data?.message || "Failed to send test SMS");
    }
  } catch (err: any) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message || "Error sending test SMS";
    toast.error(msg);
  } finally {
    isSendingTestSms.value = false;
  }
};
</script>

<template>
  <div class="row g-4">
    <div class="col-lg-6">
      <div class="idp-card p-4 h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
            <i class="bi bi-sliders text-primary"></i> Accounting & Validation Rules
          </h5>
          <span v-if="!isEditingRules" class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25 font-monospace">
            <i class="bi bi-lock-fill me-1"></i> Locked
          </span>
          <span v-else class="badge bg-warning bg-opacity-25 text-warning border border-warning border-opacity-25 font-monospace">
            <i class="bi bi-pencil-fill me-1"></i> Editing
          </span>
        </div>

        <div class="d-flex flex-column gap-3">
          <div class="d-flex justify-content-between align-items-center p-3 bg-dark border border-secondary rounded">
            <div>
              <div class="text-white fw-semibold small">Auto Carry-Forward Dues</div>
              <div class="text-muted small">Automatically carry forward previous unpaid dues into new monthly invoices.</div>
            </div>
            <div class="form-check form-switch mb-0">
              <input v-model="form.autoDueCarryForward" :disabled="!isEditingRules || !canEdit" class="form-check-input" type="checkbox" />
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center p-3 bg-dark border border-secondary rounded">
            <div>
              <div class="text-white fw-semibold small">Enforce Unique Client BIN</div>
              <div class="text-muted small">Disallow adding two separate clients with identical 13-digit BIN numbers.</div>
            </div>
            <div class="form-check form-switch mb-0">
              <input v-model="form.binUniqueEnforcement" :disabled="!isEditingRules || !canEdit" class="form-check-input" type="checkbox" />
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center p-3 bg-dark border border-secondary rounded">
            <div>
              <div class="text-white fw-semibold small">Allow Duplicate Mobile Numbers</div>
              <div class="text-muted small">Allow multiple sister concerns to share the same contact phone number.</div>
            </div>
            <div class="form-check form-switch mb-0">
              <input v-model="form.allowDuplicateMobile" :disabled="!isEditingRules || !canEdit" class="form-check-input" type="checkbox" />
            </div>
          </div>

          <!-- Automated SMS Notification Triggers -->
          <div class="p-3 bg-dark border border-secondary rounded">
            <div class="d-flex align-items-center gap-2 mb-3">
              <i class="bi bi-toggles text-success"></i>
              <span class="text-white fw-semibold small">Automated SMS Notification Triggers</span>
            </div>

            <div class="d-flex flex-column gap-3">
              <div class="d-flex justify-content-between align-items-center gap-3">
                <div>
                  <div class="text-white fw-semibold small">Invoice / Bill Notification SMS</div>
                  <div class="text-muted small">Send automated SMS when a monthly bill or invoice is generated.</div>
                </div>
                <div class="form-check form-switch mb-0">
                  <input v-model="form.smsOnBill" :disabled="!isEditingRules || !canEdit" class="form-check-input" type="checkbox" />
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center gap-3">
                <div>
                  <div class="text-white fw-semibold small">Payment Receipt / Collection SMS</div>
                  <div class="text-muted small">Send automated money receipt SMS when payment is received.</div>
                </div>
                <div class="form-check form-switch mb-0">
                  <input v-model="form.smsOnCollection" :disabled="!isEditingRules || !canEdit" class="form-check-input" type="checkbox" />
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center gap-3">
                <div>
                  <div class="text-white fw-semibold small">VAT Return Submission SMS</div>
                  <div class="text-muted small">Send automated SMS with submission ID when VAT return is filed.</div>
                </div>
                <div class="form-check form-switch mb-0">
                  <input v-model="form.smsOnSubmission" :disabled="!isEditingRules || !canEdit" class="form-check-input" type="checkbox" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="canEdit" class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top border-secondary border-opacity-50">
          <button
            v-if="!isEditingRules"
            type="button"
            class="btn btn-warning btn-sm px-4 fw-semibold text-dark shadow-sm"
            @click="isEditingRules = true"
          >
            <i class="bi bi-pencil-square me-1"></i> Edit Rules & SMS
          </button>
          <template v-else>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm px-3"
              @click="cancelRulesEdit"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm px-4 fw-semibold shadow-sm"
              @click="handleSaveRules"
            >
              <i class="bi bi-check2-circle me-1"></i> Save Configuration
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- SMS Integration -->
    <div class="col-lg-6">
      <div class="idp-card p-4 h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
            <i class="bi bi-chat-dots text-success"></i> Bulk SMS Notification Gateway
          </h5>
          <span v-if="!isEditingRules" class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25 font-monospace">
            <i class="bi bi-lock-fill me-1"></i> Locked
          </span>
          <span v-else class="badge bg-warning bg-opacity-25 text-warning border border-warning border-opacity-25 font-monospace">
            <i class="bi bi-pencil-fill me-1"></i> Editing
          </span>
        </div>

        <div class="mb-3">
          <label class="form-label text-light small fw-medium">SMS Gateway Provider Name</label>
          <input 
            v-model="form.smsProvider" 
            type="text" 
            class="form-control idp-input" 
            :disabled="!isEditingRules || !canEdit" 
            placeholder="e.g. BulkSMSBD, GreenWeb, etc." 
          />
        </div>

        <div class="mb-3">
          <label class="form-label text-light small fw-medium">API Endpoint URL</label>
          <input 
            v-model="form.smsEndpointUrl" 
            type="text" 
            class="form-control idp-input font-monospace" 
            :disabled="!isEditingRules || !canEdit" 
            placeholder="e.g. http://bulksmsbd.net/api/smsapi" 
          />
        </div>

        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <label class="form-label text-light small fw-medium mb-0">SMS API Key</label>
            <span v-if="company.isSmsConfigured" class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25 fs-9">
              <i class="bi bi-shield-check me-1"></i> Saved: {{ company.maskedSmsApiKey }}
            </span>
          </div>
          <input
            v-model="form.smsApiKey"
            type="password"
            class="form-control idp-input"
            :disabled="!isEditingRules || !canEdit"
            :placeholder="company.isSmsConfigured ? '•••••••••••••••• (Leave blank to keep existing key)' : 'Enter your BulkSMSBD API token...'"
          />
        </div>

        <div class="mb-3">
          <label class="form-label text-light small fw-medium">Sender ID / Masking</label>
          <input
            v-model="form.smsSenderId"
            type="text"
            class="form-control idp-input"
            :disabled="!isEditingRules || !canEdit"
            placeholder="e.g. MyBrand"
          />
        </div>

        <!-- Test SMS Row -->
        <div class="p-3 bg-dark border border-secondary rounded mt-3">
          <label class="form-label text-light small fw-medium">Test SMS Sending</label>
          <div class="d-flex gap-2">
            <input
              v-model="testMobile"
              type="text"
              class="form-control form-control-sm idp-input"
              placeholder="017XXXXXXXX"
            />
            <button
              type="button"
              class="btn btn-sm btn-outline-success px-3 d-flex align-items-center gap-1"
              :disabled="isSendingTestSms"
              @click="sendTestSms"
            >
              <span v-if="isSendingTestSms" class="spinner-border spinner-border-sm"></span>
              <i v-else class="bi bi-send"></i>
              <span>{{ isSendingTestSms ? 'Sending...' : 'Send Test' }}</span>
            </button>
          </div>
          <div v-if="testSmsSuccess" class="text-success small mt-2">
            <i class="bi bi-check-circle me-1"></i> Test SMS dispatched successfully to {{ testMobile }}.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
