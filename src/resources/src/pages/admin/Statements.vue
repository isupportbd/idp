<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BillingLedgerTab from "./statements/tabs/BillingLedgerTab.vue";
import PurchaseStatementTab from "./statements/tabs/PurchaseStatementTab.vue";

const route = useRoute();
const router = useRouter();

type StatementTab = "purchase" | "billing";

const activeTab = ref<StatementTab>((route.query.tab as StatementTab) || "purchase");

// Sync tab with URL query parameter
watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab === "billing" || newTab === "purchase") {
      activeTab.value = newTab;
    }
  }
);

const switchTab = (tab: StatementTab) => {
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } });
};

const tabTitle = computed(() => {
  return activeTab.value === "billing"
    ? "Client Billing & Payment Ledger"
    : "Client Purchase & Submission Statement";
});
</script>

<template>
  <div class="statements-page">
    <!-- Main Header -->
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <router-link to="/dashboard" class="btn btn-sm btn-link text-muted p-0 text-decoration-none">
            <i class="bi bi-arrow-left"></i> Dashboard
          </router-link>
          <span class="text-muted">/</span>
          <span class="text-white small fw-medium">Statements</span>
        </div>
        <h4 class="text-white fw-bold mb-0">{{ tabTitle }}</h4>
      </div>
    </div>

    <!-- NextGen Tab Switcher Bar -->
    <div class="card idp-card border-0 mb-4 p-1 bg-dark bg-opacity-75 statements-tab-bar">
      <ul class="nav nav-pills nav-fill gap-1">
        <li class="nav-item">
          <button
            type="button"
            class="nav-link py-2 px-3 d-flex align-items-center justify-content-center gap-2 fw-medium"
            :class="{ active: activeTab === 'purchase' }"
            @click="switchTab('purchase')"
          >
            <i class="bi bi-box-seam"></i>
            <span>Purchase &amp; Submission Statement</span>
          </button>
        </li>
        <li class="nav-item">
          <button
            type="button"
            class="nav-link py-2 px-3 d-flex align-items-center justify-content-center gap-2 fw-medium"
            :class="{ active: activeTab === 'billing' }"
            @click="switchTab('billing')"
          >
            <i class="bi bi-journal-check"></i>
            <span>Client Billing &amp; Payment Ledger</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Active Tab Component -->
    <div class="tab-content">
      <PurchaseStatementTab v-if="activeTab === 'purchase'" />
      <BillingLedgerTab v-else-if="activeTab === 'billing'" />
    </div>
  </div>
</template>

<style scoped>
.statements-page {
  width: 100%;
  padding-bottom: 2rem;
}

.statements-tab-bar {
  border-radius: 8px;
  background-color: #14171a !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.statements-tab-bar .nav-link {
  color: #94a3b8;
  border-radius: 6px;
  transition: all 0.2s ease-in-out;
  border: 1px solid transparent;
}

.statements-tab-bar .nav-link:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.05);
}

.statements-tab-bar .nav-link.active {
  color: #fff !important;
  background-color: #3b82f6 !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
}
</style>
