import { Hono } from 'hono';
import { appEvents } from '../events';

const streamApp = new Hono();

streamApp.options('/', (c) => {
  return new Response(null, { 
    status: 204, 
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    }
  });
});

streamApp.get('/', (c) => {
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let onDataChanged: ((data: string) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Helper to enqueue SSE formatted data
      const sendEvent = (event: string, data: string) => {
        try {
          controller.enqueue(`event: ${event}\ndata: ${data}\n\n`);
        } catch (e) {
          // Controller might be closed
        }
      };

      // Keep alive ping
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

export default streamApp;
