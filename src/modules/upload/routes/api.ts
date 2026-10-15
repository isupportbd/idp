import { Hono } from "hono";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { processUpload, savePurchases, savePurchasesAsync, replaceDuplicate, savePendingFfs } from "../controllers/upload.controller.js";

const uploadRouter = new Hono({ strict: false });

uploadRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const canUpload = requirePermission("purchases.create");

uploadRouter.post("/", canUpload, processUpload);
uploadRouter.post("", canUpload, processUpload);
uploadRouter.post("/save", canUpload, savePurchases);
// Async variant: returns 202 + jobId. Falls back to the sync handler when the
// flag is off, below the row threshold, or Redis is unavailable.
uploadRouter.post("/save/async", canUpload, savePurchasesAsync);
uploadRouter.post("/replace", requirePermission("purchases.edit"), replaceDuplicate);
uploadRouter.post("/save-pending-ffs", canUpload, savePendingFfs);

export default uploadRouter;
