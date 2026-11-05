/**
 * Superadmin Controller Facade / Barrel File
 * 
 * Modular domain-driven controllers:
 * - platform.controller.ts (settings update notifications, payment settings, storage, public stats, metrics, notifications)
 * - backup.controller.ts (database backup SQL export and restore)
 * - tenants.controller.ts (tenant accounts, approvals, rejections, extensions, transactions)
 * - plans.controller.ts (subscription plans CRUD)
 * - recharge.controller.ts (wallet recharge requests, approvals, rejections)
 * - locations.controller.ts (geographic locations and commercial areas CRUD)
 * - client-metadata.controller.ts (customer types, references, column mappings)
 * - items-units.controller.ts (global catalog items, measurement units, service units)
 * - vat-notes.controller.ts (VAT notes configuration and mapping)
 * - conversions.controller.ts (unit conversion rates and pairs)
 */

export * from "./platform.controller.js";
export * from "./backup.controller.js";
export * from "./tenants.controller.js";
export * from "./plans.controller.js";
export * from "./recharge.controller.js";
export * from "./locations.controller.js";
export * from "./client-metadata.controller.js";
export * from "./items-units.controller.js";
export * from "./vat-notes.controller.js";
export * from "./conversions.controller.js";
