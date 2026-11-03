import { createRouter } from "@/framework/facade.js";
import { zValidator } from "@hono/zod-validator";
import type { Handler } from "hono";
import type { AppContext } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { processUpload, savePurchases, savePurchasesAsync, replaceDuplicate, savePendingFfs } from "../controllers/upload.controller.js";
import { SavePurchasesSchema, ReplaceDuplicateSchema, SavePendingFfsSchema } from "../controllers/upload.schema.js";

const uploadRouter = createRouter();

uploadRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const canUpload = requirePermission("purchases.create");

/**
 * This module registers its routes directly instead of via `router.api(...)`.
 * Handlers are typed `AppContext` (framework convention); the generic Hono
 * `post()` surface cannot express that widening, so adapt at the boundary.
 */
const asHonoHandler = (handler: (c: AppContext) => Promise<Response>): Handler =>
  handler as unknown as Handler;

uploadRouter.post("/", canUpload, asHonoHandler(processUpload));
uploadRouter.post("", canUpload, asHonoHandler(processUpload));
uploadRouter.post("/save", canUpload, zValidator("json", SavePurchasesSchema), asHonoHandler(savePurchases));
// Async variant: returns 202 + jobId. Falls back to the sync handler when the
// flag is off, below the row threshold, or Redis is unavailable.
uploadRouter.post("/save/async", canUpload, zValidator("json", SavePurchasesSchema), asHonoHandler(savePurchasesAsync));
uploadRouter.post("/replace", requirePermission("purchases.edit"), zValidator("json", ReplaceDuplicateSchema), asHonoHandler(replaceDuplicate));
uploadRouter.post("/save-pending-ffs", canUpload, zValidator("json", SavePendingFfsSchema), asHonoHandler(savePendingFfs));

export default uploadRouter;
