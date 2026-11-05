<script setup lang="ts">
defineProps<{
  statusFilter: "all" | "submitted" | "pending" | "late_submitted";
  stats: {
    totalActive: number;
    submittedCount: number;
    lateSubmittedCount: number;
    pendingCount: number;
  };
}>();

const emit = defineEmits<{
  "update:statusFilter": [filter: "all" | "submitted" | "pending" | "late_submitted"];
}>();
</script>

<template>
  <div class="row g-3 mb-3 d-print-none">
    <div class="col-6 col-md-3">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': statusFilter === 'all' }"
        @click="emit('update:statusFilter', 'all')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">All Active Clients</span>
          <i class="bi bi-building text-primary"></i>
        </div>
        <div class="stat-val text-white">{{ stats.totalActive }}</div>
      </div>
    </div>

    <div class="col-6 col-md-3">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': statusFilter === 'submitted' }"
        @click="emit('update:statusFilter', 'submitted')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Submitted</span>
          <i class="bi bi-check-circle-fill text-success"></i>
        </div>
        <div class="stat-val text-success">{{ stats.submittedCount }}</div>
      </div>
    </div>

    <div class="col-6 col-md-3">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': statusFilter === 'late_submitted' }"
        @click="emit('update:statusFilter', 'late_submitted')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Late Submitted</span>
          <i class="bi bi-exclamation-triangle-fill text-warning"></i>
        </div>
        <div class="stat-val text-warning">{{ stats.lateSubmittedCount }}</div>
      </div>
    </div>

    <div class="col-6 col-md-3">
      <div
        class="stat-pill cursor-pointer"
        :class="{ 'stat-pill-active': statusFilter === 'pending' }"
        @click="emit('update:statusFilter', 'pending')"
      >
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted stat-label">Pending</span>
          <i class="bi bi-hourglass-split text-danger"></i>
        </div>
        <div class="stat-val text-danger">{{ stats.pendingCount }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-pill {
  background: #1e2227;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  transition: all 0.2s ease;
}

.stat-pill:hover {
  background: #252b32;
  border-color: #0d6efd;
  transform: translateY(-2px);
}

.stat-pill-active {
  border-color: #0d6efd !important;
  background: #192434 !important;
}

.stat-label {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.stat-val {
  font-size: 1.65rem;
  font-weight: 800;
  line-height: 1.2;
}

.cursor-pointer {
  cursor: pointer;
}
</style>
