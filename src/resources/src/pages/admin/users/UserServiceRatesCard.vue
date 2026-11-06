<script setup lang="ts">
import { computed, ref } from "vue";
import ServiceItemSearchSelect from "@/components/common/ServiceItemSearchSelect.vue";
import { useToast } from "@/composables/useToast";

export type ServiceItem = { id: number; itemName: string };
export type RateVersion = { rate: number; effectiveFrom: string; effectiveTo?: string; isActive?: boolean };
export type AssignedRate = {
  serviceItemId: number;
  itemName: string;
  rate: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
  versionCount?: number;
  history?: RateVersion[];
};

const props = defineProps<{
  rates: AssignedRate[];
  retiredRates: AssignedRate[];
  serviceCatalog: ServiceItem[];
  ratesLoading: boolean;
  ratesDirty: boolean;
}>();

const emit = defineEmits<{
  "update:rates": [val: AssignedRate[]];
  "update:ratesDirty": [val: boolean];
  assign: [rate: AssignedRate];
  remove: [serviceItemId: number];
}>();

const toast = useToast();

const selectedServiceItemId = ref<number | string | null>(null);
const newRate = ref<number | string>("");
const newEffectiveFrom = ref<string>(new Date().toISOString().slice(0, 10));

const assignedIds = computed(() => new Set(props.rates.map((r) => r.serviceItemId)));

const assignableItems = computed(() => props.serviceCatalog.filter((item) => !assignedIds.value.has(item.id)));

const totalRate = computed(() => props.rates.reduce((sum, r) => sum + (Number(r.rate) || 0), 0));

const versionTooltip = (history?: RateVersion[]) => {
  if (!history || history.length === 0) return "";
  return history
    .map((h) => {
      const range = h.effectiveTo ? `${h.effectiveFrom} → ${h.effectiveTo}` : `${h.effectiveFrom} → now`;
      return `${range}: ${h.rate.toFixed(2)} Tk`;
    })
    .join("\n");
};

const assignService = () => {
  const id = Number(selectedServiceItemId.value);
  if (!id) {
    toast.warning("Pick a service item to assign first.");
    return;
  }
  if (assignedIds.value.has(id)) {
    toast.warning("That service item is already assigned to this staff member.");
    return;
  }
  const rate = Number(newRate.value);
  if (!Number.isFinite(rate) || rate <= 0) {
    toast.warning("Enter a rate greater than zero.");
    return;
  }
  const item = props.serviceCatalog.find((i) => i.id === id);
  const next: AssignedRate = {
    serviceItemId: id,
    itemName: item?.itemName || "",
    rate: Math.round(rate * 100) / 100,
    effectiveFrom: newEffectiveFrom.value || new Date().toISOString().slice(0, 10)
  };
  const updated = [...props.rates, next].sort((a, b) => a.itemName.localeCompare(b.itemName));
  emit("update:rates", updated);
  emit("assign", next);
  emit("update:ratesDirty", true);
  selectedServiceItemId.value = null;
  newRate.value = "";
};

const removeService = (serviceItemId: number) => {
  const updated = props.rates.filter((r) => r.serviceItemId !== serviceItemId);
  emit("update:rates", updated);
  emit("remove", serviceItemId);
  emit("update:ratesDirty", true);
};

const onRateChange = () => {
  emit("update:ratesDirty", true);
};
</script>

<template>
  <div class="card idp-form-card shadow-sm">
    <div class="card-header bg-transparent border-secondary border-opacity-25 py-3">
      <h5 class="card-title text-white mb-0 d-flex align-items-center gap-2 fs-6 fw-bold">
        <i class="bi bi-cash-stack text-primary"></i> Service Assignment &amp; Rates
      </h5>
      <span class="text-muted small">
        Assign only the service items this staff member works on — Payouts uses these rates to accrue monthly earnings
      </span>
      <div v-if="ratesDirty" class="mt-2">
        <span class="badge pending-badge">
          <i class="bi bi-exclamation-circle me-1"></i>Pending changes — click <strong>Update Sub-User</strong> to save
        </span>
      </div>
    </div>

    <div class="card-body p-4">
      <div v-if="ratesLoading" class="text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
        Loading service items...
      </div>

      <template v-else>
        <!-- Top assignment bar -->
        <div class="assign-bar">
          <div class="assign-field assign-item">
            <label class="form-label text-muted small fw-semibold mb-1">SERVICE ITEM</label>
            <ServiceItemSearchSelect
              v-model="selectedServiceItemId"
              :items="assignableItems"
              placeholder="Type to search Service Item..."
              :min-chars="1"
              :disabled="assignableItems.length === 0"
            />
          </div>
          <div class="assign-field assign-rate">
            <label class="form-label text-muted small fw-semibold mb-1">RATE PER UNIT (TK)</label>
            <div class="rate-input-wrap">
              <input
                v-model.number="newRate"
                type="number"
                min="0"
                step="0.01"
                class="form-control idp-field rate-input"
                placeholder="0.00"
                @keydown.enter.prevent="assignService"
              />
              <span class="rate-suffix">Tk</span>
            </div>
          </div>
          <div class="assign-field assign-date">
            <label class="form-label text-muted small fw-semibold mb-1">EFFECTIVE FROM</label>
            <input
              v-model="newEffectiveFrom"
              type="date"
              class="form-control idp-field effective-date-input"
              onkeydown="return false"
            />
          </div>
          <div class="assign-field assign-action">
            <button
              type="button"
              class="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2 assign-btn"
              :disabled="assignableItems.length === 0"
              @click="assignService"
            >
              <i class="bi bi-plus-lg"></i> Assign Service Rate
            </button>
          </div>
        </div>

        <!-- Assigned services table -->
        <div v-if="rates.length === 0" class="rate-empty text-center">
          <i class="bi bi-clipboard-x fs-3 d-block mb-2 text-secondary"></i>
          <span class="text-muted">
            <template v-if="serviceCatalog.length === 0">
              No active service items found. Add them in Firm Settings first.
            </template>
            <template v-else>
              No assigned services yet. Pick a service above to assign commission rates to this staff member.
            </template>
          </span>
        </div>

        <div v-else class="table-responsive">
          <div class="rate-version-hint text-muted small mb-2">
            <i class="bi bi-info-circle me-1"></i>
            Only the <strong>current</strong> rate is editable. Set a
            <strong>new</strong> effective date to publish a change: the previous rate is frozen on record
            and still applies to the months it was in force. Removing an item retires it — history is never deleted.
          </div>
          <table class="table-custom rate-table">
            <thead>
              <tr>
                <th class="col-item">Assigned Service Item</th>
                <th class="col-rate text-end">Rate (Tk)</th>
                <th class="col-date text-center">Effective From</th>
                <th class="col-action text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rates" :key="row.serviceItemId">
                <td class="col-item">
                  <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-receipt text-primary module-icon"></i>
                    <span class="text-white fw-semibold">{{ row.itemName }}</span>
                    <span class="badge current-badge">Current</span>
                    <span
                      v-if="(row.versionCount ?? 1) > 1"
                      class="badge version-badge"
                      :title="versionTooltip(row.history)"
                    >
                      {{ row.versionCount }} versions
                    </span>
                  </div>
                </td>
                <td class="col-rate">
                  <div class="rate-input-wrap">
                    <input
                      v-model.number="row.rate"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control idp-field rate-input"
                      placeholder="0.00"
                      @input="onRateChange"
                    />
                    <span class="rate-suffix">Tk</span>
                  </div>
                </td>
                <td class="col-date text-center">
                  <input
                    v-model="row.effectiveFrom"
                    type="date"
                    :min="row.effectiveFrom"
                    class="form-control idp-field effective-date-input mx-auto"
                    style="max-width: 140px; height: 36px; font-size: 0.82rem;"
                    onkeydown="return false"
                    @input="onRateChange"
                  />
                </td>
                <td class="col-action">
                  <button
                    type="button"
                    class="btn-icon-danger"
                    title="Retire this service (past rates are kept)"
                    @click="removeService(row.serviceItemId)"
                  >
                    <i class="bi bi-trash3"></i>
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="rate-total-row">
                <td class="col-item">
                  <i class="bi bi-calculator me-1"></i> Total combined rate
                </td>
                <td class="col-rate">
                  <div class="rate-input-wrap">
                    <strong class="rate-total">{{ totalRate.toFixed(2) }}</strong>
                    <span class="rate-suffix">Tk</span>
                  </div>
                </td>
                <td class="col-date"></td>
                <td class="col-action"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Retired services: read-only history, never editable -->
        <div v-if="retiredRates.length" class="retired-block mt-3">
          <div class="retired-title text-muted small fw-semibold mb-2">
            <i class="bi bi-lock me-1"></i>
            Retired rates — kept for past-month calculations, no longer accruing
          </div>
          <div v-for="row in retiredRates" :key="row.serviceItemId" class="retired-row">
            <i class="bi bi-receipt text-secondary module-icon"></i>
            <span class="text-muted">{{ row.itemName }}</span>
            <span class="retired-meta">
              {{ Number(row.rate).toFixed(2) }} Tk · ended {{ row.effectiveTo || '—' }}
            </span>
            <span class="badge version-badge" :title="versionTooltip(row.history)">
              {{ row.versionCount }} versions
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.idp-form-card {
  background: var(--idp-card);
  border: 1px solid var(--idp-border);
  border-radius: var(--idp-radius);
}

.table-custom {
  width: 100%;
  border-collapse: collapse;
}

.table-custom thead tr {
  background: var(--idp-bg);
  border-bottom: 1px solid var(--idp-border);
}

.table-custom th {
  padding: 12px 16px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--idp-text-muted);
  white-space: nowrap;
}

.table-custom td {
  height: 56px;
  padding: 10px 16px;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--idp-border);
  vertical-align: middle;
  color: var(--idp-text-main);
}

.table-custom tbody tr:last-child td {
  border-bottom: none;
}

.table-custom tbody tr:hover td {
  background: var(--idp-card-hover);
}

.rate-table .col-item {
  min-width: 220px;
}

.rate-table .col-rate {
  width: 240px;
}

.rate-table .col-date {
  width: 160px;
}

.rate-table .col-action {
  width: 84px;
  text-align: right;
}

.assign-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--idp-border);
}

.assign-field {
  display: flex;
  flex-direction: column;
}

.assign-item {
  flex: 0 1 380px;
  max-width: 420px;
  min-width: 240px;
}

.assign-rate {
  flex: 0 0 150px;
  max-width: 150px;
}

.assign-date {
  flex: 0 0 155px;
  max-width: 155px;
}

.effective-date-input {
  height: 38px;
  padding: 6px 10px !important;
  color: var(--idp-text-main);
  background-color: var(--idp-bg);
  cursor: pointer;
}

.assign-action {
  flex: 0 0 auto;
}

.assign-btn {
  height: 38px;
  padding: 0 18px;
}

.version-badge {
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(13, 110, 253, 0.15);
  color: #6ea8fe;
  border: 1px solid rgba(13, 110, 253, 0.35);
  cursor: help;
}

.current-badge {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(25, 135, 84, 0.16);
  color: #75d1a0;
  border: 1px solid rgba(25, 135, 84, 0.4);
}

.pending-badge {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 193, 7, 0.16);
  color: #ffca2c;
  border: 1px solid rgba(255, 193, 7, 0.45);
}

.retired-block {
  border: 1px dashed var(--idp-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(148, 163, 184, 0.04);
}

.retired-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.82rem;
}

.retired-meta {
  margin-left: auto;
  color: var(--idp-text-muted);
  font-size: 0.76rem;
  white-space: nowrap;
}

.rate-version-hint {
  padding: 0 2px 6px;
  line-height: 1.4;
}

.rate-empty {
  padding: 32px 16px;
  font-size: 0.85rem;
}

.btn-icon-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--idp-border);
  border-radius: 6px;
  background: transparent;
  color: var(--idp-text-muted);
  font-size: 0.9rem;
  line-height: 1;
  transition: all 0.15s ease;
}

.btn-icon-danger:hover {
  color: #fff;
  background: rgba(220, 53, 69, 0.18);
  border-color: rgba(220, 53, 69, 0.55);
}

.rate-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.rate-input {
  width: 100% !important;
  height: 38px !important;
  padding: 6px 38px 6px 12px !important;
  text-align: right !important;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.rate-suffix {
  position: absolute;
  right: 12px;
  pointer-events: none;
  color: var(--idp-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.rate-total {
  color: var(--idp-text-main);
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}

.rate-total-row td {
  height: auto;
  padding-top: 12px;
  padding-bottom: 12px;
  background: var(--idp-bg);
  border-top: 1px solid var(--idp-border);
  border-bottom: none;
  color: var(--idp-text-muted);
  font-size: 0.82rem;
}

.idp-field {
  width: 100%;
  height: 40px;
  padding: 8px 12px;
  background-color: var(--idp-bg) !important;
  border: 1px solid var(--idp-border) !important;
  border-radius: 6px !important;
  color: var(--idp-text-main) !important;
  font-size: 0.88rem;
}

.idp-field:focus {
  border-color: var(--idp-primary) !important;
  box-shadow: none !important;
  outline: none;
}
</style>
