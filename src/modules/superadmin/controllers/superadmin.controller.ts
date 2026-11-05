/**
 * Superadmin Controller Facade / Barrel File
 * 
 * Decomposed into domain-focused sub-controllers:
 * - platform.controller.ts (settings notification, payment settings, storage, public stats, metrics, notifications, backups)
 * - tenants.controller.ts (tenants management, signups, approvals, extensions, transactions)
 * - plans.controller.ts (plans CRUD)
 * - recharge.controller.ts (pending recharges, recharge approval/rejection)
 * - master-data.controller.ts (client types, locations, areas, references, mappings, global items, units, vat notes, unit conversions, service units)
 */

export * from "./platform.controller.js";
export * from "./tenants.controller.js";
export * from "./plans.controller.js";
export * from "./recharge.controller.js";
export * from "./master-data.controller.js";
