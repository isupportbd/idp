import { Hono } from 'hono';
import { db } from '../db';
import { unitConversions, vatNotesMapping, columnMappings } from '../db/schema';
import { authenticate } from '../middlewares/auth';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const settingsApp = new Hono<{ Variables: Variables }>();

settingsApp.use('*', authenticate);

// GET /unit-conversions - accessible to all authenticated users
settingsApp.get('/unit-conversions', async (c) => {
  try {
    const data = await db.select().from(unitConversions);
    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching unit conversions:', error);
    return c.json({ success: false, error: 'Failed to fetch unit conversions' }, 500);
  }
});

// GET /vat-notes
settingsApp.get('/vat-notes', async (c) => {
  try {
    const data = await db.select().from(vatNotesMapping);
    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching vat notes:', error);
    return c.json({ success: false, error: 'Failed to fetch vat notes' }, 500);
  }
});

// GET /column-mappings
settingsApp.get('/column-mappings', async (c) => {
  try {
    const data = await db.select().from(columnMappings);
    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching column mappings:', error);
    return c.json({ success: false, error: 'Failed to fetch column mappings' }, 500);
  }
});

export default settingsApp;
