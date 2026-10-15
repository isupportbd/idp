import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler, Next } from "hono";
import { getConnInfo } from "hono/bun";
import { MemoryStore, RedisStore, rateLimiter } from "hono-rate-limiter";
import { appConfig, rateLimitConfig } from "@/config/index.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

/**
 * Why: Protects API from burst abuse and accidental flooding.
 * When: Applied globally in HTTP middleware chain.
 * Where: App bootstrap middleware stack.
 * How: Limits requests per-user (authenticated) or per-session (guest)
 *      using Redis store when available, falling back to in-memory.
 *      Sends standard RateLimit-* headers so clients can back off.
 */

function adaptRedis(raw: any) {
  return {
    scriptLoad: (script: string) => raw.script("load", script),
    evalsha: (sha1: string, keys: string[], args: unknown[]) => raw.evalsha(sha1, keys.length, ...keys, ...args),
    decr: (key: string) => raw.decr(key),
    del: (key: string) => raw.del(key)
  };
}

const REDIS_RETRY_MS = 30_000;

/**
 * Why: Uses Redis for distributed rate limiting when available, but never lets
 *      a Redis outage break requests.
 * When: The global and login limiters run on every request; Redis can go away
 *      after the middleware was already built (so the store choice cannot be
 *      frozen at first request).
 * Where: src/framework/http/ratelimiter.ts.
 * How: Backs every call with an always-usable MemoryStore. A RedisStore is
 *      created lazily (after a ping health check) and used only while it
 *      responds; any Redis command failure drops the store and starts a
 *      cooldown, during which traffic is served from memory. After the
 *      cooldown the store is re-attempted, so a recovered Redis is picked up.
 */
function createFailingOverStore() {
  const memoryStore = new MemoryStore();
  let redisStore: RedisStore | null = null;
  let cooldownUntil = 0;
  let options: any = null;

  function enterCooldown() {
    redisStore = null;
    cooldownUntil = Date.now() + REDIS_RETRY_MS;
  }

  async function redisStoreIfUsable() {
    if (cooldownUntil > Date.now()) return null;

    if (!redisStore) {
      const raw = redisClientIfReady();
      if (!raw) return null;

      try {
        await raw.ping();
      } catch {
        enterCooldown();
        return null;
      }

      try {
        redisStore = new RedisStore({ client: adaptRedis(raw), prefix: rateLimitConfig.keyPrefix });
        redisStore.init(options);
      } catch {
        enterCooldown();
        return null;
      }
    }

    return redisStore;
  }

  return {
    init(opts: any) {
      options = opts;
      memoryStore.init(opts);
    },

    async increment(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          return await redis.increment(key);
        } catch {
          enterCooldown();
        }
      }
      return memoryStore.increment(key);
    },

    async decrement(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          await redis.decrement(key);
          return;
        } catch {
          enterCooldown();
        }
      }
      memoryStore.decrement(key);
    },

    async resetKey(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          await redis.resetKey(key);
          return;
        } catch {
          enterCooldown();
        }
      }
      memoryStore.resetKey(key);
    },

    async get(key: string) {
      const redis = await redisStoreIfUsable();
      if (redis) {
        try {
          const info = await redis.get(key);
          if (info) return info;
        } catch {
          enterCooldown();
        }
      }
      return memoryStore.get(key);
    }
  };
}

/**
 * Why: Rate-limit keys must be derived from a value the client cannot control
 *      and must never collapse every unknown client into one shared bucket.
 * When: The global and login limiters build their key.
 * How: The peer address of the TCP connection is authoritative. X-Forwarded-For
 *      is only consulted when the app is (known or auto-detected to be) behind a
 *      reverse proxy, and then only the RIGHT-MOST entry is used — that is the
 *      entry appended by the nearest proxy and cannot be forged by the client.
 *      When no address can be resolved, a fingerprint of the request headers is
 *      used instead of a constant, so unrelated clients never share a bucket.
 */
function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^::ffff:/, "").toLowerCase();
  if (ip === "::1" || ip === "localhost") return true;
  if (/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)) return true; // fc00::/7, fe80::/10
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function lastForwardedEntry(header: string | undefined): string | null {
  if (!header) return null;
  const entries = header.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? entries[entries.length - 1] : null;
}

function directPeerAddress(c: any): string | null {
  try {
    const info = getConnInfo(c);
    const address = info?.remote?.address;
    if (typeof address === "string" && address.length > 0) return address;
  } catch {
    // Not running on the Bun engine (or env lacks the fetch address) — ignore.
  }
  return null;
}

function clientAddress(c: any): string | null {
  const peer = directPeerAddress(c);
  const forwarded = lastForwardedEntry(c.req.header("x-forwarded-for"));
  const trustProxy = appConfig.trustProxy;

  if (trustProxy === true) return forwarded ?? peer;
  if (trustProxy === false) return peer;

  // Auto: only honour the proxy header when the direct peer is a
  // private/loopback address (i.e. a reverse proxy on our own network).
  if (peer) {
    if (forwarded && isPrivateAddress(peer)) return forwarded;
    return peer;
  }

  // No peer info at all (e.g. a non-Bun engine) — assume a proxy is present so
  // production deployments keep per-client buckets rather than one shared key.
  return forwarded;
}

function rateLimitKey(c: any, prefix: string, useSession = true): string {
  const sessionId = c.get("sessionId");
  if (useSession && sessionId) return `${prefix}:session:${sessionId}`;

  const address = clientAddress(c);
  if (address) return `${prefix}:ip:${address}`;

  // Last resort: never fall back to a shared constant — otherwise a single
  // header-less request pattern exhausts the bucket for every other client.
  const fingerprint = createHash("sha1")
    .update([c.req.header("user-agent") || "", c.req.header("accept-language") || "", c.req.header("accept") || ""].join("|"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}:fp:${fingerprint}`;
}

let middleware: MiddlewareHandler | null = null;

export const rateLimiterMiddleware = async (c: Context, next: Next) => {
  if (!middleware) {
    middleware = rateLimiter({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.maxRequests,
      keyGenerator: (c: any) => rateLimitKey(c, "rl"),
      store: createFailingOverStore(),
      standardHeaders: "draft-6"
    });
  }

  return middleware(c, next);
};

let loginLimiterMiddleware: MiddlewareHandler | null = null;

export const loginLimiter = async (c: Context, next: Next) => {
  if (!loginLimiterMiddleware) {
    loginLimiterMiddleware = rateLimiter({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.loginMaxRequests,
      keyGenerator: (c: any) => rateLimitKey(c, "login", false),
      store: createFailingOverStore(),
      standardHeaders: "draft-6"
    });
  }

  return loginLimiterMiddleware(c, next);
};
