import { Hono } from "hono";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { processUpload, savePurchases, replaceDuplicate, savePendingFfs } from "../controllers/upload.controller.js";

const uploadRouter = new Hono({ strict: false });

uploadRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const canUpload = requirePermission("purchases.create");

uploadRouter.post("/", canUpload, processUpload);
uploadRouter.post("", canUpload, processUpload);
uploadRouter.post("/save", canUpload, savePurchases);
uploadRouter.post("/replace", requirePermission("purchases.edit"), replaceDuplicate);
uploadRouter.post("/save-pending-ffs", canUpload, savePendingFfs);

export default uploadRouter;
