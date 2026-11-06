/**
 * Why: Central public API surface for framework consumers.
 * When: Modules/middlewares need framework utilities.
 * Where: App-layer imports should target this file.
 * How: Re-exports stable, reusable helpers while hiding setup internals.
 */

export { createRoute, z } from "@hono/zod-openapi";
export * as lodash from "lodash-es";
export * as HttpStatusCodes from "stoker/http-status-codes";
export { jsonContent } from "stoker/openapi/helpers";
export { cache } from "@/framework/cache/cache.js";
export { database, db } from "@/framework/database/connection.js";
export { type PaginatedResult, paginate, paginateModel, paginateQuery, paginateTable } from "@/framework/database/paginate.js";
export { command, dispatchCommand, dispatchEvent } from "@/framework/events/dispatcher.js";
export type { AppContext } from "@/framework/http/context.js";
export { type ControllerErrorOptions, handleControllerError } from "@/framework/http/errors.js";
export { loginLimiter } from "@/framework/http/ratelimiter.js";
export { createRouter, group } from "@/framework/http/router.js";
export { validate } from "@/framework/http/validation.js";
export { notify } from "@/framework/notification/index.js";
export { handleAsyncEndpoint, isAsyncFlagEnabled } from "@/framework/queue/async-endpoint.js";
export { emitProgress } from "@/framework/queue/progress.js";
export { queue, queueJob, shouldQueue } from "@/framework/queue/queue.js";
export {
  billingScope,
  collectionReceivedPayload,
  invoiceCreatedPayload
} from "@/framework/realtime/event-builders.js";
export { broadcast } from "@/framework/realtime/index.js";
export { redisClientIfReady } from "@/framework/redis/client.js";
export { defineSchedule } from "@/framework/scheduler/scheduler.js";
export { session } from "@/framework/session/session.js";
export { dispatchProviderSms, fetchProviderBalance } from "@/framework/sms/index.js";
export { storage } from "@/framework/storage/storage.js";
export { cookie } from "@/framework/support/cookie.js";
export { jwt } from "@/framework/support/jwt.js";
export { logger } from "@/framework/support/logger.js";
export { mail } from "@/framework/support/mail.js";
export { password } from "@/framework/support/password.js";
export { urls } from "@/framework/support/url.js";
export { type RetryOptions, retry } from "@/framework/utils/retry.js";
export {
  assertClientAccess,
  formatStandardHsCode,
  getDefaultTaxPeriod,
  getSubmissionDeadline,
  requireTenantContext,
  resolveTenantContext,
  round2,
  type TenantContext,
  UnauthenticatedTenantError
} from "@/framework/utils/tenant-context.js";
