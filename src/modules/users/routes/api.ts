import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireTenantAdmin } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  updateUserStatus,
  deleteUser,
  getPermissionCatalog
} from "../controllers/users.controller.js";
import {
  CreateUserSchema,
  UpdateUserSchema,
  ResetPasswordSchema,
  UpdateStatusSchema,
  IdParamSchema,
  ListUsersResponseSchema,
  UserMutationResponseSchema,
  UpdateStatusResponseSchema,
  PermissionCatalogResponseSchema
} from "../controllers/users.schema.js";

const listUsersRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Users"],
  description: "List organization sub-users",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(ListUsersResponseSchema, "Users list")
  }
});

const createUserRoute = createRoute({
  path: "/",
  method: "post",
  tags: ["Users"],
  description: "Create a new sub-user",
  request: {
    body: jsonContent(CreateUserSchema, "User payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(UserMutationResponseSchema, "User created"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(z.object({ message: z.string() }), "Bad request"),
    [HttpStatusCodes.CONFLICT]: jsonContent(z.object({ message: z.string() }), "Email exists")
  }
});

const updateUserRoute = createRoute({
  path: "/{id}",
  method: "put",
  tags: ["Users"],
  description: "Update sub-user details",
  request: {
    params: IdParamSchema,
    body: jsonContent(UpdateUserSchema, "Update payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(UserMutationResponseSchema, "User updated")
  }
});

const resetPasswordRoute = createRoute({
  path: "/{id}/password",
  method: "put",
  tags: ["Users"],
  description: "Reset sub-user password",
  request: {
    params: IdParamSchema,
    body: jsonContent(ResetPasswordSchema, "New password")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Password reset response")
  }
});

const updateStatusRoute = createRoute({
  path: "/{id}/status",
  method: "patch",
  tags: ["Users"],
  description: "Update user active/inactive status",
  request: {
    params: IdParamSchema,
    body: jsonContent(UpdateStatusSchema, "Status update payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(UpdateStatusResponseSchema, "Status updated response")
  }
});

const deleteUserRoute = createRoute({
  path: "/{id}",
  method: "delete",
  tags: ["Users"],
  description: "Delete sub-user",
  request: {
    params: IdParamSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "User deleted response")
  }
});

const permissionCatalogRoute = createRoute({
  path: "/permissions",
  method: "get",
  tags: ["Users"],
  description: "List assignable sub-user permissions grouped by module",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(PermissionCatalogResponseSchema, "Permission catalog")
  }
});

// Team management is limited to the firm admin so sub-users cannot grant themselves permissions.
export default createRouter()
  .group(authMiddleware, subscriptionMiddleware, requireTenantAdmin)
  .api(permissionCatalogRoute, [], getPermissionCatalog)
  .api(listUsersRoute, [], listUsers)
  .api(createUserRoute, [], createUser)
  .api(updateUserRoute, [], updateUser)
  .api(resetPasswordRoute, [], resetUserPassword)
  .api(updateStatusRoute, [], updateUserStatus)
  .api(deleteUserRoute, [], deleteUser);
