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

    // Build purchase query conditions
    const conditions = [
      eq(purchases.adminId, adminId),
      eq(purchases.clientId, parseInt(clientId)),
      eq(purchases.month, month),
    ];
    if (itemId) {
      conditions.push(eq(purchases.itemId, parseInt(itemId)));
    }

    // Fetch all purchases for client+month
    const purchaseData = await db
      .select({
        id: purchases.id,
        beDate: purchases.beDate,
        itemId: purchases.itemId,
        itemName: items.name,
        hsCode: items.hsCode,
        awHsCode: items.awHsCode,
        totalQty: purchases.totalQty,
        netWt: purchases.netWt,
        baseValueOfVat: purchases.baseValueOfVat,
        isFfs: purchases.isFfs,
        isRebate: purchases.isRebate,
      })
      .from(purchases)
      .leftJoin(items, eq(purchases.itemId, items.id))
      .where(and(...conditions));

    if (purchaseData.length === 0) {
      return c.json({ success: true, data: [] });
    }

    // Fetch active sales rates for this client
    const activeRates = await db
      .select({
        id: salesRates.id,
        itemId: salesRates.itemId,
        vatableValue: salesRates.vatableValue,
        salesRate: salesRates.salesRate,
        vatRate: salesRates.vatRate,
        activationDate: salesRates.activationDate,
        factor: unitConversions.factor
      })
      .from(salesRates)
      .leftJoin(unitConversions, eq(salesRates.unitId, unitConversions.id))
      .where(and(
        eq(salesRates.adminId, adminId),
        eq(salesRates.clientId, parseInt(clientId)),
        eq(salesRates.status, 'Active')
      ))
      .orderBy(desc(salesRates.activationDate));

    // Calculate end of report month for fallback
    const [yearStr, monthStr] = month.split('-');
    const reportMonthEnd = new Date(parseInt(yearStr), parseInt(monthStr), 0); // last day of month

    // Fetch VAT notes mapping
    const vatNotes = await db.select().from(vatNotesMapping);

    // Group purchases by itemId, isFfs, and isRebate, calculating split values
    const itemGroups: Record<string, any> = {};
    for (const p of purchaseData) {
      if (!p.itemId) continue;

      const groupKey = `${p.itemId}-${Boolean(p.isFfs)}-${Boolean(p.isRebate)}`;
      const pDate = new Date(p.beDate);
      
      // Find applicable rate: latest rate <= beDate
      let applicableRate = activeRates.find(r => r.itemId === p.itemId && new Date(r.activationDate) <= pDate);
      
      // Fallback: if no rate before beDate, use the rate applicable to the report month
      if (!applicableRate) {
        applicableRate = activeRates.find(r => r.itemId === p.itemId && new Date(r.activationDate) <= reportMonthEnd);
      }
      
      const factor = applicableRate ? Number(applicableRate.factor) || 1 : 1;
      const vatableValue = applicableRate ? Number(applicableRate.vatableValue) * factor : 0;
      const salesRate = applicableRate ? Number(applicableRate.salesRate) * factor : 0;
      
      const pQty = Number(p.totalQty) || 0;
      const pTotalValue = pQty * vatableValue;
      const pTotalSalesRateValue = pQty * salesRate;

      if (!itemGroups[groupKey]) {
        itemGroups[groupKey] = {
          itemId: p.itemId,
          itemName: p.itemName || '-',
          hsCode: p.hsCode || '',
          awHsCode: p.awHsCode || '',
          totalQty: 0,
          netWt: 0,
          totalValue: 0,
          totalBaseValueOfVat: 0,
          totalSalesRateValue: 0,
          latestRateObj: applicableRate,
          isFfs: Boolean(p.isFfs),
          isRebate: Boolean(p.isRebate)
        };
      }
      itemGroups[groupKey].totalQty += pQty;
      itemGroups[groupKey].netWt += Number(p.netWt) || 0;
      itemGroups[groupKey].totalValue += pTotalValue;
      itemGroups[groupKey].totalBaseValueOfVat += Number(p.baseValueOfVat) || 0;
      itemGroups[groupKey].totalSalesRateValue += pTotalSalesRateValue;
    }

    // Build sales report items
    const reportItems: any[] = [];

    for (const group of Object.values(itemGroups)) {
      const rateObj = group.latestRateObj;
      const avgVatableValue = group.totalQty > 0 ? group.totalValue / group.totalQty : 0;
      const avgSalesRate = group.totalQty > 0 ? group.totalSalesRateValue / group.totalQty : 0;
      const avgPurchaseUnitValue = group.totalQty > 0 ? group.totalBaseValueOfVat / group.totalQty : 0;


      const factor = rateObj ? Number(rateObj.factor) || 1 : 1;
      const salesUnitValue = rateObj ? Number(rateObj.vatableValue) * factor : 0;
      let additionPercent = 0;
      if (avgPurchaseUnitValue > 0) {
        additionPercent = ((salesUnitValue - avgPurchaseUnitValue) / avgPurchaseUnitValue) * 100;
      }

      // Use awHsCode for item-level, then hsCode
      // Determine VAT note from vatNotesMapping by vatRate
      const hsToUse = group.awHsCode || group.hsCode;
      
      let vatRate = rateObj ? Number(rateObj.vatRate) : 0;
      let note = '';

      if (group.isRebate) {
        vatRate = 15;
        note = '4'; // Force Note 4 for Rebate Sales
      } else {
        const matchedNote = vatNotes.find(n => Math.abs(Number(n.vatRate) - vatRate) < 0.001);
        note = matchedNote ? matchedNote.noteName : (vatRate === 15 ? '22' : vatRate > 0 ? '15' : '13');
      }

      reportItems.push({
        itemId: group.itemId,
        itemName: group.itemName,
        hsCode: group.hsCode,
        awHsCode: group.awHsCode,
        totalQty: group.totalQty,
        rate: avgSalesRate,
        unitValue: avgVatableValue,
        totalValue: group.totalValue,
        addition: additionPercent,
        vatRate,
        note,
        isFfs: group.isFfs,
      });
    }

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
