import type { App } from "vue";

declare const __SOCKET_ENABLED__: boolean;

type EventCallback<T = unknown> = (payload: T) => void;

type ChannelBinding = {
  event: string;
  callback: EventCallback;
  wrapped: EventCallback;
};

type PulseChannel = {
  listen: <T = unknown>(event: string, callback: EventCallback<T>) => PulseChannel;
  stopListening: (event: string, callback?: EventCallback) => PulseChannel;
};

export type PulseClient = {
  connect: () => PulseClient;
  disconnect: () => PulseClient;
  channel: (name: string) => PulseChannel;
  private: (room: string) => PulseChannel;
  leave: (room: string) => PulseClient;
};

type ClientSocket = import("socket.io-client").Socket;

function createPulse(): PulseClient {
  if (!__SOCKET_ENABLED__) {
    const n = (): PulseChannel => ({ listen: () => n(), stopListening: () => n() });
    const c: PulseClient = {
      connect: () => c,
      disconnect: () => c,
      channel: n,
      private: n,
      leave: () => c
    };
    return c;
  }

  let socket: ClientSocket | null = null;
  let socketLoading: Promise<ClientSocket> | null = null;
  const channels = new Map<string, ChannelBinding[]>();
  const joinedRooms = new Set<string>();

  const socketUrl = () => {
    const explicit = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL;
    if (explicit) return explicit;
    return window.location.origin;
  };

  /**
   * Why: socket.io-client is only needed once the UI is interactive, so it is
   *      loaded as a separate chunk instead of being bundled into the entry
   *      (previously the whole client shipped in the critical entry JS).
   * How: The first call kicks off a dynamic import; the returned promise is
   *      cached so every caller shares one socket. Listeners registered before
   *      the socket exists are re-attached as soon as it is created.
   */
  const ensureConnected = (): Promise<ClientSocket> => {
    if (socket) return Promise.resolve(socket);
    if (socketLoading) return socketLoading;

    socketLoading = import("socket.io-client")
      .then(({ io }) => {
        const token = localStorage.getItem("idp_access_token") || localStorage.getItem("auth_token") || "";

        const s = io(socketUrl(), {
          withCredentials: true,
          auth: token ? { token } : undefined,
          extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
          transports: ["websocket", "polling"]
        });

        s.on("connect", () => {
          for (const room of joinedRooms) {
            s.emit("join", room);
          }
        });

        // Re-attach everything that was bound before the socket existed.
        for (const bindings of channels.values()) {
          for (const binding of bindings) {
            s.on(binding.event, binding.wrapped);
          }
        }

        socket = s;
        return s;
      })
      .catch((error) => {
        socketLoading = null;
        throw error;
      });

    return socketLoading;
  };

  const channel = (name: string): PulseChannel => {
    const room = String(name).trim();
    if (!room) throw new Error("Channel name is required");

    joinedRooms.add(room);
    void ensureConnected()
      .then((s) => s.emit("join", room))
      .catch(() => {});

    const api: PulseChannel = {
      listen: <T = unknown>(event: string, callback: EventCallback<T>) => {
        const wrapped = (payload: unknown) => callback(payload as T);
        const bindings = channels.get(room) || [];
        bindings.push({ event, callback: callback as EventCallback, wrapped });
        channels.set(room, bindings);
        // If the socket is already live, bind immediately; otherwise it will be
        // attached by ensureConnected() when the chunk finishes loading.
        if (socket) socket.on(event, wrapped);
        return api;
      },
      stopListening: (event: string, callback?: EventCallback) => {
        const bindings = channels.get(room) || [];
        const kept: ChannelBinding[] = [];

        for (const binding of bindings) {
          const matchesEvent = binding.event === event;
          const matchesCallback = !callback || binding.callback === callback;
          if (matchesEvent && matchesCallback) {
            socket?.off(binding.event, binding.wrapped);
          } else {
            kept.push(binding);
          }
        }

        if (kept.length > 0) channels.set(room, kept);
        else channels.delete(room);
        return api;
      }
    };

    return api;
  };

  const pulse: PulseClient = {
    connect: () => {
      void ensureConnected().catch(() => {});
      return pulse;
    },
    disconnect: () => {
      socket?.disconnect();
      socket = null;
      socketLoading = null;
      return pulse;
    },
    channel,
    private: (room: string) => channel(`private:${room}`),
    leave: (room: string) => {
      const bindings = channels.get(room) || [];
      for (const binding of bindings) {
        socket?.off(binding.event, binding.wrapped);
      }

      channels.delete(room);
      joinedRooms.delete(room);
      return pulse;
    }
  };

  return pulse;
}

export const pulse = createPulse();

export const PulsePlugin = {
  install(app: App) {
    app.config.globalProperties.$pulse = pulse;
  }
};

declare module "vue" {
  interface ComponentCustomProperties {
    $pulse: PulseClient;
  }
}
