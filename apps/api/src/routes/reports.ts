import { Hono } from 'hono';
import { db } from '../db';
import { purchases, salesRates, items, clients, vatNotesMapping, unitConversions } from '../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { authenticate } from '../middlewares/auth';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const reportsApp = new Hono<{ Variables: Variables }>();

reportsApp.use('*', authenticate);

// GET /monthly-summary - Summary of total metric tons per client for a given month
reportsApp.get('/monthly-summary', async (c) => {
  try {
    const month = c.req.query('month');
    if (!month) {
      return c.json({ success: false, message: 'month is required' }, 400);
    }

    const user = c.get('user');
    const adminId = user.adminId;

    const rawSql = sql`
      SELECT 
        c.id as "clientId",
        c.name as "clientName",
        c.bin as "clientBin",
        SUM(p.net_wt) as "totalNetWt"
      FROM clients c
      INNER JOIN purchases p ON c.id = p.client_id
      WHERE p.month = ${month}
        AND p.admin_id = ${adminId}
      GROUP BY c.id, c.name, c.bin
      ORDER BY c.name ASC
    `;

    const result = await db.execute(rawSql);

    const data = result.map((row: any) => ({
      clientId: row.clientId,
      clientName: row.clientName,
      clientBin: row.clientBin || '',
      totalNetWt: row.totalNetWt || 0
    }));

    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching monthly summary:', error);
    return c.json({ success: false, message: 'Failed to fetch monthly summary' }, 500);
  }
});

// GET /sales - Sales report: aggregates purchases by item with sales rate calculations
reportsApp.get('/sales', async (c) => {
  try {
    const clientId = c.req.query('clientId');
    const month = c.req.query('month');
    const itemId = c.req.query('itemId');

    if (!clientId || !month) {
      return c.json({ success: false, message: 'clientId and month are required' }, 400);
    }

    const user = c.get('user');
    const adminId = user.adminId;

    // Calculate end of report month for fallback
    const [yearStr, monthStr] = month.split('-');
    const reportMonthEnd = new Date(parseInt(yearStr), parseInt(monthStr), 0); // last day of month
    const reportMonthEndStr = `${reportMonthEnd.getFullYear()}-${String(reportMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(reportMonthEnd.getDate()).padStart(2, '0')}`;

    const rawSql = sql`
      SELECT 
        p.item_id as "itemId",
        i.name as "itemName",
        i.hs_code as "hsCode",
        i.aw_hs_code as "awHsCode",
        p.is_ffs as "isFfs",
        p.is_rebate as "isRebate",
        SUM(p.total_qty) as "totalQty",
        SUM(p.net_wt) as "netWt",
        SUM(p.base_value_of_vat) as "totalBaseValueOfVat",
        SUM(p.total_qty * COALESCE(sr.sales_rate, 0) * COALESCE(uc.factor, 1)) as "totalSalesRateValue",
        SUM(p.total_qty * COALESCE(sr.vatable_value, 0) * COALESCE(uc.factor, 1)) as "totalValue",
        MAX(COALESCE(sr.vat_rate, 0)) as "vatRate"
      FROM purchases p
      LEFT JOIN items i ON p.item_id = i.id
      LEFT JOIN LATERAL (
        SELECT r.vatable_value, r.sales_rate, r.vat_rate, r.unit_id
        FROM sales_rates r
        WHERE r.item_id = p.item_id
          AND r.client_id = p.client_id
          AND r.status = 'Active'
          AND (r.activation_date <= p.be_date OR r.activation_date <= ${reportMonthEndStr})
        ORDER BY 
          CASE WHEN r.activation_date <= p.be_date THEN 0 ELSE 1 END ASC,
          r.activation_date DESC
        LIMIT 1
      ) sr ON true
      LEFT JOIN unit_conversions uc ON sr.unit_id = uc.id
      WHERE p.client_id = ${parseInt(clientId)}
        AND p.month = ${month}
        AND p.admin_id = ${adminId}
        ${itemId ? sql`AND p.item_id = ${parseInt(itemId)}` : sql``}
      GROUP BY p.item_id, i.name, i.hs_code, i.aw_hs_code, p.is_ffs, p.is_rebate
    `;

    const result = await db.execute(rawSql);
    const vatNotes = await db.select().from(vatNotesMapping);

    const reportItems = result.map((row: any) => {
      const avgVatableValue = row.totalQty > 0 ? row.totalValue / row.totalQty : 0;
      const avgSalesRate = row.totalQty > 0 ? row.totalSalesRateValue / row.totalQty : 0;
      const avgPurchaseUnitValue = row.totalQty > 0 ? row.totalBaseValueOfVat / row.totalQty : 0;

      const salesUnitValue = row.totalQty > 0 ? row.totalValue / row.totalQty : 0;
      let additionPercent = 0;
      if (avgPurchaseUnitValue > 0) {
        additionPercent = ((salesUnitValue - avgPurchaseUnitValue) / avgPurchaseUnitValue) * 100;
      }

      let vatRate = Number(row.vatRate);
      let note = '';

      if (row.isRebate) {
        vatRate = 15;
        note = '4';
      } else {
        const matchedNote = vatNotes.find(n => Math.abs(Number(n.vatRate) - vatRate) < 0.001);
        note = matchedNote ? matchedNote.noteName : (vatRate === 15 ? '22' : vatRate > 0 ? '15' : '13');
      }

      return {
        itemId: row.itemId,
        itemName: row.itemName,
        hsCode: row.hsCode,
        awHsCode: row.awHsCode,
        totalQty: Number(row.totalQty),
        rate: avgSalesRate,
        unitValue: avgVatableValue,
        totalValue: Number(row.totalValue),
        addition: additionPercent,
        vatRate,
        note,
        isFfs: Boolean(row.isFfs),
      };
    });

    return c.json({ success: true, data: reportItems });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    return c.json({ success: false, message: 'Failed to generate sales report' }, 500);
  }
});

// GET /statement
reportsApp.get('/statement', async (c) => {
  try {
    const clientId = c.req.query('clientId');
    const month = c.req.query('month');

    if (!clientId || !month) {
      return c.json({ success: false, message: 'clientId and month are required' }, 400);
    }

    const user = c.get('user');
    const adminId = user.adminId;

    // Fetch purchases for the client and month
    const purchaseData = await db
      .select({
        id: purchases.id,
        beDate: purchases.beDate,
        itemId: purchases.itemId,
        itemName: items.name,
        hsCode: items.hsCode,
        totalQty: purchases.totalQty,
      })
      .from(purchases)
      .leftJoin(items, eq(purchases.itemId, items.id))
      .where(and(
        eq(purchases.adminId, adminId),
        eq(purchases.clientId, parseInt(clientId)),
        eq(purchases.month, month)
      ));

    // Group purchases by itemId and beDate
    const purchasesByItemAndDate: Record<number, Record<string, number>> = {};
    for (const p of purchaseData) {
      if (!purchasesByItemAndDate[p.itemId]) {
        purchasesByItemAndDate[p.itemId] = {};
      }
      if (!purchasesByItemAndDate[p.itemId][p.beDate]) {
        purchasesByItemAndDate[p.itemId][p.beDate] = 0;
      }
      purchasesByItemAndDate[p.itemId][p.beDate] += Number(p.totalQty) || 0;
    }

    // Fetch sales rates up to the end of the selected month
    const [year, monthNum] = month.split('-');
    const lastDayOfMonth = new Date(parseInt(year), parseInt(monthNum), 0);
    const endOfMonthStr = `${lastDayOfMonth.getFullYear()}-${String(lastDayOfMonth.getMonth() + 1).padStart(2, '0')}-${String(lastDayOfMonth.getDate()).padStart(2, '0')}`;

    const ratesData = await db
      .select({
        itemId: salesRates.itemId,
        salesRate: salesRates.salesRate,
        vatRate: salesRates.vatRate,
        vatableValue: salesRates.vatableValue,
        activationDate: salesRates.activationDate,
        factor: unitConversions.factor,
      })
      .from(salesRates)
      .leftJoin(unitConversions, eq(salesRates.unitId, unitConversions.id))
      .where(and(
        eq(salesRates.adminId, adminId),
        eq(salesRates.clientId, parseInt(clientId))
      ))
      .orderBy(salesRates.itemId, salesRates.activationDate);

    // Group rates by itemId
    const ratesByItem: Record<number, any[]> = {};
    for (const r of ratesData) {
      if (!ratesByItem[r.itemId]) {
        ratesByItem[r.itemId] = [];
      }
      ratesByItem[r.itemId].push(r);
    }

    const statementRows: any[] = [];
    
    const parseDate = (rawStr: any) => {
      if (!rawStr) return 0;
      const dStr = String(rawStr);
      
      // Try native JS parsing first (handles M/D/YYYY, YYYY-MM-DD, ISO well)
      let parsed = new Date(dStr).getTime();
      
      // If native parsing fails, it's likely DD/MM/YYYY
      if (isNaN(parsed)) {
        try {
          if (dStr.includes('/')) {
            const parts = dStr.split('/');
            if (parts.length === 3) {
              // Assume DD/MM/YYYY
              parsed = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
            }
          } else if (dStr.includes('-')) {
            const parts = dStr.split('-');
            if (parts.length >= 3) {
              if (parts[0].length === 4) {
                 parsed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0,2))).getTime();
              }
            }
          }
        } catch (e) {
           console.error('Date parsing error', e);
        }
      }
      return isNaN(parsed) ? 0 : parsed;
    };

    // For each item, split the month into ranges based on activation dates
    for (const itemIdStr of Object.keys(purchasesByItemAndDate)) {
      const itemId = parseInt(itemIdStr);
      const datesObj = purchasesByItemAndDate[itemId];
      
      const itemRates = ratesByItem[itemId] || [];
      
      const monthStartStr = `${month}-01`;
      let currentStartDate = monthStartStr;
      
      const mStartTimestamp = parseDate(monthStartStr);
      const mEndTimestamp = parseDate(endOfMonthStr);

      // Find the rate active at the start of the month
      let baseRate = itemRates.filter(r => parseDate(r.activationDate) <= mStartTimestamp).pop();

      // Find rates activated *during* the month
      const monthRates = itemRates.filter(r => parseDate(r.activationDate) > mStartTimestamp && parseDate(r.activationDate) <= mEndTimestamp);
      
      const ranges: { startDate: string, endDate: string, rate: any }[] = [];

      for (const mr of monthRates) {
        const prevEnd = new Date(parseDate(mr.activationDate));
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevEndStr = prevEnd.toISOString().split('T')[0];
        
        ranges.push({
          startDate: currentStartDate,
          endDate: prevEndStr,
          rate: baseRate
        });
        
        currentStartDate = mr.activationDate;
        baseRate = mr;
      }

      // Add the final range to the end of the month
      ranges.push({
        startDate: currentStartDate,
        endDate: endOfMonthStr,
        rate: baseRate
      });

      // Now aggregate purchases into these ranges
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        let totalQty = 0;
        const rangeStart = parseDate(range.startDate);
        const rangeEnd = parseDate(range.endDate);

        for (const [beDate, qty] of Object.entries(datesObj)) {
          const bDate = parseDate(beDate);
          if (i === 0) {
            // First range absorbs all older purchases (FIFO principle)
            if (bDate <= rangeEnd) {
              totalQty += qty;
            }
          } else {
            if (bDate > rangeStart && bDate <= rangeEnd) {
              totalQty += qty;
            }
          }
        }

        if (totalQty > 0) {
            const rateObj = range.rate;
            const factor = rateObj ? Number(rateObj.factor) || 1 : 1;
            const salesRateVal = rateObj ? Number(rateObj.salesRate) * factor : 0;
            const vatRateVal = rateObj ? Number(rateObj.vatRate) : 0;
            const vatableValueVal = rateObj ? Number(rateObj.vatableValue) * factor : 0;
            
            const totalSalesValue = totalQty * salesRateVal;
            const totalVatableValue = totalQty * vatableValueVal;
            const totalVat = (totalVatableValue * vatRateVal) / 100;

            // Get itemName
            const itemName = purchaseData.find(p => p.itemId === itemId)?.itemName;

            statementRows.push({
              itemId,
              itemName,
              startDate: range.startDate,
              endDate: range.endDate,
              qty: totalQty,
              salesRate: salesRateVal,
              totalSalesValue,
              vatRate: vatRateVal,
              vatableValue: totalVatableValue,
              vat: totalVat
            });
          }
        }
      }

    // Sort rows by item name, then start date
    statementRows.sort((a, b) => {
      if (a.itemName !== b.itemName) return a.itemName.localeCompare(b.itemName || '');
      return a.startDate.localeCompare(b.startDate);
    });

    return c.json({ success: true, data: statementRows });
  } catch (error) {
    console.error('Error generating statement:', error);
    return c.json({ success: false, message: 'Failed to generate statement' }, 500);
  }
});

export default reportsApp;
