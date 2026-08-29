import { Hono } from 'hono';
import * as xlsx from 'xlsx';
import { db } from '../db';
import { clients, items, purchases, columnMappings, notifications, clientCredentials, salesRates } from '../db/schema';
import { eq, and } from 'drizzle-orm';
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
    console.log('[upload.ts] Received upload request');
    const body = await c.req.parseBody();
    console.log('[upload.ts] Parsed body keys:', Object.keys(body));
    const file = body['file'];
    
    console.log('[upload.ts] File object type:', typeof file, 'is instanceof File?', file instanceof File, 'is string?', typeof file === 'string');
    
    if (!file || !(file instanceof File)) {
      console.log('[upload.ts] File validation failed!', file);
      return c.json({ success: false, message: 'No file uploaded.' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    console.log('[upload.ts] Read arrayBuffer, length:', arrayBuffer.byteLength);
    const buffer = Buffer.from(arrayBuffer);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json<any>(sheet, { defval: null });

    console.log('[upload.ts] Parsed excel rows:', rawData?.length);

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

// POST /save
uploadApp.post('/save', async (c) => {
  try {
    const { data, month, isRebate } = await c.req.json();
    const isRebateValue = Boolean(isRebate);
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return c.json({ success: false, message: 'No data provided to save.' }, 400);
    }

    if (!month) {
      return c.json({ success: false, message: 'Month is required to save data.' }, 400);
    }

    const user = c.get('user');
    let insertedRows = 0;
    const duplicatesList: any[] = [];
    const updatedClientAdmins = new Set<number>();

    for (const mappedRow of data) {
      if (Object.keys(mappedRow).length === 0 || (Object.keys(mappedRow).length === 1 && mappedRow.tempId)) continue;

      let parsedDate = new Date();
      if (mappedRow.beDate) {
        parsedDate = new Date(mappedRow.beDate);
      }

      // 1. Find or create Client
      let clientId = null;
      let targetAdminId = user.adminId;
      if (mappedRow.bin || mappedRow.clientName) {
        const clientQuery = await db.select().from(clients).where(eq(clients.bin, mappedRow.bin || '')).limit(1);
        if (clientQuery.length > 0) {
          clientId = clientQuery[0].id;
          targetAdminId = clientQuery[0].adminId;
          
          if (user.role !== 'superadmin' && clientQuery[0].adminId !== user.adminId && !updatedClientAdmins.has(clientId)) {
            const oldAdminId = clientQuery[0].adminId;
            
            // Transfer client and all associated data to the new admin
            await db.update(clients).set({ adminId: user.adminId }).where(eq(clients.id, clientId));
            await db.update(clientCredentials).set({ adminId: user.adminId }).where(eq(clientCredentials.clientId, clientId));
            await db.update(purchases).set({ adminId: user.adminId }).where(eq(purchases.clientId, clientId));
            await db.update(salesRates).set({ adminId: user.adminId }).where(eq(salesRates.clientId, clientId));
            
            updatedClientAdmins.add(clientId);
            
            // Insert notification for superadmin
            await db.insert(notifications).values({
              message: `Client "${clientQuery[0].name}" (BIN: ${clientQuery[0].bin || 'N/A'}) was automatically transferred to Admin ${user.name || user.email || user.adminId} upon new data upload.`,
              clientId: clientId,
              oldAdminId: oldAdminId,
              newAdminId: user.adminId
            });
          }
        } else {
          const newClient = await db.insert(clients).values({
            name: mappedRow.clientName || 'Unknown',
            bin: mappedRow.bin || null,
            adminId: targetAdminId
          }).returning({ id: clients.id });
          clientId = newClient[0].id;
        }
      }
      
      // Store the targetAdminId in mappedRow so we can use it when inserting purchase later
      mappedRow._targetAdminId = targetAdminId;

      // 2. Find or create Item
      let itemId = null;
      if (mappedRow.hsCode || mappedRow.itemName) {
        const normalizedAwHsCode = String(mappedRow.hsCode || '').trim().replace(/[\.\s]/g, '');
        const itemQuery = await db.select().from(items).where(eq(items.awHsCode, normalizedAwHsCode)).limit(1);
        if (itemQuery.length > 0) {
          itemId = itemQuery[0].id;
        } else {
          const newItem = await db.insert(items).values({
            name: mappedRow.itemName || 'Unknown',
            hsCode: mappedRow.hsCode || null,
            awHsCode: normalizedAwHsCode
          }).returning({ id: items.id });
          itemId = newItem[0].id;
        }
      }

      // 3. Insert Purchase
      if (clientId && itemId) {
        const round2 = (val: number): number => Math.round(val * 100) / 100;
        const parseNumber = (val: any): number => {
          if (val === undefined || val === null) return 0;
          const cleanVal = String(val).replace(/,/g, '').trim();
          return parseFloat(cleanVal) || 0;
        };

        const netWt = round2(parseNumber(mappedRow.netWt));
        const excessQty = round2(parseNumber(mappedRow.excessQty));
        const totalQty = round2(netWt + excessQty);
        
        const assValue = round2(parseNumber(mappedRow.assValue));
        const cd = round2(parseNumber(mappedRow.cd));
        const rd = round2(parseNumber(mappedRow.rd));
        const sd = round2(parseNumber(mappedRow.sd));
        const baseValueOfVat = round2(assValue + cd + rd + sd);
        
        const unitValue = round2(totalQty > 0 ? (baseValueOfVat / totalQty) : 0);
        const vat = mappedRow.vat !== undefined ? round2(parseNumber(mappedRow.vat)) : undefined;
        const at = mappedRow.at !== undefined ? round2(parseNumber(mappedRow.at)) : undefined;

        const formattedDate = parsedDate ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}` : null;

        // Validation: Prevent duplicate data for the same admin
        const duplicateCheck = await db.select().from(purchases).where(
          and(
            eq(purchases.adminId, user.adminId),
            eq(purchases.itemId, itemId),
            eq(purchases.office, (mappedRow.office?.toString() || '').trim()),
            eq(purchases.beNo, (mappedRow.beNo?.toString() || '').trim()),
            eq(purchases.beDate, formattedDate as any)
          )
        ).limit(1);

        if (duplicateCheck.length > 0) {
          duplicatesList.push({
            existing: duplicateCheck[0],
            newData: {
              clientId,
              itemId,
              office: mappedRow.office?.toString() || '',
              beNo: mappedRow.beNo?.toString() || '',
              beDate: formattedDate,
              month: month,
              lcNumber: mappedRow.lcNumber?.toString() || '',
              netWt,
              excessQty,
              totalQty,
              assValue,
              unitValue: round2(totalQty > 0 ? (baseValueOfVat / totalQty) : 0),
              cd,
              rd,
              sd,
              baseValueOfVat,
              vat,
              at,
              isRebate: isRebateValue,
              tempId: mappedRow.tempId
            }
          });
          continue; 
        }

        await db.insert(purchases).values({
          adminId: user.adminId,
          clientId,
          itemId,
          office: (mappedRow.office?.toString() || '').trim(),
          beNo: (mappedRow.beNo?.toString() || '').trim(),
          beDate: formattedDate as any,
          month: month,
          lcNumber: (mappedRow.lcNumber?.toString() || '').trim(),
          netWt: netWt,
          excessQty: excessQty,
          totalQty: totalQty,
          assValue: assValue,
          unitValue: round2(totalQty > 0 ? (baseValueOfVat / totalQty) : 0),
          cd: cd,
          rd: rd,
          sd: sd,
          baseValueOfVat: baseValueOfVat,
          vat: vat,
          at: at,
          isRebate: isRebateValue,
        });
        insertedRows++;
      }
    }
    
    return c.json({
      success: true,
      message: 'Data saved to database successfully.',
      totalRowsProcessed: insertedRows,
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
