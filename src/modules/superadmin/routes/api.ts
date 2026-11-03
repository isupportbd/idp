import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";
import {
  getTenants,
  getPendingSignups,
  approveSignup,
  rejectSignup,
  extendTenant,
  getTenantTransactions,
  toggleTenantStatus,
  deleteTenant,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getPaymentSettings,
  savePaymentSettings,
  getStorageStats,
  getClientTypes,
  createClientType,
  updateClientType,
  toggleClientTypeStatus,
  deleteClientType,
  getLocations,
  createLocation,
  updateLocation,
  toggleLocationStatus,
  deleteLocation,
  getCommercialAreas,
  createCommercialArea,
  updateCommercialArea,
  toggleCommercialAreaStatus,
  deleteCommercialArea,
  getClientReferences,
  createClientReference,
  updateClientReference,
  toggleClientReferenceStatus,
  deleteClientReference,
  getColumnMappings,
  saveColumnMappings,
  getGlobalItems,
  createGlobalItem,
  updateGlobalItem,
  toggleGlobalItemStatus,
  deleteGlobalItem,
  getMeasurementUnits,
  createMeasurementUnit,
  updateMeasurementUnit,
  toggleMeasurementUnitStatus,
  deleteMeasurementUnit,
  getServiceUnits,
  createServiceUnit,
  updateServiceUnit,
  toggleServiceUnitStatus,
  deleteServiceUnit,
  getVatNotes,
  createVatNote,
  updateVatNote,
  toggleVatNoteStatus,
  deleteVatNote,
  getUnitConversions,
  createUnitConversion,
  updateUnitConversion,
  deleteUnitConversion,
  getNotifications,
  getGlobalMetrics,
  getPlatformPublicStats,
  getPendingRecharges,
  approveRecharge,
  rejectRecharge,
  exportDatabaseBackup,
  restoreDatabaseBackup
} from "../controllers/superadmin.controller.js";
import {
  PlanSchema,
  ApproveSignupSchema,
  RejectSignupSchema,
  ExtendTenantSchema,
  PaymentSettingsSchema,
  ClientTypeSchema,
  LocationSchema,
  CommercialAreaSchema,
  ClientReferenceSchema,
  ColumnMappingsSchema,
  GlobalItemSchema,
  MeasurementUnitSchema,
  ServiceUnitSchema,
  VatNoteSchema,
  UnitConversionSchema
} from "../controllers/superadmin.schema.js";

// ── Shared response schemas ───────────────────────────────────────────────
const OkMessage = z.object({ success: z.boolean(), message: z.string() });
const OkData = z.object({ success: z.boolean(), data: z.unknown() });
const OkDataMessage = z.object({ success: z.boolean(), data: z.unknown(), message: z.string().optional() });
const ErrResponse = z.object({ success: z.boolean(), error: z.string() });

const superAdminMiddleware = [authMiddleware, requireRole("superadmin")];

export const superAdminRouter = createRouter();

/**
 * ── 1. PUBLIC ENDPOINTS (Landing Page / Pre-login) ────────────────────────
 * Explicitly open for prospective tenants to view available plans and pricing
 * before registering an account. Tagged "Public SaaS Landing" so it is
 * unambiguously recognized as intentional public master data.
 */
const publicStatsRoute = createRoute({
  path: "/public-stats",
  method: "get",
  tags: ["Public SaaS Landing"],
  description: "Public platform trust metrics for landing page (pre-login)",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ success: z.boolean(), data: z.object({ tenants: z.string(), users: z.string(), clients: z.string() }) }),
      "Public stats"
    )
  }
});

const publicPlansRoute = createRoute({
  path: "/plans",
  method: "get",
  tags: ["Public SaaS Landing"],
  description: "Public subscription tiers and pricing (pre-login)",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ success: z.boolean(), data: z.array(z.unknown()) }),
      "Public plans"
    )
  }
});

const publicPaymentSettingsRoute = createRoute({
  path: "/payment-settings",
  method: "get",
  tags: ["Public SaaS Landing"],
  description: "Public payment gateway merchant details (pre-login signup flow)",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ success: z.boolean(), data: z.object({ bkashNumber: z.string().nullable(), bkashCharge: z.number().nullable(), nagadNumber: z.string().nullable(), rocketNumber: z.string().nullable() }) }),
      "Public payment settings"
    )
  }
});

superAdminRouter.api(publicStatsRoute, [], getPlatformPublicStats);
superAdminRouter.api(publicPlansRoute, [], getPlans);
superAdminRouter.api(publicPaymentSettingsRoute, [], getPaymentSettings);

/**
 * ── 2. AUTHENTICATED READ-ONLY MASTER DATA ─────────────────────────────────
 * Any authenticated user in good standing can read global dropdown definitions.
 */
const masterDataMiddleware = [authMiddleware];

const getClientTypesRoute = createRoute({
  path: "/client-types",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List client types",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Client types list")
  }
});

const getLocationsRoute = createRoute({
  path: "/locations",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List locations",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Locations list")
  }
});

const getCommercialAreasRoute = createRoute({
  path: "/commercial-areas",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List commercial areas",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Commercial areas list")
  }
});

const getClientReferencesRoute = createRoute({
  path: "/references",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List client references",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Client references list")
  }
});

const getColumnMappingsRoute = createRoute({
  path: "/column-mappings",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List column mappings",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Column mappings list")
  }
});

const getGlobalItemsRoute = createRoute({
  path: "/global-items",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List global HS items",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Global items list")
  }
});

const getMeasurementUnitsRoute = createRoute({
  path: "/measurement-units",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List measurement units",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Measurement units list")
  }
});

const getServiceUnitsRoute = createRoute({
  path: "/service-units",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List service units",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Service units list")
  }
});

const getVatNotesRoute = createRoute({
  path: "/vat-notes",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List VAT note mappings",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "VAT notes list")
  }
});

const getUnitConversionsRoute = createRoute({
  path: "/unit-conversions",
  method: "get",
  tags: ["SuperAdmin", "Master Data"],
  description: "List unit conversion pairs",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Unit conversions list")
  }
});

superAdminRouter.api(getClientTypesRoute, masterDataMiddleware, getClientTypes);
superAdminRouter.api(getLocationsRoute, masterDataMiddleware, getLocations);
superAdminRouter.api(getCommercialAreasRoute, masterDataMiddleware, getCommercialAreas);
superAdminRouter.api(getClientReferencesRoute, masterDataMiddleware, getClientReferences);
superAdminRouter.api(getColumnMappingsRoute, masterDataMiddleware, getColumnMappings);
superAdminRouter.api(getGlobalItemsRoute, masterDataMiddleware, getGlobalItems);
superAdminRouter.api(getMeasurementUnitsRoute, masterDataMiddleware, getMeasurementUnits);
superAdminRouter.api(getServiceUnitsRoute, masterDataMiddleware, getServiceUnits);
superAdminRouter.api(getVatNotesRoute, masterDataMiddleware, getVatNotes);
superAdminRouter.api(getUnitConversionsRoute, masterDataMiddleware, getUnitConversions);

/**
 * ── 3. STRICT SUPERADMIN-ONLY MANAGEMENT ZONE ─────────────────────────────
 * All subsequent endpoints require valid token AND role = 'superadmin'.
 */

// ── Tenants ───────────────────────────────────────────────────────────────
const getTenantsRoute = createRoute({
  path: "/tenants",
  method: "get",
  tags: ["SuperAdmin", "Tenants"],
  description: "List all active tenants (firm admins)",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Tenants list")
  }
});

superAdminRouter.api(getTenantsRoute, superAdminMiddleware, getTenants);

const getPendingSignupsRoute = createRoute({
  path: "/pending-signups",
  method: "get",
  tags: ["SuperAdmin", "Tenants"],
  description: "List pending tenant signups",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Pending signups list")
  }
});

superAdminRouter.api(getPendingSignupsRoute, superAdminMiddleware, getPendingSignups);

const getPendingRechargesRoute = createRoute({
  path: "/pending-recharges",
  method: "get",
  tags: ["SuperAdmin", "Tenants"],
  description: "List pending wallet recharge requests",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Pending recharges list")
  }
});

superAdminRouter.api(getPendingRechargesRoute, superAdminMiddleware, getPendingRecharges);

const approveSignupRoute = createRoute({
  path: "/approve-signup",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Approve a pending tenant signup",
  request: {
    body: jsonContent(ApproveSignupSchema, "Approve signup payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Approval result")
  }
});

superAdminRouter.api(approveSignupRoute, superAdminMiddleware, approveSignup);

const rejectSignupRoute = createRoute({
  path: "/reject-signup",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Reject and remove a pending tenant signup",
  request: {
    body: jsonContent(RejectSignupSchema, "Reject signup payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Rejection result")
  }
});

superAdminRouter.api(rejectSignupRoute, superAdminMiddleware, rejectSignup);

const approveRechargeRoute = createRoute({
  path: "/approve-recharge",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Approve a wallet recharge transaction",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Recharge approval result")
  }
});

superAdminRouter.api(approveRechargeRoute, superAdminMiddleware, approveRecharge);

const rejectRechargeRoute = createRoute({
  path: "/reject-recharge",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Reject a wallet recharge transaction",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Recharge rejection result")
  }
});

superAdminRouter.api(rejectRechargeRoute, superAdminMiddleware, rejectRecharge);

const approveTransactionRoute = createRoute({
  path: "/transactions/:id/approve",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Approve a pending transaction by ID",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Transaction approval result")
  }
});

superAdminRouter.api(approveTransactionRoute, superAdminMiddleware, approveRecharge);

const rejectTransactionRoute = createRoute({
  path: "/transactions/:id/reject",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Reject a pending transaction by ID",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Transaction rejection result")
  }
});

superAdminRouter.api(rejectTransactionRoute, superAdminMiddleware, rejectRecharge);

const extendTenantRoute = createRoute({
  path: "/tenants/:id/extend",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Extend a tenant subscription by days",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(ExtendTenantSchema, "Extend tenant payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Extension result")
  }
});

superAdminRouter.api(extendTenantRoute, superAdminMiddleware, extendTenant);

const getTenantTransactionsRoute = createRoute({
  path: "/tenants/:id/transactions",
  method: "get",
  tags: ["SuperAdmin", "Tenants"],
  description: "Get tenant payment/transaction history",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Tenant transactions")
  }
});

superAdminRouter.api(getTenantTransactionsRoute, superAdminMiddleware, getTenantTransactions);

const toggleTenantStatusRoute = createRoute({
  path: "/tenants/:id/toggle-status",
  method: "post",
  tags: ["SuperAdmin", "Tenants"],
  description: "Toggle tenant active/suspended status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggle result")
  }
});

superAdminRouter.api(toggleTenantStatusRoute, superAdminMiddleware, toggleTenantStatus);

const deleteTenantRoute = createRoute({
  path: "/tenants/:id",
  method: "delete",
  tags: ["SuperAdmin", "Tenants"],
  description: "Permanently delete a tenant",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Deletion result")
  }
});

superAdminRouter.api(deleteTenantRoute, superAdminMiddleware, deleteTenant);

// ── Database Backup & Notifications & Metrics ─────────────────────────────
const databaseBackupRoute = createRoute({
  path: "/database-backup",
  method: "get",
  tags: ["SuperAdmin", "System"],
  description: "Export full database SQL backup",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Database backup")
  }
});

const databaseRestoreRoute = createRoute({
  path: "/database-restore",
  method: "post",
  tags: ["SuperAdmin", "System"],
  description: "Restore database from uploaded SQL backup",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Database restore result")
  }
});

superAdminRouter.api(databaseBackupRoute, superAdminMiddleware, exportDatabaseBackup);
superAdminRouter.api(databaseRestoreRoute, superAdminMiddleware, restoreDatabaseBackup);

const getNotificationsRoute = createRoute({
  path: "/notifications",
  method: "get",
  tags: ["SuperAdmin", "System"],
  description: "List live superadmin notifications",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Notifications list")
  }
});

superAdminRouter.api(getNotificationsRoute, superAdminMiddleware, getNotifications);

const getGlobalMetricsRoute = createRoute({
  path: "/metrics",
  method: "get",
  tags: ["SuperAdmin", "System"],
  description: "Global system metrics for reports",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Global metrics")
  }
});

superAdminRouter.api(getGlobalMetricsRoute, superAdminMiddleware, getGlobalMetrics);

const getStorageStatsRoute = createRoute({
  path: "/storage-stats",
  method: "get",
  tags: ["SuperAdmin", "System"],
  description: "Storage usage stats and tenant ranking",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkData, "Storage stats")
  }
});

superAdminRouter.api(getStorageStatsRoute, superAdminMiddleware, getStorageStats);

// ── Plans & Pricing ───────────────────────────────────────────────────────
const createPlanRoute = createRoute({
  path: "/plans",
  method: "post",
  tags: ["SuperAdmin", "Plans"],
  description: "Create a subscription plan",
  request: {
    body: jsonContent(PlanSchema, "Plan payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Plan created")
  }
});

superAdminRouter.api(createPlanRoute, superAdminMiddleware, createPlan);

const updatePlanRoute = createRoute({
  path: "/plans/:id",
  method: "put",
  tags: ["SuperAdmin", "Plans"],
  description: "Update a subscription plan",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(PlanSchema, "Plan payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Plan updated")
  }
});

superAdminRouter.api(updatePlanRoute, superAdminMiddleware, updatePlan);

const deletePlanRoute = createRoute({
  path: "/plans/:id",
  method: "delete",
  tags: ["SuperAdmin", "Plans"],
  description: "Delete a subscription plan",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Plan deleted")
  }
});

superAdminRouter.api(deletePlanRoute, superAdminMiddleware, deletePlan);

// ── Payment Settings ─────────────────────────────────────────────────────
const savePaymentSettingsRoute = createRoute({
  path: "/payment-settings",
  method: "post",
  tags: ["SuperAdmin", "Payment"],
  description: "Save payment gateway settings",
  request: {
    body: jsonContent(PaymentSettingsSchema, "Payment settings payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Payment settings saved")
  }
});

superAdminRouter.api(savePaymentSettingsRoute, superAdminMiddleware, savePaymentSettings);

// ── Client Types ──────────────────────────────────────────────────────────
const createClientTypeRoute = createRoute({
  path: "/client-types",
  method: "post",
  tags: ["SuperAdmin", "Client Types"],
  description: "Create a client type",
  request: {
    body: jsonContent(ClientTypeSchema, "Client type payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Client type created")
  }
});

superAdminRouter.api(createClientTypeRoute, superAdminMiddleware, createClientType);

const updateClientTypeRoute = createRoute({
  path: "/client-types/:id",
  method: "put",
  tags: ["SuperAdmin", "Client Types"],
  description: "Update a client type",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(ClientTypeSchema, "Client type payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Client type updated")
  }
});

superAdminRouter.api(updateClientTypeRoute, superAdminMiddleware, updateClientType);

const toggleClientTypeStatusRoute = createRoute({
  path: "/client-types/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "Client Types"],
  description: "Toggle client type active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleClientTypeStatusRoute, superAdminMiddleware, toggleClientTypeStatus);

const deleteClientTypeRoute = createRoute({
  path: "/client-types/:id",
  method: "delete",
  tags: ["SuperAdmin", "Client Types"],
  description: "Delete a client type",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Client type deleted")
  }
});

superAdminRouter.api(deleteClientTypeRoute, superAdminMiddleware, deleteClientType);

// ── Locations ─────────────────────────────────────────────────────────────
const createLocationRoute = createRoute({
  path: "/locations",
  method: "post",
  tags: ["SuperAdmin", "Locations"],
  description: "Create a location",
  request: {
    body: jsonContent(LocationSchema, "Location payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Location created")
  }
});

superAdminRouter.api(createLocationRoute, superAdminMiddleware, createLocation);

const updateLocationRoute = createRoute({
  path: "/locations/:id",
  method: "put",
  tags: ["SuperAdmin", "Locations"],
  description: "Update a location",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(LocationSchema, "Location payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Location updated")
  }
});

superAdminRouter.api(updateLocationRoute, superAdminMiddleware, updateLocation);

const toggleLocationStatusRoute = createRoute({
  path: "/locations/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "Locations"],
  description: "Toggle location active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleLocationStatusRoute, superAdminMiddleware, toggleLocationStatus);

const deleteLocationRoute = createRoute({
  path: "/locations/:id",
  method: "delete",
  tags: ["SuperAdmin", "Locations"],
  description: "Delete a location",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Location deleted")
  }
});

superAdminRouter.api(deleteLocationRoute, superAdminMiddleware, deleteLocation);

// ── Commercial Areas ──────────────────────────────────────────────────────
const createCommercialAreaRoute = createRoute({
  path: "/commercial-areas",
  method: "post",
  tags: ["SuperAdmin", "Commercial Areas"],
  description: "Create a commercial area",
  request: {
    body: jsonContent(CommercialAreaSchema, "Commercial area payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Commercial area created")
  }
});

superAdminRouter.api(createCommercialAreaRoute, superAdminMiddleware, createCommercialArea);

const updateCommercialAreaRoute = createRoute({
  path: "/commercial-areas/:id",
  method: "put",
  tags: ["SuperAdmin", "Commercial Areas"],
  description: "Update a commercial area",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(CommercialAreaSchema, "Commercial area payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Commercial area updated")
  }
});

superAdminRouter.api(updateCommercialAreaRoute, superAdminMiddleware, updateCommercialArea);

const toggleCommercialAreaStatusRoute = createRoute({
  path: "/commercial-areas/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "Commercial Areas"],
  description: "Toggle commercial area active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleCommercialAreaStatusRoute, superAdminMiddleware, toggleCommercialAreaStatus);

const deleteCommercialAreaRoute = createRoute({
  path: "/commercial-areas/:id",
  method: "delete",
  tags: ["SuperAdmin", "Commercial Areas"],
  description: "Delete a commercial area",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Commercial area deleted")
  }
});

superAdminRouter.api(deleteCommercialAreaRoute, superAdminMiddleware, deleteCommercialArea);

// ── Client References ─────────────────────────────────────────────────────
const createClientReferenceRoute = createRoute({
  path: "/references",
  method: "post",
  tags: ["SuperAdmin", "Client References"],
  description: "Create a client reference",
  request: {
    body: jsonContent(ClientReferenceSchema, "Client reference payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Client reference created")
  }
});

superAdminRouter.api(createClientReferenceRoute, superAdminMiddleware, createClientReference);

const updateClientReferenceRoute = createRoute({
  path: "/references/:id",
  method: "put",
  tags: ["SuperAdmin", "Client References"],
  description: "Update a client reference",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(ClientReferenceSchema, "Client reference payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Client reference updated")
  }
});

superAdminRouter.api(updateClientReferenceRoute, superAdminMiddleware, updateClientReference);

const toggleClientReferenceStatusRoute = createRoute({
  path: "/references/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "Client References"],
  description: "Toggle client reference active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleClientReferenceStatusRoute, superAdminMiddleware, toggleClientReferenceStatus);

const deleteClientReferenceRoute = createRoute({
  path: "/references/:id",
  method: "delete",
  tags: ["SuperAdmin", "Client References"],
  description: "Delete a client reference",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Client reference deleted")
  }
});

superAdminRouter.api(deleteClientReferenceRoute, superAdminMiddleware, deleteClientReference);

// ── Column Mappings ───────────────────────────────────────────────────────
const saveColumnMappingsRoute = createRoute({
  path: "/column-mappings",
  method: "post",
  tags: ["SuperAdmin", "Column Mappings"],
  description: "Save column mappings",
  request: {
    body: jsonContent(ColumnMappingsSchema, "Column mappings payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Column mappings saved")
  }
});

superAdminRouter.api(saveColumnMappingsRoute, superAdminMiddleware, saveColumnMappings);

// ── Global Items ──────────────────────────────────────────────────────────
const createGlobalItemRoute = createRoute({
  path: "/global-items",
  method: "post",
  tags: ["SuperAdmin", "Global Items"],
  description: "Create a global HS item",
  request: {
    body: jsonContent(GlobalItemSchema, "Global item payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Global item created")
  }
});

superAdminRouter.api(createGlobalItemRoute, superAdminMiddleware, createGlobalItem);

const updateGlobalItemRoute = createRoute({
  path: "/global-items/:id",
  method: "put",
  tags: ["SuperAdmin", "Global Items"],
  description: "Update a global HS item",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(GlobalItemSchema, "Global item payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Global item updated")
  }
});

superAdminRouter.api(updateGlobalItemRoute, superAdminMiddleware, updateGlobalItem);

const toggleGlobalItemStatusRoute = createRoute({
  path: "/global-items/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "Global Items"],
  description: "Toggle global item active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleGlobalItemStatusRoute, superAdminMiddleware, toggleGlobalItemStatus);

const deleteGlobalItemRoute = createRoute({
  path: "/global-items/:id",
  method: "delete",
  tags: ["SuperAdmin", "Global Items"],
  description: "Delete a global HS item",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Global item deleted")
  }
});

superAdminRouter.api(deleteGlobalItemRoute, superAdminMiddleware, deleteGlobalItem);

// ── Measurement Units ─────────────────────────────────────────────────────
const createMeasurementUnitRoute = createRoute({
  path: "/measurement-units",
  method: "post",
  tags: ["SuperAdmin", "Measurement Units"],
  description: "Create a measurement unit",
  request: {
    body: jsonContent(MeasurementUnitSchema, "Measurement unit payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Measurement unit created")
  }
});

superAdminRouter.api(createMeasurementUnitRoute, superAdminMiddleware, createMeasurementUnit);

const updateMeasurementUnitRoute = createRoute({
  path: "/measurement-units/:id",
  method: "put",
  tags: ["SuperAdmin", "Measurement Units"],
  description: "Update a measurement unit",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(MeasurementUnitSchema, "Measurement unit payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Measurement unit updated")
  }
});

superAdminRouter.api(updateMeasurementUnitRoute, superAdminMiddleware, updateMeasurementUnit);

const toggleMeasurementUnitStatusRoute = createRoute({
  path: "/measurement-units/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "Measurement Units"],
  description: "Toggle measurement unit active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleMeasurementUnitStatusRoute, superAdminMiddleware, toggleMeasurementUnitStatus);

const deleteMeasurementUnitRoute = createRoute({
  path: "/measurement-units/:id",
  method: "delete",
  tags: ["SuperAdmin", "Measurement Units"],
  description: "Delete a measurement unit",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Measurement unit deleted")
  }
});

superAdminRouter.api(deleteMeasurementUnitRoute, superAdminMiddleware, deleteMeasurementUnit);

// ── Service Units ─────────────────────────────────────────────────────────
const createServiceUnitRoute = createRoute({
  path: "/service-units",
  method: "post",
  tags: ["SuperAdmin", "Service Units"],
  description: "Create a service unit",
  request: {
    body: jsonContent(ServiceUnitSchema, "Service unit payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Service unit created")
  }
});

superAdminRouter.api(createServiceUnitRoute, superAdminMiddleware, createServiceUnit);

const updateServiceUnitRoute = createRoute({
  path: "/service-units/:id",
  method: "put",
  tags: ["SuperAdmin", "Service Units"],
  description: "Update a service unit",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(ServiceUnitSchema, "Service unit payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Service unit updated")
  }
});

superAdminRouter.api(updateServiceUnitRoute, superAdminMiddleware, updateServiceUnit);

const toggleServiceUnitStatusRoute = createRoute({
  path: "/service-units/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "Service Units"],
  description: "Toggle service unit active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleServiceUnitStatusRoute, superAdminMiddleware, toggleServiceUnitStatus);

const deleteServiceUnitRoute = createRoute({
  path: "/service-units/:id",
  method: "delete",
  tags: ["SuperAdmin", "Service Units"],
  description: "Delete a service unit",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Service unit deleted")
  }
});

superAdminRouter.api(deleteServiceUnitRoute, superAdminMiddleware, deleteServiceUnit);

// ── VAT Notes ─────────────────────────────────────────────────────────────
const createVatNoteRoute = createRoute({
  path: "/vat-notes",
  method: "post",
  tags: ["SuperAdmin", "VAT Notes"],
  description: "Create a VAT note mapping",
  request: {
    body: jsonContent(VatNoteSchema, "VAT note payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "VAT note created")
  }
});

superAdminRouter.api(createVatNoteRoute, superAdminMiddleware, createVatNote);

const updateVatNoteRoute = createRoute({
  path: "/vat-notes/:id",
  method: "put",
  tags: ["SuperAdmin", "VAT Notes"],
  description: "Update a VAT note mapping",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(VatNoteSchema, "VAT note payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "VAT note updated")
  }
});

superAdminRouter.api(updateVatNoteRoute, superAdminMiddleware, updateVatNote);

const toggleVatNoteStatusRoute = createRoute({
  path: "/vat-notes/:id/toggle",
  method: "patch",
  tags: ["SuperAdmin", "VAT Notes"],
  description: "Toggle VAT note active status",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Status toggled")
  }
});

superAdminRouter.api(toggleVatNoteStatusRoute, superAdminMiddleware, toggleVatNoteStatus);

const deleteVatNoteRoute = createRoute({
  path: "/vat-notes/:id",
  method: "delete",
  tags: ["SuperAdmin", "VAT Notes"],
  description: "Delete a VAT note mapping",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "VAT note deleted")
  }
});

superAdminRouter.api(deleteVatNoteRoute, superAdminMiddleware, deleteVatNote);

// ── Unit Conversions ──────────────────────────────────────────────────────
const createUnitConversionRoute = createRoute({
  path: "/unit-conversions",
  method: "post",
  tags: ["SuperAdmin", "Unit Conversions"],
  description: "Create a unit conversion pair",
  request: {
    body: jsonContent(UnitConversionSchema, "Unit conversion payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(OkDataMessage, "Unit conversion created")
  }
});

superAdminRouter.api(createUnitConversionRoute, superAdminMiddleware, createUnitConversion);

const updateUnitConversionRoute = createRoute({
  path: "/unit-conversions/:id",
  method: "put",
  tags: ["SuperAdmin", "Unit Conversions"],
  description: "Update a unit conversion pair",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: jsonContent(UnitConversionSchema, "Unit conversion payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkDataMessage, "Unit conversion updated")
  }
});

superAdminRouter.api(updateUnitConversionRoute, superAdminMiddleware, updateUnitConversion);

const deleteUnitConversionRoute = createRoute({
  path: "/unit-conversions/:id",
  method: "delete",
  tags: ["SuperAdmin", "Unit Conversions"],
  description: "Delete a unit conversion pair",
  request: {
    params: z.object({ id: z.coerce.number() })
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(OkMessage, "Unit conversion deleted")
  }
});

superAdminRouter.api(deleteUnitConversionRoute, superAdminMiddleware, deleteUnitConversion);

export default superAdminRouter;