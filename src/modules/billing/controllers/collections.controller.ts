import type { AppContext } from "@/framework/facade.js";
import { and, asc, desc, eq, ilike, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import {
  billingScope,
  broadcast,
  collectionReceivedPayload,
  db,
  HttpStatusCodes,
  resolveTenantContext
} from "@/framework/facade.js";
import { enqueueTransactionalSms } from "@/modules/sms-templates/services/sms-queue.service.js";
import { isTenantSmsEventEnabled, normalizeBdMobile } from "@/modules/sms-templates/services/sms.service.js";
import { generateNextReceiptNo } from "../services/billing-numbering.service.js";
import { getClientRunningDue } from "../services/billing-balance.service.js";
import { bills } from "../database/models/bills.js";
import { collections } from "../database/models/collections.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { users } from "@/modules/auth/database/models/user.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { bankAccounts } from "@/modules/firm/database/models/bank_accounts.js";
import { clientBelongsToTenant, loadScopedBill, loadScopedCollection, r2 } from "./billing.helpers.js";

// ── 10. COLLECTIONS & MONEY RECEIPTS ─────────────────────────────────

export const listCollections = async (c: AppContext) => {
  try {
    const query = c.req.valid("query");
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
    let conditions: SQL[] = [];

    if (!isSuperAdmin && tenantAdminId) {
      conditions.push(eq(clients.createdBy, tenantAdminId));
    }
    if (query.clientId && query.clientId !== "all") {
      conditions.push(eq(collections.clientId, Number(query.clientId)));
    }
    if (query.paymentMethod && query.paymentMethod !== "all") {
      conditions.push(eq(collections.paymentMethod, query.paymentMethod));
    }
    if (query.referenceId && query.referenceId !== "all") {
      conditions.push(eq(clients.referenceId, Number(query.referenceId)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: collections.id,
        receiptNo: collections.receiptNo,
        billId: collections.billId,
        billNo: bills.billNo,
        clientId: collections.clientId,
        clientName: clients.companyName,
        clientBin: clients.binNumber,
        clientMobile: clients.mobile,
        clientAlternativeMobile: clients.alternativeMobile,
        collectionDate: collections.collectionDate,
        amount: collections.amount,
        paymentMethod: collections.paymentMethod,
        referenceNo: collections.referenceNo,
        notes: collections.notes,
        receivedById: collections.receivedBy,
        receivedByName: users.name,
        status: collections.status,
        createdAt: collections.createdAt
      })
      .from(collections)
      .leftJoin(clients, eq(collections.clientId, clients.id))
      .leftJoin(bills, eq(collections.billId, bills.id))
      .leftJoin(users, eq(collections.receivedBy, users.id))
      .where(whereClause)
      .orderBy(desc(collections.id));

    let list = rows;
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.receiptNo.toLowerCase().includes(q) ||
          r.clientName?.toLowerCase().includes(q) ||
          r.billNo?.toLowerCase().includes(q) ||
          r.referenceNo?.toLowerCase().includes(q)
      );
    }

    const totalCollected = r2(list.filter((r) => r.status === "completed").reduce((acc, c) => acc + c.amount, 0));

    return c.json(
      {
        message: "Collections fetched successfully",
        data: list,
        totalCollected,
        count: list.length
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json(
      { message: "Failed to fetch collections" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const createCollection = async (c: AppContext) => {
  try {
    const payload = c.req.valid("json");
    const { clientId, billId, collectionDate, amount, paymentMethod, referenceNo, notes } = payload;
    const { userId, tenantAdminId } = await resolveTenantContext(c);

    // Tenant guard: the client (and every linked bill) must belong to the caller.
    if (!(await clientBelongsToTenant(c, Number(clientId)))) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const parsedDate = new Date(collectionDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return c.json({ message: "Invalid collection date" }, HttpStatusCodes.BAD_REQUEST);
    }

    let targetBill = null;
    if (billId) {
      targetBill = await loadScopedBill(c, Number(billId));
      if (!targetBill) {
        return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
      }
      if (Number(targetBill.clientId) !== Number(clientId)) {
        return c.json({ message: "Bill does not belong to the selected client" }, HttpStatusCodes.BAD_REQUEST);
      }
    }

    const year = parsedDate.getFullYear() || new Date().getFullYear();
    const normalizedAmount = r2(amount);

    // Insert the receipt and settle the invoice in a single transaction so the
    // ledger and the invoice balance can never diverge. Receipt number is generated atomically inside tx.
    const newCollection = await db.transaction(async (tx) => {
      const receiptNo = await generateNextReceiptNo(year, undefined, tenantAdminId, tx);
      const created = (
        await tx
          .insert(collections)
          .values({
            receiptNo,
            billId: billId || null,
            clientId,
            collectionDate: parsedDate,
            amount: normalizedAmount,
            paymentMethod,
            referenceNo: referenceNo?.trim() || null,
            notes: notes?.trim() || null,
            receivedBy: userId,
            status: "completed"
          })
          .returning()
      )[0];

      if (billId) {
        // Atomic balance update — no read-modify-write, so concurrent receipts
        // can never lose an increment.
        await tx
          .update(bills)
          .set({
            paidAmount: sql`${bills.paidAmount} + ${normalizedAmount}`,
            dueAmount: sql`GREATEST(0, ${bills.grandTotal} - (${bills.paidAmount} + ${normalizedAmount}))`,
            status: sql`CASE WHEN GREATEST(0, ${bills.grandTotal} - (${bills.paidAmount} + ${normalizedAmount})) <= 0 THEN 'paid' ELSE 'partial' END`,
            updatedAt: new Date()
          })
          .where(eq(bills.id, billId));
      }

      return created;
    });

    broadcast(
      "billing.collection.received",
      collectionReceivedPayload({
        collectionId: newCollection.id,
        receiptNo: newCollection.receiptNo,
        billId: newCollection.billId,
        clientId: newCollection.clientId,
        tenantId: tenantAdminId,
        amount: newCollection.amount,
        paymentDate: newCollection.collectionDate,
        paymentMethod: newCollection.paymentMethod
      }),
      billingScope(tenantAdminId)
    );

    // Queue the receipt SMS — client-facing delivery (0.5–3 s per call)
    // happens on the `sms` worker; this request already has what it needs.
    const receiptClient = (
      await db
        .select({
          companyName: clients.companyName,
          mobile: clients.mobile,
          alternativeMobile: clients.alternativeMobile,
          createdBy: clients.createdBy
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1)
    )[0];
    const receiptPhone = normalizeBdMobile(receiptClient?.mobile) || normalizeBdMobile(receiptClient?.alternativeMobile);
    if (receiptPhone) {
      // Remaining balance: the just-updated bill when linked, else client-wide due.
      let remainingDue = 0;
      if (billId) {
        const updatedBill = (
          await db.select({ dueAmount: bills.dueAmount }).from(bills).where(eq(bills.id, billId)).limit(1)
        )[0];
        remainingDue = Number(updatedBill?.dueAmount ?? 0);
      } else {
        remainingDue = Number(await getClientRunningDue(clientId));
      }

      const receiptSmsTenantId = String(receiptClient?.createdBy ?? tenantAdminId ?? "");
      // Gate on the firm's per-event SMS toggle (payment receipt/collection).
      if (await isTenantSmsEventEnabled(receiptSmsTenantId, "collection_receipt")) {
        void enqueueTransactionalSms({
          tenantId: receiptSmsTenantId,
          templateKey: "collection_receipt",
          recipientPhone: receiptPhone,
          variables: {
            customer_name: receiptClient?.companyName || "",
            paid: Number(newCollection.amount),
            due: remainingDue,
            receipt_no: newCollection.receiptNo
          },
          referenceType: "collection",
          referenceId: String(newCollection.id),
          triggeredByUserId: userId ? String(userId) : undefined
        });
      }
    }

    return c.json(
      {
        message: `Payment receipt ${newCollection.receiptNo} created successfully`,
        data: newCollection
      },
      HttpStatusCodes.CREATED
    );
  } catch (err: unknown) {
    return c.json(
      { message: "Failed to record collection" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const cancelCollection = async (c: AppContext) => {
  try {
    const id = Number(c.req.param("id"));
    const col = await loadScopedCollection(c, id);

    if (!col) {
      return c.json({ message: "Collection not found" }, HttpStatusCodes.NOT_FOUND);
    }

    if (col.status === "cancelled") {
      return c.json({ message: `Receipt ${col.receiptNo} is already cancelled` }, HttpStatusCodes.CONFLICT);
    }

    // Cancel the receipt and revert the invoice balance atomically.
    await db.transaction(async (tx) => {
      await tx
        .update(collections)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(collections.id, id));

      if (col.billId) {
        await tx
          .update(bills)
          .set({
            paidAmount: sql`GREATEST(0, ${bills.paidAmount} - ${col.amount})`,
            dueAmount: sql`GREATEST(0, ${bills.grandTotal} - GREATEST(0, ${bills.paidAmount} - ${col.amount}))`,
            status: sql`CASE WHEN GREATEST(0, ${bills.paidAmount} - ${col.amount}) <= 0 THEN 'unpaid' ELSE 'partial' END`,
            updatedAt: new Date()
          })
          .where(eq(bills.id, col.billId));
      }
    });

    return c.json(
      { message: `Receipt ${col.receiptNo} cancelled successfully` },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json(
      { message: "Failed to cancel collection" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const getCollectionDetails = async (c: AppContext) => {
  try {
    const id = Number(c.req.param("id"));
    if (!id || isNaN(id)) {
      return c.json({ message: "Invalid collection ID" }, HttpStatusCodes.BAD_REQUEST);
    }

    // Tenant ownership guard (prevents cross-tenant IDOR)
    if (!(await loadScopedCollection(c, id))) {
      return c.json({ message: "Payment receipt not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const col = (
      await db
        .select({
          id: collections.id,
          receiptNo: collections.receiptNo,
          billId: collections.billId,
          billNo: bills.billNo,
          taxPeriod: bills.taxPeriod,
          billGrandTotal: bills.grandTotal,
          billPaidAmount: bills.paidAmount,
          billDueAmount: bills.dueAmount,
          clientId: collections.clientId,
          clientName: clients.companyName,
          clientProprietor: clients.proprietorName,
          clientBin: clients.binNumber,
          clientMobile: clients.mobile,
          clientAlternativeMobile: clients.alternativeMobile,
          clientEmail: clients.email,
          clientAddress: clients.address,
          collectionDate: collections.collectionDate,
          amount: collections.amount,
          paymentMethod: collections.paymentMethod,
          referenceNo: collections.referenceNo,
          notes: collections.notes,
          receivedById: collections.receivedBy,
          receivedByName: users.name,
          status: collections.status,
          createdAt: collections.createdAt,
          createdBy: clients.createdBy
        })
        .from(collections)
        .leftJoin(clients, eq(collections.clientId, clients.id))
        .leftJoin(bills, eq(collections.billId, bills.id))
        .leftJoin(users, eq(collections.receivedBy, users.id))
        .where(eq(collections.id, id))
        .limit(1)
    )[0];

    if (!col) {
      return c.json({ message: "Payment receipt not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Fetch overall client outstanding balance using numeric aggregation
    const clientBilledSum = await db
      .select({
        totalBilled: sql<number>`COALESCE(SUM(${bills.grandTotal}), 0)`
      })
      .from(bills)
      .where(and(eq(bills.clientId, col.clientId), ne(bills.status, "cancelled")));

    const clientCollectedSum = await db
      .select({
        totalCollected: sql<number>`COALESCE(SUM(${collections.amount}), 0)`
      })
      .from(collections)
      .where(and(eq(collections.clientId, col.clientId), eq(collections.status, "completed")));

    const totalBilled = r2(Number(clientBilledSum[0]?.totalBilled) || 0);
    const totalCollected = r2(Number(clientCollectedSum[0]?.totalCollected) || 0);
    const currentOutstandingDue = r2(Math.max(0, totalBilled - totalCollected));

    // Tenant-scoped company branding — resolved from the client owner's Firm
    // Settings only, with no cross-tenant fallback.
    let firmSetting: (typeof companySettings.$inferSelect) | null = null;
    try {
      if (col.createdBy) {
        firmSetting =
          (await db.query.companySettings.findFirst({
            where: eq(companySettings.adminId, col.createdBy)
          })) ?? null;
      }
    } catch (billErr: unknown) { console.warn("[Billing Warning]:", billErr instanceof Error ? billErr.message : billErr); }

    return c.json(
      {
        message: "Receipt details fetched successfully",
        data: {
          ...col,
          clientOutstandingDue: currentOutstandingDue,
          companySettings: firmSetting ? {
            companyName: firmSetting.companyName,
            proprietorName: firmSetting.proprietorName,
            phone: firmSetting.phone,
            email: firmSetting.email,
            website: firmSetting.website,
            address: firmSetting.address,
            binNumber: firmSetting.binNumber,
            tinNumber: firmSetting.tinNumber,
            tradeLicenseNo: firmSetting.tradeLicenseNo
          } : null
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json(
      { message: "Failed to fetch receipt details" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

