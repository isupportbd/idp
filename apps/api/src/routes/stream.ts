import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { appEvents } from '../events';

const streamApp = new Hono();

// Handle preflight requests for this route explicitly
streamApp.options('/', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }});
});

streamApp.get('/', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('X-Accel-Buffering', 'no');
  c.header('Cache-Control', 'no-cache, no-transform');

  return streamSSE(c, (stream) => {
    return new Promise<void>((resolve) => {
      let pingTimer: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (pingTimer) clearInterval(pingTimer);
        appEvents.off('data_changed', onDataChanged);
        resolve();
      };

      // Ping every 15 seconds to keep connection alive
      pingTimer = setInterval(() => {
        stream.writeSSE({ data: 'ping', event: 'ping' }).catch(cleanup);
      }, 15000);

      const onDataChanged = (eventData: string) => {
        stream.writeSSE({ data: eventData, event: 'data_changed' }).catch(cleanup);
      };

      appEvents.on('data_changed', onDataChanged);

      stream.onAbort(cleanup);
    });
  });
});

export default streamApp;
