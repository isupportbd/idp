import axios from "axios";
import { defineStore } from "pinia";
import { ref } from "vue";

export interface CustomerType {
  id: number;
  typeName: string;
  description?: string;
  isActive: boolean;
}

export interface ClientReference {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive: boolean;
}

export interface ServiceItem {
  id: number;
  itemName: string;
  isActive: boolean;
}

export interface ServiceUnit {
  id: number;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface ServiceRate {
  id: number;
  serviceItemId: number;
  customerTypeId: number | null;
  unit?: string;
  regularRate: number;
  minimumCharge: number;
  effectiveFrom: string;
  itemName?: string;
  typeName?: string | null;
}

export interface MeasurementUnit {
  id: number;
  code: string;
  name: string;
  symbol?: string;
  description?: string;
  isActive: boolean;
}

export interface AssignableUserItem {
  id: number;
  name: string;
  email: string;
}

export interface ClientLookupItem {
  id: number;
  name: string;
  companyName?: string;
  bin?: string;
  binNumber?: string;
  referenceId?: number;
  openingBalance?: number;
  vatServiceType?: string;
  vatUserId?: string;
  vatPassword?: string;
}

export interface ItemLookupItem {
  id: number;
  name: string;
  itemName?: string;
  hsCode?: string;
}

export interface UnitConversionItem {
  id: number;
  purchaseUnit: string;
  salesUnit: string;
  factor: number;
}

function getSession<T>(key: string): T | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  return null;
}

function setSession(key: string, val: unknown) {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(key, JSON.stringify(val));
    }
  } catch {}
}

export const useMasterDataStore = defineStore("masterData", () => {
  const cachedCustomerTypes = getSession<CustomerType[]>("idp_cache_ct");
  const cachedReferences = getSession<ClientReference[]>("idp_cache_ref");
  const cachedAssignableUsers = getSession<AssignableUserItem[]>("idp_cache_users");

  const customerTypes = ref<CustomerType[]>(cachedCustomerTypes || []);
  const references = ref<ClientReference[]>(cachedReferences || []);
  const serviceItems = ref<ServiceItem[]>([]);
  const serviceRates = ref<ServiceRate[]>([]);
  const serviceUnits = ref<ServiceUnit[]>([]);
  const measurementUnits = ref<MeasurementUnit[]>([]);
  const assignableUsers = ref<AssignableUserItem[]>(cachedAssignableUsers || []);
  const clientsLookup = ref<ClientLookupItem[]>([]);
  const itemsLookup = ref<ItemLookupItem[]>([]);
  const unitConversions = ref<UnitConversionItem[]>([]);

  const loadedCustomerTypes = ref(!!cachedCustomerTypes?.length);
  const loadedReferences = ref(!!cachedReferences?.length);
  const loadedServiceItems = ref(false);
  const loadedServiceRates = ref(false);
  const loadedServiceUnits = ref(false);
  const loadedMeasurementUnits = ref(false);
  const loadedAssignableUsers = ref(!!cachedAssignableUsers?.length);
  const loadedClientsLookup = ref(false);
  const loadedItemsLookup = ref(false);
  const loadedUnitConversions = ref(false);

  // In-flight request deduplication promises
  let pCustomerTypes: Promise<CustomerType[]> | null = null;
  let pReferences: Promise<ClientReference[]> | null = null;
  let pServiceItems: Promise<ServiceItem[]> | null = null;
  let pServiceRates: Promise<ServiceRate[]> | null = null;
  let pServiceUnits: Promise<ServiceUnit[]> | null = null;
  let pMeasurementUnits: Promise<MeasurementUnit[]> | null = null;
  let pAssignableUsers: Promise<AssignableUserItem[]> | null = null;
  let pClientsLookup: Promise<ClientLookupItem[]> | null = null;
  let pItemsLookup: Promise<ItemLookupItem[]> | null = null;
  let pUnitConversions: Promise<UnitConversionItem[]> | null = null;

  const fetchCustomerTypes = async (force = false): Promise<CustomerType[]> => {
    if (loadedCustomerTypes.value && !force && customerTypes.value.length > 0) {
      return customerTypes.value;
    }
    if (pCustomerTypes) return pCustomerTypes;
    pCustomerTypes = (async () => {
      try {
        const res = await axios.get("/api/services/customer-types");
        customerTypes.value = res.data.data || [];
        loadedCustomerTypes.value = true;
        setSession("idp_cache_ct", customerTypes.value);
        return customerTypes.value;
      } catch (e) {
        console.error("Failed to fetch customer types:", e);
        return customerTypes.value;
      } finally {
        pCustomerTypes = null;
      }
    })();
    return pCustomerTypes;
  };

  const fetchReferences = async (force = false): Promise<ClientReference[]> => {
    if (loadedReferences.value && !force && references.value.length > 0) {
      return references.value;
    }
    if (pReferences) return pReferences;
    pReferences = (async () => {
      try {
        const res = await axios.get("/api/services/references");
        references.value = res.data.data || [];
        loadedReferences.value = true;
        setSession("idp_cache_ref", references.value);
        return references.value;
      } catch (e) {
        console.error("Failed to fetch references:", e);
        return references.value;
      } finally {
        pReferences = null;
      }
    })();
    return pReferences;
  };

  const fetchServiceItems = async (force = false): Promise<ServiceItem[]> => {
    if (loadedServiceItems.value && !force && serviceItems.value.length > 0) {
      return serviceItems.value;
    }
    if (pServiceItems) return pServiceItems;
    pServiceItems = (async () => {
      try {
        const res = await axios.get("/api/services/items");
        serviceItems.value = res.data.data || [];
        loadedServiceItems.value = true;
        return serviceItems.value;
      } catch (e) {
        console.error("Failed to fetch service items:", e);
        return serviceItems.value;
      } finally {
        pServiceItems = null;
      }
    })();
    return pServiceItems;
  };

  const fetchServiceRates = async (force = false): Promise<ServiceRate[]> => {
    if (loadedServiceRates.value && !force && serviceRates.value.length > 0) {
      return serviceRates.value;
    }
    if (pServiceRates) return pServiceRates;
    pServiceRates = (async () => {
      try {
        const res = await axios.get("/api/services/rates");
        serviceRates.value = (res.data.data || []).map((r: any) => ({
          ...r,
          itemName: r.serviceItem?.itemName || "General",
          typeName: r.customerType?.typeName || "All Customer Types"
        }));
        loadedServiceRates.value = true;
        return serviceRates.value;
      } catch (e) {
        console.error("Failed to fetch service rates:", e);
        return serviceRates.value;
      } finally {
        pServiceRates = null;
      }
    })();
    return pServiceRates;
  };

  const fetchServiceUnits = async (force = false): Promise<ServiceUnit[]> => {
    if (loadedServiceUnits.value && !force && serviceUnits.value.length > 0) {
      return serviceUnits.value;
    }
    if (pServiceUnits) return pServiceUnits;
    pServiceUnits = (async () => {
      try {
        const res = await axios.get("/api/superadmin/service-units");
        if (res.data?.success && Array.isArray(res.data.data)) {
          serviceUnits.value = res.data.data;
        }
        loadedServiceUnits.value = true;
        return serviceUnits.value;
      } catch (e) {
        console.error("Failed to load service units:", e);
        return serviceUnits.value;
      } finally {
        pServiceUnits = null;
      }
    })();
    return pServiceUnits;
  };

  const fetchMeasurementUnits = async (force = false): Promise<MeasurementUnit[]> => {
    if (loadedMeasurementUnits.value && !force && measurementUnits.value.length > 0) {
      return measurementUnits.value;
    }
    if (pMeasurementUnits) return pMeasurementUnits;
    pMeasurementUnits = (async () => {
      try {
        const res = await axios.get("/api/superadmin/measurement-units");
        if (res.data?.success && Array.isArray(res.data.data)) {
          measurementUnits.value = res.data.data;
        }
        loadedMeasurementUnits.value = true;
        return measurementUnits.value;
      } catch (e) {
        console.error("Failed to load measurement units:", e);
        return measurementUnits.value;
      } finally {
        pMeasurementUnits = null;
      }
    })();
    return pMeasurementUnits;
  };

  const fetchAssignableUsers = async (force = false): Promise<AssignableUserItem[]> => {
    if (loadedAssignableUsers.value && !force && assignableUsers.value.length > 0) {
      return assignableUsers.value;
    }
    if (pAssignableUsers) return pAssignableUsers;
    pAssignableUsers = (async () => {
      try {
        const res = await axios.get("/api/clients/users");
        assignableUsers.value = res.data?.data || [];
        loadedAssignableUsers.value = true;
        setSession("idp_cache_users", assignableUsers.value);
        return assignableUsers.value;
      } catch (e) {
        console.error("Failed to fetch assignable users:", e);
        return assignableUsers.value;
      } finally {
        pAssignableUsers = null;
      }
    })();
    return pAssignableUsers;
  };

  const fetchClientsLookup = async (force = false): Promise<ClientLookupItem[]> => {
    if (loadedClientsLookup.value && !force && clientsLookup.value.length > 0) {
      return clientsLookup.value;
    }
    if (pClientsLookup) return pClientsLookup;
    pClientsLookup = (async () => {
      try {
        const res = await axios.get("/api/clients", { params: { limit: 1000, isActive: "all" } });
        const list = res.data?.data || [];
        clientsLookup.value = list.map((c: any) => ({
          id: c.id,
          name: c.companyName || c.name || "Client #" + c.id,
          companyName: c.companyName,
          bin: c.binNumber || c.bin || "",
          binNumber: c.binNumber || c.bin || "",
          referenceId: c.referenceId,
          openingBalance: c.openingBalance || 0,
          vatServiceType: c.vatServiceType || "FULL",
          vatUserId: c.vatUserId || "",
          vatPassword: c.vatPassword || ""
        }));
        loadedClientsLookup.value = true;
        return clientsLookup.value;
      } catch (e) {
        console.error("Failed to load clients lookup:", e);
        return clientsLookup.value;
      } finally {
        pClientsLookup = null;
      }
    })();
    return pClientsLookup;
  };

  const fetchItemsLookup = async (force = false): Promise<ItemLookupItem[]> => {
    if (loadedItemsLookup.value && !force && itemsLookup.value.length > 0) {
      return itemsLookup.value;
    }
    if (pItemsLookup) return pItemsLookup;
    pItemsLookup = (async () => {
      try {
        const res = await axios.get("/api/items", { params: { limit: 1000 } });
        const list = res.data?.data || [];
        itemsLookup.value = list.map((i: any) => ({
          id: i.id,
          name: i.itemName || i.name,
          itemName: i.itemName || i.name,
          hsCode: i.hsCode || ""
        }));
        loadedItemsLookup.value = true;
        return itemsLookup.value;
      } catch (e) {
        console.error("Failed to load items lookup:", e);
        return itemsLookup.value;
      } finally {
        pItemsLookup = null;
      }
    })();
    return pItemsLookup;
  };

  const fetchUnitConversions = async (force = false): Promise<UnitConversionItem[]> => {
    if (loadedUnitConversions.value && !force && unitConversions.value.length > 0) {
      return unitConversions.value;
    }
    if (pUnitConversions) return pUnitConversions;
    pUnitConversions = (async () => {
      try {
        const res = await axios.get("/api/superadmin/unit-conversions", { params: { all: "true" } });
        const list = res.data?.data || [];
        unitConversions.value = list.map((u: any) => ({
          id: u.id,
          purchaseUnit: u.purchaseUnit,
          salesUnit: u.salesUnit,
          factor: Number(u.factor || 1)
        }));
        loadedUnitConversions.value = true;
        return unitConversions.value;
      } catch (e) {
        console.error("Failed to load unit conversions:", e);
        return unitConversions.value;
      } finally {
        pUnitConversions = null;
      }
    })();
    return pUnitConversions;
  };

  const invalidate = (type?: string) => {
    if (!type || type === "client-types") {
      loadedCustomerTypes.value = false;
      loadedServiceRates.value = false;
      try {
        sessionStorage.removeItem("idp_cache_ct");
      } catch {}
    }
    if (!type || type === "references") {
      loadedReferences.value = false;
      try {
        sessionStorage.removeItem("idp_cache_ref");
      } catch {}
    }
    if (!type || type === "users") {
      loadedAssignableUsers.value = false;
      try {
        sessionStorage.removeItem("idp_cache_users");
      } catch {}
    }
    if (!type || type === "clients") loadedClientsLookup.value = false;
    if (!type || type === "items") loadedItemsLookup.value = false;
    if (!type || type === "service-items") {
      loadedServiceItems.value = false;
      loadedServiceRates.value = false;
    }
    if (!type || type === "service-rates") loadedServiceRates.value = false;
    if (!type || type === "service-units") loadedServiceUnits.value = false;
    if (!type || type === "measurement-units") loadedMeasurementUnits.value = false;
    if (!type || type === "unit-conversions") loadedUnitConversions.value = false;
  };

  return {
    customerTypes,
    references,
    serviceItems,
    serviceRates,
    serviceUnits,
    measurementUnits,
    assignableUsers,
    clientsLookup,
    itemsLookup,
    unitConversions,
    fetchCustomerTypes,
    fetchReferences,
    fetchServiceItems,
    fetchServiceRates,
    fetchServiceUnits,
    fetchMeasurementUnits,
    fetchAssignableUsers,
    fetchClientsLookup,
    fetchItemsLookup,
    fetchUnitConversions,
    invalidate
  };
});
