import { onMounted, onUnmounted } from "vue";
import { pulse } from "@/plugins/pulse";

/**
 * Why: Removes repeated mount/unmount + channel register/unregister boilerplate.
 * When: A component needs a live realtime event.
 * Where: Vue setup() of any realtime-aware component.
 * How: Subscribes on mount and unsubscribes on unmount. The socket already
 *      auto-joins its entitled rooms (auth / role:* / tenant:<id>), so a single
 *      registration per event is enough — never register the same event twice
 *      or the handler fires twice. Must be called during setup().
 */
export function usePulseListener<T = unknown>(
  event: string,
  callback: (payload: T) => void,
  channel = "auth"
) {
  const ch = pulse.channel(channel);
  const handler = (payload: unknown) => callback(payload as T);

  onMounted(() => {
    ch.listen(event, handler as any);
  });

  onUnmounted(() => {
    ch.stopListening(event, handler as any);
  });

  return {
    stop: () => ch.stopListening(event, handler as any)
  };
}
