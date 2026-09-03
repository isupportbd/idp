import { Hono } from 'hono';
import { streamSSE } from 'hono/stream';
import { appEvents } from '../events';

const streamApp = new Hono();

streamApp.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    // Ping to keep connection alive
    const interval = setInterval(async () => {
      try {
        await stream.writeSSE({ data: 'ping', event: 'ping' });
      } catch (e) {
        clearInterval(interval);
      }
    }, 15000);

    const onDataChanged = async (eventData: string) => {
      try {
        await stream.writeSSE({ data: eventData, event: 'data_changed' });
      } catch (e) {
        // Handle disconnected client
      }
    };

    appEvents.on('data_changed', onDataChanged);

    stream.onAbort(() => {
      clearInterval(interval);
      appEvents.off('data_changed', onDataChanged);
    });

    // Keep the stream open indefinitely
    while (true) {
      await stream.sleep(10000);
    }
  });
});

export default streamApp;
