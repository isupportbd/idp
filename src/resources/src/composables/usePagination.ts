import { type ComputedRef, computed, onMounted, type Ref, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

export interface PaginationOptions {
  defaultPage?: number;
  defaultPerPage?: number;
  totalItems?: Ref<number> | ComputedRef<number>;
  syncUrl?: boolean;
}

/**
 * Enterprise Reusable Persistent Pagination Composable
 * Supports automatic URL query param sync (?page=X), sessionStorage fallback,
 * boundary clamping, and client-side array slicing.
 */
export function usePagination(storageKey: string, options: PaginationOptions = {}) {
  const router = useRouter();
  const route = useRoute();

  const syncUrl = options.syncUrl !== false;
  const defaultPage = options.defaultPage || 1;

  const getInitialPerPage = (): number => {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const saved = Number(sessionStorage.getItem(`idp_per_page_${storageKey}`));
      if (!isNaN(saved) && saved > 0) return saved;
    }
    return options.defaultPerPage || 10;
  };

  const itemsPerPage = ref(getInitialPerPage());

  // Read initial page from URL query param first, then sessionStorage, then defaultPage
  const getInitialPage = (): number => {
    if (syncUrl && route?.query?.page) {
      const p = Number(route.query.page);
      if (!isNaN(p) && p > 0) return p;
    }
    if (typeof window !== "undefined" && window.sessionStorage) {
      const saved = Number(sessionStorage.getItem(`idp_page_${storageKey}`));
      if (!isNaN(saved) && saved > 0) return saved;
    }
    return defaultPage;
  };

  const currentPage = ref(getInitialPage());

  // Compute totalPages if totalItems ref is provided
  const totalPages = computed(() => {
    if (!options.totalItems) return 1;
    const total = Number(options.totalItems.value) || 0;
    return Math.max(1, Math.ceil(total / itemsPerPage.value));
  });

  const startIndex = computed(() => (currentPage.value - 1) * itemsPerPage.value);
  const endIndex = computed(() => {
    const total = options.totalItems ? Number(options.totalItems.value) || 0 : currentPage.value * itemsPerPage.value;
    return Math.min(currentPage.value * itemsPerPage.value, total);
  });

  // Clamp currentPage if totalPages shrinks
  if (options.totalItems) {
    watch(totalPages, (maxPages) => {
      if (currentPage.value > maxPages && maxPages > 0) {
        currentPage.value = maxPages;
      }
    });
  }

  watch(itemsPerPage, (newVal) => {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(`idp_per_page_${storageKey}`, String(newVal));
    }
  });

  // Sync to sessionStorage and URL query param (debounced to avoid navigation thrash)
  // Guard with hasMounted to ignore spurious initial navigation on component mount
  let hasMounted = false;
  onMounted(() => {
    // Enable sync only after initial mount and paint
    setTimeout(() => {
      hasMounted = true;
    }, 50);
  });

  let urlSyncTimer: ReturnType<typeof setTimeout> | null = null;
  watch(currentPage, (newPage) => {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(`idp_page_${storageKey}`, String(newPage));
    }
    if (!hasMounted) return;
    if (syncUrl && router && route && Number(route.query?.page) !== newPage) {
      if (urlSyncTimer) clearTimeout(urlSyncTimer);
      urlSyncTimer = setTimeout(() => {
        router.replace({
          query: {
            ...route.query,
            page: newPage > 1 ? String(newPage) : undefined
          }
        });
      }, 300);
    }
  });

  const resetPage = () => {
    currentPage.value = 1;
  };

  const nextPage = () => {
    if (options.totalItems) {
      if (currentPage.value < totalPages.value) currentPage.value++;
    } else {
      currentPage.value++;
    }
  };

  const prevPage = () => {
    if (currentPage.value > 1) currentPage.value--;
  };

  const setPage = (p: number) => {
    if (p >= 1 && (!options.totalItems || p <= totalPages.value)) {
      currentPage.value = p;
    }
  };

  // Helper to slice an array client-side
  const paginateList = <T>(list: T[]): T[] => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    return list.slice(start, start + itemsPerPage.value);
  };

  return {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    resetPage,
    nextPage,
    prevPage,
    setPage,
    paginateList
  };
}
