import { Hono } from 'hono';
import { EventEmitter } from 'events';

class AppEventEmitter extends EventEmitter {}
const appEvents = new AppEventEmitter();

const streamApp = new Hono();
streamApp.get('/', (c) => {
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let onDataChanged: ((data: string) => void) | null = null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch (e) {
          console.error("SSE enqueue error", e);
        }
      };

      pingTimer = setInterval(() => {
        sendEvent('ping', 'ping');
      }, 15000);

      onDataChanged = (eventData: string) => {
        sendEvent('data_changed', eventData);
      };

      appEvents.on('data_changed', onDataChanged);
    },
    cancel() {
      if (pingTimer) clearInterval(pingTimer);
      if (onDataChanged) appEvents.off('data_changed', onDataChanged);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    }
  });
});

export default {
  port: 3333,
  fetch: streamApp.fetch,
};
