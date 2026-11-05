import { ref } from "vue";
import axios from "axios";
import { useToast } from "./useToast";

export interface ActivityClientSubmission {
  submissionId: string;
  status: string;
  submittedAt?: string;
  submittedBy?: string;
  remarks?: string;
}

export interface ActivityClient {
  id: number;
  name: string;
  companyName: string;
  proprietorName?: string;
  bin?: string;
  binNumber?: string;
  tinNumber?: string;
  mobile?: string;
  username?: string;
  password?: string;
  clientTypeId?: number;
  clientType: string;
  referenceId?: number;
  reference: string;
  taxPeriod: string;
  purchaseAmount: number;
  beCount?: number;
  isSubmitted: boolean;
  submission: ActivityClientSubmission | null;
}

export interface ActivityStats {
  totalClients: number;
  activeClients: number;
  activeFiledClients: number;
  activeUnfiledClients: number;
  inactiveClients: number;
  inactiveFiledClients: number;
  inactiveUnfiledClients: number;
  totalFiledClients: number;
  totalUnfiledClients: number;
  totalPurchaseSum: number;
  totalBeCount?: number;
}

// Module-scoped persistent reactive state (SWR / Stale-While-Revalidate)
// Ensures that on route transitions, existing matrix data and stats are rendered immediately
// (0ms latency, no empty table flash / prolonged loading spinner) while background revalidation occurs.
const cachedMatrixData = ref<ActivityClient[]>([]);
const cachedStats = ref<ActivityStats>({
  totalClients: 0,
  activeClients: 0,
  activeFiledClients: 0,
  activeUnfiledClients: 0,
  inactiveClients: 0,
  inactiveFiledClients: 0,
  inactiveUnfiledClients: 0,
  totalFiledClients: 0,
  totalUnfiledClients: 0,
  totalPurchaseSum: 0,
  totalBeCount: 0
});
const cachedClientTypes = ref<Array<{ id: number; name: string }>>([]);
const cachedReferences = ref<Array<{ id: number; name: string }>>([]);
const hasLoadedMatrixOnce = ref(false);

export function useActivityFilterApi() {
  const toast = useToast();
  const loading = ref(false);
  const matrixData = cachedMatrixData;
  const stats = cachedStats;
  const clientTypes = cachedClientTypes;
  const references = cachedReferences;

  const loadActivityMatrix = async (month?: string) => {
    if (!hasLoadedMatrixOnce.value || matrixData.value.length === 0) {
      loading.value = true;
    }
    try {
      const res = await axios.get("/api/activity-filter", {
        params: { month }
      });
      if (res.data && res.data.success) {
        matrixData.value = res.data.data || [];
        stats.value = res.data.stats || {
          totalClients: 0,
          activeClients: 0,
          activeFiledClients: 0,
          activeUnfiledClients: 0,
          inactiveClients: 0,
          inactiveFiledClients: 0,
          inactiveUnfiledClients: 0,
          totalFiledClients: 0,
          totalUnfiledClients: 0,
          totalPurchaseSum: 0
        };
        clientTypes.value = res.data.clientTypes || [];
        references.value = res.data.references || [];
        hasLoadedMatrixOnce.value = true;
      }
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to load activity matrix";
      toast.error(msg, 1000);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const recordSubmission = async (payload: {
    clientId: number;
    taxPeriod: string;
    submissionId: string;
    remarks?: string;
  }) => {
    try {
      const res = await axios.post("/api/submissions", payload);
      toast.success("Submission ID recorded successfully", 1000);
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to record submission";
      toast.error(msg, 1000);
      throw err;
    }
  };

  return {
    loading,
    matrixData,
    stats,
    clientTypes,
    references,
    loadActivityMatrix,
    recordSubmission
  };
}
