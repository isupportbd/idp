import { createRouter } from "@/framework/facade.js";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { processUpload, savePurchases, savePurchasesAsync, replaceDuplicate, savePendingFfs } from "../controllers/upload.controller.js";
import { SavePurchasesSchema, ReplaceDuplicateSchema, SavePendingFfsSchema } from "../controllers/upload.schema.js";

const uploadRouter = createRouter();

uploadRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const canUpload = requirePermission("purchases.create");

uploadRouter.post("/", canUpload, processUpload);
uploadRouter.post("", canUpload, processUpload);
uploadRouter.post("/save", canUpload, zValidator("json", SavePurchasesSchema), savePurchases);
// Async variant: returns 202 + jobId. Falls back to the sync handler when the
// flag is off, below the row threshold, or Redis is unavailable.
uploadRouter.post("/save/async", canUpload, zValidator("json", SavePurchasesSchema), savePurchasesAsync);
uploadRouter.post("/replace", requirePermission("purchases.edit"), zValidator("json", ReplaceDuplicateSchema), replaceDuplicate);
uploadRouter.post("/save-pending-ffs", canUpload, zValidator("json", SavePendingFfsSchema), savePendingFfs);

export default uploadRouter;
