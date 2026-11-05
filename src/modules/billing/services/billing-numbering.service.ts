import { and, desc, eq, ilike, like, or, type SQL } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { bills } from "../database/models/bills.js";
import { collections } from "../database/models/collections.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";

/**
 * Generates sequential Invoice No in format: [PREFIX]-YYYY-000001 (Dynamic from firm settings)
 * Accepts an optional transaction client (txRunner) to perform atomic sequential locking.
 */
export async function generateNextBillNo(
  year: number,
  customPrefix?: string,
  tenantAdminId?: number | null,
  txRunner?: any
): Promise<string> {
  const runner = txRunner || db;
  let prefixToUse = customPrefix;
  if (!prefixToUse && tenantAdminId) {
    try {
      const firmSetting = await runner.query.companySettings.findFirst({
        where: eq(companySettings.adminId, tenantAdminId)
      });
      if (firmSetting?.invoicePrefix) {
        prefixToUse = firmSetting.invoicePrefix.trim();
      }
    } catch (err) {
      console.warn("Failed to read firm invoice prefix:", err);
    }
  }
  const cleanPrefix = (prefixToUse || "INV").replace(/-+$/, "").toUpperCase();
  const prefix = `${cleanPrefix}-${year}-`;
  const conditions: (SQL | undefined)[] = [or(like(bills.billNo, `${prefix}%`), ilike(bills.billNo, `%-${year}-%`))];
  if (tenantAdminId) {
    conditions.push(eq(bills.createdBy, tenantAdminId));
  }
  const latestBill = (
    await runner
      .select({ billNo: bills.billNo })
      .from(bills)
      .where(and(...conditions))
      .orderBy(desc(bills.id))
      .limit(1)
  )[0];

  let nextSeq = 1;
  if (latestBill && latestBill.billNo) {
    const parts = latestBill.billNo.split("-");
    if (parts.length >= 3) {
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart)) {
        nextSeq = numPart + 1;
      }
    }
  }

  const padded = String(nextSeq).padStart(6, "0");
  return `${prefix}${padded}`;
}

/**
 * Generates sequential Money Receipt No in format: [PREFIX]-YYYY-000001 (Dynamic from firm settings)
 * Accepts an optional transaction client (txRunner) to perform atomic sequential locking.
 */
export async function generateNextReceiptNo(
  year: number,
  customPrefix?: string,
  tenantAdminId?: number | null,
  txRunner?: any
): Promise<string> {
  const runner = txRunner || db;
  let prefixToUse = customPrefix;
  if (!prefixToUse && tenantAdminId) {
    try {
      const firmSetting = await runner.query.companySettings.findFirst({
        where: eq(companySettings.adminId, tenantAdminId)
      });
      if (firmSetting?.receiptPrefix) {
        prefixToUse = firmSetting.receiptPrefix.trim();
      }
    } catch (err) {
      console.warn("Failed to read firm receipt prefix:", err);
    }
  }
  const cleanPrefix = (prefixToUse || "RCP").replace(/-+$/, "").toUpperCase();
  const prefix = `${cleanPrefix}-${year}-`;
  const conditions: (SQL | undefined)[] = [or(like(collections.receiptNo, `${prefix}%`), ilike(collections.receiptNo, `%-${year}-%`))];
  if (tenantAdminId) {
    conditions.push(eq(clients.createdBy, tenantAdminId));
  }
  const latestCol = (
    await runner
      .select({ receiptNo: collections.receiptNo })
      .from(collections)
      .leftJoin(clients, eq(collections.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(collections.id))
      .limit(1)
  )[0];

  let nextSeq = 1;
  if (latestCol && latestCol.receiptNo) {
    const parts = latestCol.receiptNo.split("-");
    if (parts.length >= 3) {
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart)) {
        nextSeq = numPart + 1;
      }
    }
  }

  const padded = String(nextSeq).padStart(6, "0");
  return `${prefix}${padded}`;
}
