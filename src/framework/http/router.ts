import { OpenAPIHono } from "@hono/zod-openapi";
import type { RouteConfig } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler, Next } from "hono";
import { defaultHook } from "stoker/openapi";

/** A route handler bound to the generic Hono context (validated input is route-scoped). */
export type ApiHandler = (c: Context, next: Next) => Response | Promise<Response>;
/** A middleware in the `api(route, [middlewares], handler)` chain. */
export type ApiMiddleware = (c: Context, next: () => Promise<void>) => Response | Promise<Response | void> | void;

export type NexgenRouter = OpenAPIHono & {
  group: (...middlewares: MiddlewareHandler[]) => NexgenRouter;
  api: (
    route: RouteConfig,
    handlerOrMiddlewares: ApiHandler | ApiMiddleware[],
    handler?: ApiHandler
  ) => NexgenRouter;
};

/**
 * Why: Creates the framework router with OpenAPI + helper methods.
 * When: Building root app and module route files.
 * Where: HTTP app bootstrap and route stubs.
 * How: Wraps OpenAPIHono and adds group/api convenience APIs.
 */
export function createRouter(): NexgenRouter {
  const router = new OpenAPIHono({ strict: false, defaultHook }) as NexgenRouter;
  const baseOpenapi = router.openapi.bind(router);

  router.group = function (...middlewares) {
    for (const middleware of middlewares) {
      this.use("*", middleware);
    }

    return this;
  };

  router.api = function (route, handlerOrMiddlewares, handler) {
    if (!Array.isArray(handlerOrMiddlewares)) {
      baseOpenapi(route, handlerOrMiddlewares);
      return this;
    }

    const middlewares = handlerOrMiddlewares;
    const finalHandler = handler;

    if (typeof finalHandler !== "function") {
      throw new Error("api(route, middlewares, handler) requires a handler function");
    }

    const wrappedHandler = async (c: Context) => {
      let index = 0;

      const next = async (): Promise<Response | undefined> => {
        if (index < middlewares.length) {
          const middleware = middlewares[index++];
          let downstream: Response | undefined;
          const result = await middleware(c, async () => {
            downstream = await next();
          });

          if (result) return result;
          return downstream;
        }

        return await finalHandler(c, async () => {});
      };

      return await next();
    };

    baseOpenapi(route, wrappedHandler);
    return this;
  };

  return router;
}

/**
 * Why: Shorthand for creating grouped router middleware chain.
 * When: Route files need shared middleware composition.
 * Where: Module route declarations.
 * How: Creates a router instance and applies all provided middlewares.
 */
export function group(...middlewares: MiddlewareHandler[]) {
  return createRouter().group(...middlewares);
}
