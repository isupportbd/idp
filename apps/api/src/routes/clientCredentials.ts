import { Hono } from 'hono';
import { db } from '../db';
import { clientCredentials, clients } from '../db/schema';
import { eq, and, inArray, ilike, or, sql } from 'drizzle-orm';
import * as xlsx from 'xlsx';
import { authenticate } from '../middlewares/auth';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const clientCredentialsApp = new Hono<{ Variables: Variables }>();

clientCredentialsApp.use('*', authenticate);

// GET / - Get all credentials for this admin
clientCredentialsApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const search = c.req.query('search') || '';
    const offset = (page - 1) * limit;

    const conditions = [eq(clientCredentials.adminId, user.adminId)];
    
    if (search) {
      conditions.push(
        or(
          ilike(clients.name, `%${search}%`),
          ilike(clients.bin, `%${search}%`),
          ilike(clientCredentials.loginId, `%${search}%`)
        )
      );
    }

    const whereClause = and(...conditions);

    const baseQuery = db
      .select({
        id: clientCredentials.id,
        clientId: clientCredentials.clientId,
        clientName: clients.name,
        clientBin: clients.bin,
        loginId: clientCredentials.loginId,
        loginPassword: clientCredentials.loginPassword,
        createdAt: clientCredentials.createdAt,
      })
      .from(clientCredentials)
      .leftJoin(clients, eq(clientCredentials.clientId, clients.id))
      .where(whereClause);

    const dataQuery = baseQuery
      .limit(limit)
      .offset(offset);

    const countQuery = db.select({ count: sql<number>`count(*)` })
      .from(clientCredentials)
      .leftJoin(clients, eq(clientCredentials.clientId, clients.id))
      .where(whereClause);

    const [data, [{ count }]] = await Promise.all([
      dataQuery,
      countQuery
    ]);

    return c.json({ success: true, data, total: Number(count) });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    return c.json({ success: false, error: 'Failed to fetch credentials' }, 500);
  }
});

const credSchema = z.object({
  clientId: z.number(),
  loginId: z.string().min(1),
  loginPassword: z.string().min(1),
});

// POST / - Create credential
clientCredentialsApp.post('/', zValidator('json', credSchema), async (c) => {
  try {
    const user = c.get('user');
    const { clientId, loginId, loginPassword } = c.req.valid('json');
    await db.insert(clientCredentials).values({
      adminId: user.adminId,
      clientId,
      loginId,
      loginPassword,
    });
    return c.json({ success: true });
  } catch (error) {
    console.error('Error creating credential:', error);
    return c.json({ success: false, error: 'Failed to create credential' }, 500);
  }
});

// PUT /:id
clientCredentialsApp.put('/:id', zValidator('json', credSchema), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const user = c.get('user');
    const { clientId, loginId, loginPassword } = c.req.valid('json');
    await db.update(clientCredentials)
      .set({ clientId, loginId, loginPassword })
      .where(and(eq(clientCredentials.id, id), eq(clientCredentials.adminId, user.adminId)));
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating credential:', error);
    return c.json({ success: false, error: 'Failed to update credential' }, 500);
  }
});

// DELETE /:id
clientCredentialsApp.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const user = c.get('user');
    await db.delete(clientCredentials)
      .where(and(eq(clientCredentials.id, id), eq(clientCredentials.adminId, user.adminId)));
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting credential:', error);
    return c.json({ success: false, error: 'Failed to delete credential' }, 500);
  }
});
// POST /batch-delete
const batchDeleteSchema = z.object({
  ids: z.array(z.number()),
});

clientCredentialsApp.post('/batch-delete', zValidator('json', batchDeleteSchema), async (c) => {
  try {
    const user = c.get('user');
    const { ids } = c.req.valid('json');

    if (ids.length === 0) return c.json({ success: true });

    await db.delete(clientCredentials)
      .where(and(
        inArray(clientCredentials.id, ids),
        eq(clientCredentials.adminId, user.adminId)
      ));

    return c.json({ success: true });
  } catch (error) {
    console.error('Error batch deleting credentials:', error);
    return c.json({ success: false, error: 'Failed to batch delete credentials' }, 500);
  }
});

// POST /upload
clientCredentialsApp.post('/upload', async (c) => {
  try {
    const user = c.get('user');
    const formData = await c.req.parseBody();
    const file = formData.file as File;

    if (!file) {
      return c.json({ success: false, error: 'No file uploaded' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const data: any[] = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

    if (data.length === 0) {
      return c.json({ success: false, error: 'File is empty' }, 400);
    }

    // Ensure headers exist by checking for combinations
    const sample = data[0];
    const hasBin = Object.keys(sample).some(k => k.replace(/\s+/g, '').toLowerCase() === 'bin');
    const hasUsername = Object.keys(sample).some(k => k.replace(/\s+/g, '').toLowerCase() === 'username');
    const hasPassword = Object.keys(sample).some(k => k.replace(/\s+/g, '').toLowerCase() === 'password');

    if (!hasBin || !hasUsername || !hasPassword) {
      return c.json({ success: false, error: 'Missing required columns: BIN, Username, Password' }, 400);
    }

    // 1. Extract valid rows and unique BINs
    const uploadedBins = new Set<string>();
    const validRows: any[] = [];
    
    for (const row of data) {
      // Find exact keys in the row that match our target columns (ignoring case/spaces)
      const keys = Object.keys(row);
      const binKey = keys.find(k => k.replace(/\s+/g, '').toLowerCase() === 'bin');
      const userKey = keys.find(k => k.replace(/\s+/g, '').toLowerCase() === 'username');
      const passKey = keys.find(k => k.replace(/\s+/g, '').toLowerCase() === 'password');

      const bin = binKey ? String(row[binKey] || '').trim() : '';
      const loginId = userKey ? String(row[userKey] || '').trim() : '';
      const loginPassword = passKey ? String(row[passKey] || '').trim() : '';
      if (!bin || !loginId || !loginPassword) continue;
      
      uploadedBins.add(bin);
      validRows.push({ bin, loginId, loginPassword });
    }

    if (validRows.length === 0) {
      return c.json({ success: false, error: 'No valid rows found in file' }, 400);
    }

    const CHUNK_SIZE = 5000;
    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    // 2. Fetch all matching clients using chunks
    const binArray = Array.from(uploadedBins);
    const binChunks = chunkArray(binArray, CHUNK_SIZE);
    
    const clientMap = new Map<string, number>();
    for (const chunk of binChunks) {
      const existingClients = await db.select({ id: clients.id, bin: clients.bin })
        .from(clients)
        .where(inArray(clients.bin, chunk));
        
      for (const client of existingClients) {
        if (client.bin) clientMap.set(client.bin, client.id);
      }
    }

    // Filter valid rows to only those whose clients exist
    const rowsWithClients = validRows.filter(row => clientMap.has(row.bin));
    
    if (rowsWithClients.length === 0) {
      return c.json({ success: false, error: 'None of the uploaded BINs matched any existing clients in your list.' }, 400);
    }

    // 3. Fetch all existing credentials for these clients using chunks
    const clientIds = Array.from(clientMap.values());
    const idChunks = chunkArray(clientIds, CHUNK_SIZE);
    
    const credMap = new Map<number, any>();
    for (const chunk of idChunks) {
      const existingCreds = await db.select()
        .from(clientCredentials)
        .where(and(
          inArray(clientCredentials.clientId, chunk),
          eq(clientCredentials.adminId, user.adminId)
        ));
        
      for (const cred of existingCreds) {
        credMap.set(cred.clientId, cred);
      }
    }

    // 4. Prepare bulk arrays
    const toInsert: any[] = [];
    const toUpdate: any[] = [];

    let successCount = 0;
    for (const row of rowsWithClients) {
      const clientId = clientMap.get(row.bin)!;
      const existing = credMap.get(clientId);

      if (existing) {
        toUpdate.push({ id: existing.id, loginId: row.loginId, loginPassword: row.loginPassword });
      } else {
        toInsert.push({
          adminId: user.adminId,
          clientId,
          loginId: row.loginId,
          loginPassword: row.loginPassword,
        });
      }
      successCount++;
    }

    // 5. Execute DB operations
    if (toInsert.length > 0) {
      const insertChunks = chunkArray(toInsert, CHUNK_SIZE);
      for (const chunk of insertChunks) {
        await db.insert(clientCredentials).values(chunk);
      }
    }

    if (toUpdate.length > 0) {
      // Bulk update via transaction
      await db.transaction(async (tx) => {
        for (const update of toUpdate) {
          await tx.update(clientCredentials)
            .set({ loginId: update.loginId, loginPassword: update.loginPassword })
            .where(eq(clientCredentials.id, update.id));
        }
      });
    }

    const errorsCount = validRows.length - rowsWithClients.length;

    return c.json({ 
      success: true, 
      message: `Processed ${successCount} credentials instantly.` + (errorsCount > 0 ? ` Skipped ${errorsCount} rows as their BINs didn't match any clients.` : ''),
    });

  } catch (error) {
    console.error('Error uploading credentials:', error);
    return c.json({ success: false, error: 'Failed to process file' }, 500);
  }
});
export default clientCredentialsApp;
