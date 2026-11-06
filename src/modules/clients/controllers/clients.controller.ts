/**
 * Clients Controller Facade / Barrel File
 *
 * Modular domain-driven controllers:
 * - clients-query.controller.ts (listClients, getClientById)
 * - clients-mutate.controller.ts (createClient, updateClient, toggleClientStatus, deleteClient)
 * - clients-validation.controller.ts (checkBinUnique, checkMobileExists)
 * - clients-assignment.controller.ts (listAssignments, assignManagers)
 * - clients-users.controller.ts (listAssignableUsers)
 * - clients-bulk.controller.ts (bulkCreateClients)
 * - clients-purchased-items.controller.ts (getClientPurchasedItems)
 */

export * from "./clients-assignment.controller.js";
export * from "./clients-bulk.controller.js";
export * from "./clients-mutate.controller.js";
export * from "./clients-purchased-items.controller.js";
export * from "./clients-query.controller.js";
export * from "./clients-users.controller.js";
export * from "./clients-validation.controller.js";
