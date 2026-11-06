<script setup lang="ts">
import { computed, ref } from "vue";
import SearchInput from "@/components/common/SearchInput.vue";
import type { CustomerType, ServiceItem, ServiceRate, ServiceUnit } from "@/composables/useServicesApi";
import { useServicesApi } from "@/composables/useServicesApi";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  serviceRates: ServiceRate[];
  serviceItems: ServiceItem[];
  customerTypes: CustomerType[];
  serviceUnits: ServiceUnit[];
  canEdit: boolean;
}>();

const emit = defineEmits<(e: "refresh") => void>();

const toast = useToast();
const { createServiceRate, updateServiceRate, deleteServiceRate } = useServicesApi();

const showRateModal = ref(false);
const isEditingRate = ref(false);

const rateForm = ref({
  id: 0,
  serviceItemId: 0,
  customerTypeId: null as number | null,
  unit: "Month",
  regularRate: 0,
  minimumCharge: 0,
  effectiveFrom: new Date().toISOString().slice(0, 10)
});
const rateSearch = ref("");

const filteredRates = computed(() => {
  if (!rateSearch.value.trim()) return props.serviceRates;
  const q = rateSearch.value.toLowerCase().trim();
  return props.serviceRates.filter(
    (s) =>
      (s.itemName && s.itemName.toLowerCase().includes(q)) ||
      (s.typeName && s.typeName.toLowerCase().includes(q)) ||
      (s.unit && s.unit.toLowerCase().includes(q))
  );
});

const openAddRateModal = (prefillItem?: ServiceItem) => {
  isEditingRate.value = false;
  const firstItem = prefillItem || props.serviceItems[0];
  const firstType = props.customerTypes[0];
  const defaultUnit = firstItem?.itemName?.toLowerCase().includes("books") ? "MT" : "Month";
  rateForm.value = {
    id: 0,
    serviceItemId: firstItem?.id || 0,
    customerTypeId: firstType?.id || null,
    unit: defaultUnit,
    regularRate: 0,
    minimumCharge: 0,
    effectiveFrom: new Date().toISOString().slice(0, 10)
  };
  showRateModal.value = true;
};

const openEditRateModal = (rate: ServiceRate) => {
  isEditingRate.value = true;
  rateForm.value = {
    id: rate.id,
    serviceItemId: rate.serviceItemId,
    customerTypeId: rate.customerTypeId,
    unit: rate.unit || "Month",
    regularRate: rate.regularRate,
    minimumCharge: rate.minimumCharge,
    effectiveFrom: rate.effectiveFrom || new Date().toISOString().slice(0, 10)
  };
  showRateModal.value = true;
};

const handleSaveServiceRate = async () => {
  if (!rateForm.value.serviceItemId) {
    toast.error("Please select a service item");
    return;
  }
  if (rateForm.value.regularRate < 0) {
    toast.error("Regular rate cannot be negative");
    return;
  }

  try {
    if (isEditingRate.value && rateForm.value.id) {
      await updateServiceRate(rateForm.value.id, {
        serviceItemId: Number(rateForm.value.serviceItemId),
        customerTypeId: rateForm.value.customerTypeId ? Number(rateForm.value.customerTypeId) : null,
        unit: rateForm.value.unit || "Month",
        regularRate: Number(rateForm.value.regularRate) || 0,
        minimumCharge: Number(rateForm.value.minimumCharge) || 0,
        effectiveFrom: rateForm.value.effectiveFrom
      });
      toast.success("Service rate updated");
    } else {
      await createServiceRate({
        serviceItemId: Number(rateForm.value.serviceItemId),
        customerTypeId: rateForm.value.customerTypeId ? Number(rateForm.value.customerTypeId) : null,
        unit: rateForm.value.unit || "Month",
        regularRate: Number(rateForm.value.regularRate) || 0,
        minimumCharge: Number(rateForm.value.minimumCharge) || 0,
        effectiveFrom: rateForm.value.effectiveFrom
      });
      toast.success("Service rate saved");
    }
    showRateModal.value = false;
    emit("refresh");
  } catch (err: any) {
    toast.error(err.response?.data?.message || "Failed to save service rate");
  }
};

const handleDeleteRate = async (id: number) => {
  if (confirm("Are you sure you want to remove this service rate?")) {
    try {
      await deleteServiceRate(id);
      toast.info("Service rate removed");
      emit("refresh");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete rate");
    }
  }
};
</script>

<template>
  <div class="d-flex flex-column gap-3">
    <div class="table-card">
      <div class="d-flex flex-wrap justify-content-between align-items-center p-3 p-md-4 pb-3 gap-2 border-bottom border-secondary border-opacity-25">
        <div>
          <h6 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
            <i class="bi bi-tag-fill text-success"></i> Standard Service Rates & Limits
          </h6>
          <p class="text-muted small mb-0">
            Configure billable service rates (Regular Rate) and minimum charge limits mapped by customer type.
          </p>
        </div>

        <div class="d-flex align-items-center gap-2 flex-nowrap">
          <SearchInput
            v-model="rateSearch"
            placeholder="Search rates..."
            max-width="240px"
          />
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-success btn-sm px-3 fw-semibold d-flex align-items-center gap-1 text-nowrap flex-shrink-0 shadow-sm"
            style="white-space: nowrap; height: 38px;"
            @click="openAddRateModal()"
          >
            <i class="bi bi-plus-lg"></i> <span>Add Rate</span>
          </button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table-custom">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Service Item</th>
              <th>Customer Type</th>
              <th style="text-align: right;">Regular Rate</th>
              <th style="text-align: right;">Min Charge</th>
              <th>Effective From</th>
              <th v-if="canEdit" style="width: 100px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in filteredRates" :key="s.id">
              <td class="text-muted">{{ idx + 1 }}</td>
              <td>
                <span class="fw-semibold text-white">{{ s.itemName || '—' }}</span>
              </td>
              <td>
                <span class="badge bg-dark border border-secondary text-info fw-medium px-2 py-1">
                  {{ s.typeName || 'All Clients' }}
                </span>
              </td>
              <td style="text-align: right;" class="font-monospace text-success fw-bold">
                ৳ {{ s.regularRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                <span class="text-muted fw-normal small" style="font-size: 0.72rem;">/ {{ s.unit || 'Month' }}</span>
              </td>
              <td style="text-align: right;" class="font-monospace text-warning fw-semibold">
                ৳ {{ s.minimumCharge.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </td>
              <td class="font-monospace text-muted small">
                {{ s.effectiveFrom || '—' }}
              </td>
              <td v-if="canEdit" style="text-align: right;">
                <div class="d-flex gap-1 justify-content-end">
                  <button class="action-btn btn-edit" title="Update Rate" @click="openEditRateModal(s)">
                    <i class="bi bi-pencil-fill"></i>
                  </button>
                  <button class="action-btn btn-del" title="Delete Rate" @click="handleDeleteRate(s.id)">
                    <i class="bi bi-trash3-fill"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredRates.length === 0">
              <td :colspan="canEdit ? 7 : 6" class="text-center py-5 text-muted">
                <div class="d-flex flex-column align-items-center gap-2">
                  <i class="bi bi-tag fs-2 text-secondary"></i>
                  <span>No service rates configured yet. Click "Add Rate" above.</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit/Add Service Rate Modal -->
    <div
      v-if="showRateModal"
      class="modal fade show d-block"
      tabindex="-1"
      style="background: rgba(0, 0, 0, 0.75);"
    >
      <div class="modal-dialog modal-dialog-centered" style="max-width: 460px;">
        <div class="modal-content idp-card shadow-lg border border-secondary border-opacity-25" style="border-radius: 12px;">
          <div class="modal-header border-0 pb-0 pt-4 px-4 d-flex justify-content-between align-items-start">
            <div>
              <h5 class="modal-title text-white fw-bold mb-1">{{ isEditingRate ? 'Edit Service Rate' : 'Add Service Rate' }}</h5>
              <p class="text-muted small mb-0">
                {{ isEditingRate ? 'Update rate and unit settings for this service' : 'Add a new rate with billing unit. Previous rates remain as history.' }}
              </p>
            </div>
            <button type="button" class="btn-close btn-close-white" @click="showRateModal = false"></button>
          </div>
          <div class="modal-body px-4 py-3">
            <div class="mb-3">
              <label class="form-label text-light small fw-medium mb-1">Service Item <span class="text-danger">*</span></label>
              <select
                v-model="rateForm.serviceItemId"
                class="form-select idp-input"
              >
                <option :value="0" disabled>Select service item</option>
                <option v-for="srv in serviceItems" :key="srv.id" :value="srv.id">
                  {{ srv.itemName }}
                </option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label text-light small fw-medium mb-1">Customer Type</label>
              <select
                v-model="rateForm.customerTypeId"
                class="form-select idp-input"
              >
                <option :value="null">All / General Client</option>
                <option v-for="ct in customerTypes" :key="ct.id" :value="ct.id">
                  {{ ct.typeName }}
                </option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label text-light small fw-medium mb-1">Billing Unit / Basis <span class="text-danger">*</span></label>
              <select
                v-model="rateForm.unit"
                class="form-select idp-input font-monospace"
                required
              >
                <option v-for="u in serviceUnits" :key="u.id" :value="u.code">
                  {{ u.name }} ({{ u.code }})
                </option>
                <option v-if="serviceUnits.length === 0" value="Month">Per Month / Return</option>
                <option v-if="serviceUnits.length === 0" value="MT">Per MT (Metric Ton)</option>
                <option v-if="serviceUnits.length === 0" value="Entry">Per Entry / Invoice</option>
                <option v-if="serviceUnits.length === 0" value="Job">Per Job / One-time</option>
                <option v-if="serviceUnits.length === 0" value="PCS">Per Piece / Item</option>
                <option v-if="serviceUnits.length === 0" value="Fixed">Flat / Fixed Fee</option>
              </select>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-6">
                <label class="form-label text-light small fw-medium mb-1">Regular Rate (৳)</label>
                <input
                  v-model.number="rateForm.regularRate"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control idp-input font-monospace text-emerald-400 fw-bold"
                  placeholder="0.00"
                />
              </div>
              <div class="col-6">
                <label class="form-label text-light small fw-medium mb-1">Minimum Charge (৳)</label>
                <input
                  v-model.number="rateForm.minimumCharge"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control idp-input font-monospace text-warning fw-bold"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div class="mb-2">
              <label class="form-label text-light small fw-medium mb-1">Effective From</label>
              <input
                v-model="rateForm.effectiveFrom"
                type="date"
                class="form-control idp-input font-monospace cursor-pointer"
                onkeydown="return false"
                required
              />
            </div>
          </div>
          <div class="modal-footer border-0 pt-0 pb-4 px-4 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-secondary btn-sm px-3 text-light" style="background-color: #1e293b; border: 1px solid #334155;" @click="showRateModal = false">Cancel</button>
            <button type="button" class="btn btn-light btn-sm px-4 fw-semibold text-dark" @click="handleSaveServiceRate">
              Save Rate
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
