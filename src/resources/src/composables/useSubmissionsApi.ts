import axios from "axios";
import { ref, shallowRef } from "vue";

export interface SubmissionItem {
  id: number; // Client ID
  submissionRecordId: number | null; // vat_submissions.id
  companyName: string;
  address?: string;
  binNumber?: string;
  mobile?: string;
  customerTypeId?: number;
  customerTypeName?: string;
  referenceId?: number;
  referenceName?: string;
  taxPeriod: string;
  submissionId: string | null;
  status: "submitted" | "pending" | "late_submitted";
  submittedById?: number | null;
  submittedByName?: string | null;
  updatedById?: number | null;
  updatedByName?: string | null;
  isEdited?: boolean;
  submittedAt?: string | null;
  remarks?: string | null;
  managers: Array<{ id: number; name: string }>;
}

export interface SubmissionsStats {
  totalActive: number;
  submittedCount: number;
  pendingCount: number;
  lateSubmittedCount: number;
}

export interface SubmitterOption {
  id: number;
  name: string;
  count: number;
}

// Module-scoped persistent reactive state (SWR / Stale-While-Revalidate)
// Ensures that on route transitions, existing submissions data is rendered immediately
// (0ms latency, no empty table flash / prolonged loading spinner) while background revalidation occurs.
const cachedSubmissions = shallowRef<SubmissionItem[]>([]);
const cachedStats = ref<SubmissionsStats>({
  totalActive: 0,
  submittedCount: 0,
  pendingCount: 0,
  lateSubmittedCount: 0
});
const cachedSubmitters = ref<SubmitterOption[]>([]);
const hasLoadedSubmissionsOnce = ref(false);

export function useSubmissionsApi() {
  const submissions = cachedSubmissions;
  const stats = cachedStats;
  const submitters = cachedSubmitters;
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchSubmissions = async (
    params: {
      month?: string;
      taxPeriod?: string;
      customerTypeId?: number | string;
      referenceId?: number | string;
      managerId?: number | string;
      submittedById?: number | string;
      status?: string;
      search?: string;
    } = {}
  ) => {
    if (!hasLoadedSubmissionsOnce.value || submissions.value.length === 0) {
      loading.value = true;
    }
    error.value = null;
    try {
      const cleanParams: Record<string, any> = {};
      if (params.month) cleanParams.month = params.month;
      if (params.taxPeriod) cleanParams.taxPeriod = params.taxPeriod;
      if (params.customerTypeId && params.customerTypeId !== "all") cleanParams.customerTypeId = params.customerTypeId;
      if (params.referenceId && params.referenceId !== "all") cleanParams.referenceId = params.referenceId;
      if (params.managerId && params.managerId !== "all") cleanParams.managerId = params.managerId;
      if (params.submittedById && params.submittedById !== "all") cleanParams.submittedById = params.submittedById;
      if (params.status && params.status !== "all") cleanParams.status = params.status;
      if (params.search && params.search.trim()) cleanParams.search = params.search.trim();

      const res = await axios.get("/api/submissions", { params: cleanParams });
      submissions.value = res.data?.data || [];
      if (res.data?.stats) {
        stats.value = res.data.stats;
      }
      submitters.value = res.data?.submitters || [];
      hasLoadedSubmissionsOnce.value = true;
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch submissions";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const recordSubmission = async (payload: {
    clientId: number;
    taxPeriod: string;
    submissionId: string;
    submittedAt?: string;
    remarks?: string;
  }) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.post("/api/submissions", payload);
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to record submission";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const deleteSubmission = async (id: number) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.delete(`/api/submissions/${id}`);
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to delete submission";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const batchDeleteSubmissions = async (ids: number[]) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await axios.post("/api/submissions/batch-delete", { ids });
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to batch delete submissions";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    submissions,
    stats,
    submitters,
    loading,
    error,
    fetchSubmissions,
    recordSubmission,
    deleteSubmission,
    batchDeleteSubmissions
  };
}
