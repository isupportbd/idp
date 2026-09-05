import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { appEvents } from '../events';
import jwt from 'jsonwebtoken';

const streamApp = new Hono();

streamApp.get('/', async (c) => {
  // EventSource cannot send Authorization headers, so we accept token via query param
  const token = c.req.query('token') || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  c.header('X-Accel-Buffering', 'no');
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'no-cache, no-transform');

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
