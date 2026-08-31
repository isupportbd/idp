import { Hono } from 'hono';
import * as xlsx from 'xlsx';
import { db } from '../db';
import { clients, items, purchases, columnMappings, notifications, clientCredentials, salesRates } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticate, requireRole } from '../middlewares/auth';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const uploadApp = new Hono<{ Variables: { user: any } }>();

uploadApp.use('*', authenticate, requireRole(['admin']));

// Helper to parse dates from Excel
function parseDateValue(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial number
    const utc_days = Math.floor(val - 25569);
    const date = new Date(utc_days * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    // DD/MM/YYYY format
    const match = val.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return val.split(' ')[0];
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return String(val);
}

// POST /
uploadApp.post('/', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ success: false, message: 'No file uploaded.' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json<any>(sheet, { defval: null });

    if (!rawData || rawData.length === 0) {
      return c.json({ success: false, message: 'The uploaded file is empty.' }, 400);
    }

    const dbMappings = await db.select().from(columnMappings);
    const processedData = [];

    for (const row of rawData) {
      const mappedRow: any = {};
      
      dbMappings.forEach(mapping => {
        const cleanExcelHeader = mapping.excelHeader.trim().toLowerCase().replace(/\s+/g, '');
        const rowKey = Object.keys(row).find(k => k.trim().toLowerCase().replace(/\s+/g, '') === cleanExcelHeader);
        
        if (rowKey && row[rowKey] !== undefined && row[rowKey] !== null && String(row[rowKey]).trim() !== '') {
          let val = row[rowKey];
          const dbCol = mapping.dbColumn;
          
          if (dbCol === 'excessQty' && typeof val === 'string') {
            const cleanVal = val.replace(/,/g, '');
            const keywordMatch = cleanVal.match(/(?:ex(?:ceess|cess)?|qty)[\s:]*(\d+(\.\d+)?)/i);
            if (keywordMatch && keywordMatch[1]) {
              val = keywordMatch[1];
            } else {
              const numbers = cleanVal.match(/\d+(\.\d+)?/g);
              if (numbers && numbers.length > 0) {
                val = numbers[numbers.length - 1];
              } else {
                val = 0;
              }
            }
          }

          if (dbCol === 'beDate') {
            val = parseDateValue(val);
          }
          
          mappedRow[dbCol] = val;
        }
      });

      if (Object.keys(mappedRow).length === 0) continue;
      
      if (!mappedRow.beNo || !mappedRow.hsCode) {
        continue; 
      }

      mappedRow.tempId = Math.random().toString(36).substr(2, 9);
      processedData.push(mappedRow);
    }
    
    if (processedData.length === 0) {
      return c.json({ 
        success: false, 
        message: 'No valid rows found in the uploaded file. Please ensure the Excel headers exactly match the Database Column Mappings (especially BE_NO and HSCode).' 
      }, 400);
    }
    
    // Validate HS Codes
    const uploadedItemsMap = new Map<string, string>();
    const originalHsCodeMap = new Map<string, string>();

    for (const row of processedData) {
      if (row.hsCode) {
        const originalHsCode = String(row.hsCode).trim();
        const normalizedHsCode = originalHsCode.replace(/[\.\s]/g, '');
        const itemName = row.itemName ? String(row.itemName).trim() : 'Unknown Item';
        
        if (!uploadedItemsMap.has(normalizedHsCode)) {
          uploadedItemsMap.set(normalizedHsCode, itemName);
          originalHsCodeMap.set(normalizedHsCode, originalHsCode);
        }
      }
    }

    const dbItems = await db.select().from(items);
    const dbNormalizedHsCodes = new Set(
      dbItems
        .filter(item => item.hsCode || item.awHsCode)
        .map(item => String(item.awHsCode || String(item.hsCode).replace(/[\.\s]/g, '')))
    );

    const missingItems: any[] = [];
    for (const [normalizedHsCode, itemName] of uploadedItemsMap.entries()) {
      if (!dbNormalizedHsCodes.has(normalizedHsCode)) {
        missingItems.push({
          hsCode: originalHsCodeMap.get(normalizedHsCode),
          name: itemName,
          awHsCode: normalizedHsCode
        });
      }
    }

    if (missingItems.length > 0) {
      return c.json({
        success: false,
        requiresItemMapping: true,
        message: 'Some items need to be mapped to HS Codes before proceeding.',
        missingItems: missingItems,
        data: processedData
      });
    }
    
    const dbItemsMap = new Map<string, string>();
    dbItems.forEach(item => {
      if (item.hsCode || item.awHsCode) {
        dbItemsMap.set(String(item.awHsCode || String(item.hsCode).replace(/[\.\s]/g, '')), item.name);
      }
    });

    for (const row of processedData) {
      if (row.hsCode && !row.itemName) {
        const normalizedHsCode = String(row.hsCode).trim().replace(/[\.\s]/g, '');
        if (dbItemsMap.has(normalizedHsCode)) {
          row.itemName = dbItemsMap.get(normalizedHsCode);
        }
      }
    }
    
    return c.json({
      success: true,
      message: 'File processed successfully.',
      data: processedData
    });

  } catch (error: any) {
    console.error('Error processing file:', error);
    return c.json({ success: false, message: 'Failed to process file.' }, 500);
  }
});

// POST /save — Batch-optimized: preloads clients/items, batch inserts purchases
uploadApp.post('/save', async (c) => {
  try {
    const { data, month, isRebate, isFfs } = await c.req.json();
    const isRebateValue = Boolean(isRebate);
    const isFfsValue = Boolean(isFfs);

    if (!data || !Array.isArray(data) || data.length === 0) {
      return c.json({ success: false, message: 'No data provided to save.' }, 400);
    }
    if (!month) {
      return c.json({ success: false, message: 'Month is required to save data.' }, 400);
    }

    const user = c.get('user');
    const duplicatesList: any[] = [];

    // ── Step 1: Preload all clients by BIN in ONE query ──────────────────
    const uniqueBins = [...new Set(
      data.map((r: any) => r.bin).filter((b: any) => b != null && String(b).trim() !== '')
    )] as string[];
    const existingClients = uniqueBins.length > 0
      ? await db.select().from(clients).where(inArray(clients.bin, uniqueBins))
      : [];
    const clientByBin = new Map(existingClients.map(c => [c.bin as string, c]));

    // ── Step 2: Preload all items by awHsCode in ONE query ───────────────
    const uniqueHsCodes = [...new Set(
      data
        .map((r: any) => r.hsCode ? String(r.hsCode).trim().replace(/[.\s]/g, '') : null)
        .filter(Boolean)
    )] as string[];
    const existingItems = uniqueHsCodes.length > 0
      ? await db.select().from(items).where(inArray(items.awHsCode, uniqueHsCodes))
      : [];
    const itemByHsCode = new Map(existingItems.map(i => [i.awHsCode as string, i]));

    // ── Step 3: Preload existing purchases for this admin (global duplicate check across all months) ─
    const existingPurchases = await db.select({
      id: purchases.id,
      beNo: purchases.beNo,
      beDate: purchases.beDate,
      itemId: purchases.itemId,
      office: purchases.office,
    }).from(purchases).where(
      eq(purchases.adminId, user.adminId)
    );
    const existingKeys = new Set(
      existingPurchases.map(p =>
        `${(p.beNo || '')}|${p.beDate}|${p.itemId}|${(p.office || '').trim()}`
      )
    );

    // ── Step 4: Handle client admin transfers (still sequential, rare) ───
    const updatedClientAdmins = new Set<number>();
    for (const mappedRow of data) {
      const bin = mappedRow.bin ? String(mappedRow.bin).trim() : null;
      if (!bin) continue;
      const existingClient = clientByBin.get(bin);
      if (
        existingClient &&
        user.role !== 'superadmin' &&
        existingClient.adminId !== user.adminId &&
        !updatedClientAdmins.has(existingClient.id)
      ) {
        const oldAdminId = existingClient.adminId;
        await db.update(clients).set({ adminId: user.adminId }).where(eq(clients.id, existingClient.id));
        await db.update(clientCredentials).set({ adminId: user.adminId }).where(eq(clientCredentials.clientId, existingClient.id));
        await db.update(purchases).set({ adminId: user.adminId }).where(eq(purchases.clientId, existingClient.id));
        await db.update(salesRates).set({ adminId: user.adminId }).where(eq(salesRates.clientId, existingClient.id));
        await db.insert(notifications).values({
          message: `Client "${existingClient.name}" (BIN: ${existingClient.bin || 'N/A'}) was automatically transferred to Admin ${user.adminId} upon new data upload.`,
          clientId: existingClient.id,
          oldAdminId,
          newAdminId: user.adminId
        });
        updatedClientAdmins.add(existingClient.id);
        // Update cache to reflect new admin
        clientByBin.set(bin, { ...existingClient, adminId: user.adminId });
      }
    }

    // ── Step 5: Process all rows in memory, build insert batch ───────────
    const round2 = (val: number) => Math.round(val * 100) / 100;
    const parseNumber = (val: any): number => {
      if (val === undefined || val === null) return 0;
      return parseFloat(String(val).replace(/,/g, '').trim()) || 0;
    };

    const toInsert: any[] = [];

    for (const mappedRow of data) {
      if (Object.keys(mappedRow).length === 0 || (Object.keys(mappedRow).length === 1 && mappedRow.tempId)) continue;

      let parsedDate = new Date();
      if (mappedRow.beDate) parsedDate = new Date(mappedRow.beDate);

      // Resolve client
      let clientId: number | null = null;
      let targetAdminId = user.adminId;
      const bin = mappedRow.bin ? String(mappedRow.bin).trim() : null;
      if (bin || mappedRow.clientName) {
        const cachedClient = bin ? clientByBin.get(bin) : undefined;
        if (cachedClient) {
          clientId = cachedClient.id;
          targetAdminId = cachedClient.adminId;
        } else {
          // Truly new client — insert and cache
          const newClient = await db.insert(clients).values({
            name: mappedRow.clientName || 'Unknown',
            bin: bin || null,
            adminId: targetAdminId
          }).returning();
          clientId = newClient[0].id;
          if (bin) clientByBin.set(bin, newClient[0]);
        }
      }

      // Resolve item
      let itemId: number | null = null;
      if (mappedRow.hsCode || mappedRow.itemName) {
        const normalizedHsCode = String(mappedRow.hsCode || '').trim().replace(/[.\s]/g, '');
        const cachedItem = itemByHsCode.get(normalizedHsCode);
        if (cachedItem) {
          itemId = cachedItem.id;
        } else {
          // Truly new item — insert and cache
          const newItem = await db.insert(items).values({
            name: mappedRow.itemName || 'Unknown',
            hsCode: mappedRow.hsCode || null,
            awHsCode: normalizedHsCode
          }).returning();
          itemId = newItem[0].id;
          itemByHsCode.set(normalizedHsCode, newItem[0]);
        }
      }

      if (!clientId || !itemId) continue;

      // Calculate values
      const netWt = round2(parseNumber(mappedRow.netWt));
      const excessQty = round2(parseNumber(mappedRow.excessQty));
      const totalQty = round2(netWt + excessQty);
      const assValue = round2(parseNumber(mappedRow.assValue));
      const cd = round2(parseNumber(mappedRow.cd));
      const rd = round2(parseNumber(mappedRow.rd));
      const sd = round2(parseNumber(mappedRow.sd));
      const baseValueOfVat = round2(assValue + cd + rd + sd);
      const unitValue = round2(totalQty > 0 ? baseValueOfVat / totalQty : 0);
      const vat = mappedRow.vat !== undefined ? round2(parseNumber(mappedRow.vat)) : undefined;
      const at = mappedRow.at !== undefined ? round2(parseNumber(mappedRow.at)) : undefined;
      const formattedDate = parsedDate
        ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`
        : null;

      // Duplicate check in memory (O(1))
      const office = (mappedRow.office?.toString() || '').trim();
      const beNo = (mappedRow.beNo?.toString() || '').trim();
      const dedupKey = `${beNo}|${formattedDate}|${itemId}|${office}`;

      let rowFfs = isFfsValue;
      if (parsedDate && parsedDate < new Date('2025-07-01T00:00:00')) {
        rowFfs = false;
      }

      if (existingKeys.has(dedupKey)) {
        const existing = existingPurchases.find(p =>
          p.beNo === beNo &&
          String(p.beDate) === formattedDate &&
          p.itemId === itemId &&
          (p.office || '').trim() === office
        );
        duplicatesList.push({
          existing,
          newData: { clientId, itemId, office, beNo, beDate: formattedDate, month, lcNumber: (mappedRow.lcNumber?.toString() || '').trim(), netWt, excessQty, totalQty, assValue, unitValue, cd, rd, sd, baseValueOfVat, vat, at, isRebate: isRebateValue, isFfs: rowFfs, tempId: mappedRow.tempId }
        });
        continue;
      }

      toInsert.push({
        adminId: user.adminId,
        clientId,
        itemId,
        office,
        beNo,
        beDate: formattedDate as any,
        month,
        lcNumber: (mappedRow.lcNumber?.toString() || '').trim(),
        netWt, excessQty, totalQty, assValue, unitValue, cd, rd, sd, baseValueOfVat, vat, at,
        isRebate: isRebateValue,
        isFfs: rowFfs,
      });
    }

    // ── Step 6: Batch INSERT all valid rows in ONE query ─────────────────
    if (toInsert.length > 0) {
      await db.insert(purchases).values(toInsert);
    }

    return c.json({
      success: true,
      message: 'Data saved to database successfully.',
      totalRowsProcessed: toInsert.length,
      duplicatesList: duplicatesList.length > 0 ? duplicatesList : undefined
    });

  } catch (error: any) {
    console.error('Error saving data:', error);
    return c.json({ success: false, message: 'Failed to save data.' }, 500);
  }
});

// POST /replace
uploadApp.post('/replace', async (c) => {
  try {
    const { itemsToReplace } = await c.req.json();
    
    if (!itemsToReplace || !Array.isArray(itemsToReplace) || itemsToReplace.length === 0) {
      return c.json({ success: false, message: 'No items provided to replace.' }, 400);
    }

    let replacedRows = 0;

    for (const item of itemsToReplace) {
      if (!item.existing || !item.existing.id || !item.newData) continue;

      await db.update(purchases)
        .set({
          netWt: item.newData.netWt,
          excessQty: item.newData.excessQty,
          totalQty: item.newData.totalQty,
          assValue: item.newData.assValue,
          unitValue: item.newData.unitValue,
          cd: item.newData.cd,
          rd: item.newData.rd,
          sd: item.newData.sd,
          baseValueOfVat: item.newData.baseValueOfVat,
          vat: item.newData.vat,
          at: item.newData.at,
          isRebate: item.newData.isRebate,
          isFfs: item.newData.isFfs,
        })
        .where(eq(purchases.id, item.existing.id));
      
      replacedRows++;
    }

    return c.json({
      success: true,
      message: 'Duplicates replaced successfully.',
      totalRowsReplaced: replacedRows,
    });
  } catch (error: any) {
    console.error('Error replacing duplicates:', error);
    return c.json({ success: false, message: 'Failed to replace duplicates.' }, 500);
  }
});

export default uploadApp;
