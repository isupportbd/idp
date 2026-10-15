import { env } from "@/env.js";
import { socketServer } from "@/framework/realtime/index.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

export type BroadcastOptions = {
  users?: Array<string | number>;
  roles?: string[];
  rooms?: string[];
  auth?: boolean;
  all?: boolean;
  /** Restricts the event to a single tenant room (`tenant:<id>`). */
  tenant?: string | number | null;
};

/**
 * Why: Emits realtime events to targeted audiences.
 * When: Domain events need websocket fan-out.
 * Where: Event dispatcher and module jobs.
 * How: Emits via Socket.IO if available; otherwise relays through Redis pub/sub
 *      so the main process (which has Socket.IO) can broadcast it.
 */
function emitViaIo(event: string, payload: any, options: BroadcastOptions) {
  const io = socketServer();
  if (!io) return;

  // Resolve every target room first so a single chained emit is used.
  // Socket.IO unions chained rooms and de-duplicates by socket, so a socket that
  // belongs to several target rooms still receives exactly one copy of the event.
  const rooms = new Set<string>();

  // `all` historically short-circuited to `io.emit`, leaking every domain event to
  // guests and (for tenant payloads) to every other tenant. It now means
  // "all authenticated users" — guests can never receive domain events.
  if (options.all || options.auth) rooms.add("auth");

  if (options.tenant != null && String(options.tenant) !== "") {
    rooms.add(`tenant:${options.tenant}`);
  }

  for (const user of options.users || []) rooms.add(`user:${user}`);
  for (const role of options.roles || []) rooms.add(`role:${role}`);
  for (const room of options.rooms || []) if (room) rooms.add(String(room));

  if (rooms.size === 0) return;

  let emitter: any = io;
  for (const room of rooms) emitter = emitter.to(room);
  emitter.emit(event, payload);
}

export function broadcast(event: string, payload: any, options: BroadcastOptions = {}) {
  const io = socketServer();

  if (io) {
    emitViaIo(event, payload, options);
    return;
  }

  // No Socket.IO in this process — relay through Redis so the main process can broadcast
  const redis = redisClientIfReady();
  if (!redis) return;

  const channel = `${env.REDIS_PREFIX}:broadcast`;
  redis.publish(channel, JSON.stringify({ event, payload, options }));
}
