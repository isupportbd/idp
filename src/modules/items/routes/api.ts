import { Hono } from "hono";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { getItems, bulkCreateItems } from "../controllers/items.controller.js";

const itemsRouter = new Hono();

itemsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

itemsRouter.get("/", getItems);
itemsRouter.post("/bulk", bulkCreateItems);

export default itemsRouter;
