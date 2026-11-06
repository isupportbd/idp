import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import {
  billingScope,
  broadcast,
  db,
  HttpStatusCodes,
  handleControllerError,
  invoiceCreatedPayload,
  resolveTenantContext
} from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { formatPeriodLabel, isTenantSmsEventEnabled, normalizeBdMobile } from "@/modules/sms-templates/services/sms.service.js";
import { enqueueTransactionalSms } from "@/modules/sms-templates/services/sms-queue.service.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { billItems } from "../database/models/bill_items.js";
import { bills } from "../database/models/bills.js";
import { collections } from "../database/models/collections.js";
import { getClientRunningDue } from "../services/billing-balance.service.js";
import { generateNextBillNo } from "../services/billing-numbering.service.js";
import { clientBelongsToTenant, loadScopedBill, r2 } from "./billing.helpers.js";
import type { CreateBillInput, UpdateBillInput } from "./billing.schema.js";

export const createBill = async (c: AppContext) => {
  try {
    const payload = c.req.valid("json") as CreateBillInput;
    const { clientId, referenceId: payloadRefId, taxPeriod, billDate, dueDate, discountAmount, notes, items, status } = payload;

    // Tenant ownership guard — a sub-user/tenant must not bill another tenant's client.
    if (!(await clientBelongsToTenant(c, Number(clientId)))) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // 1. Verify Active Client
    const client = (
      await db
        .select({
          id: clients.id,
          companyName: clients.companyName,
          isActive: clients.isActive,
          referenceId: clients.referenceId,
          mobile: clients.mobile,
          alternativeMobile: clients.alternativeMobile,
          createdBy: clients.createdBy
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1)
    )[0];

    if (!client) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }
    if (!client.isActive) {
      return c.json({ message: "Cannot create bill for disabled/inactive client" }, HttpStatusCodes.BAD_REQUEST);
    }

    // 2. CRITICAL RULE: Verify finalized VAT Submission ID exists for this month
    const submission = (
      await db
        .select({ id: vatSubmissions.id, submissionId: vatSubmissions.submissionId })
        .from(vatSubmissions)
        .where(and(eq(vatSubmissions.clientId, clientId), eq(vatSubmissions.taxPeriod, taxPeriod)))
        .limit(1)
    )[0];

    if (!submission || !submission.submissionId || !submission.submissionId.trim()) {
      return c.json(
        {
          message: `Cannot create bill: No finalized VAT Return Submission ID found for ${taxPeriod}. Please record the submission ID first.`
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    // 3. Prevent duplicate bill for same client and taxPeriod
    const duplicate = (
      await db
        .select({ id: bills.id, billNo: bills.billNo })
        .from(bills)
        .where(and(eq(bills.clientId, clientId), eq(bills.taxPeriod, taxPeriod), sql`${bills.status} != 'cancelled'`))
        .limit(1)
    )[0];

    if (duplicate) {
      return c.json({ message: `Invoice ${duplicate.billNo} already exists for ${taxPeriod}` }, HttpStatusCodes.CONFLICT);
    }

    // 4. Calculate amounts
    const parsedBillDate = new Date(billDate);
    const year = parsedBillDate.getFullYear() || new Date().getFullYear();

    const subtotal = r2(items.reduce((acc, it) => acc + (it.finalAmount || 0), 0));
    const previousDue = await getClientRunningDue(clientId);
    const discount = r2(discountAmount || 0);
    const grandTotal = r2(Math.max(0, subtotal - discount + previousDue));
    const dueAmount = grandTotal;

    // 5+6. Generate the sequential bill number and insert the bill with its
    //      line items atomically. Two concurrent requests can read the same
    //      "latest" number, so the unique index on bill_no is the real guard —
    //      on a unique violation we regenerate and retry instead of returning a
    //      spurious 500.
    const auth = c.get("auth") || c.get("user");
    const { tenantAdminId: creatorId } = await resolveTenantContext(c);

    let newBill!: typeof bills.$inferSelect;
    for (let attempt = 0; ; attempt++) {
      try {
        newBill = await db.transaction(async (tx) => {
          const billNo = await generateNextBillNo(year, undefined, creatorId, tx);
          const created = (
            await tx
              .insert(bills)
              .values({
                billNo,
                clientId,
                referenceId: payloadRefId !== undefined && payloadRefId !== null ? payloadRefId : client.referenceId,
                taxPeriod,
                billDate: parsedBillDate,
                dueDate: dueDate ? new Date(dueDate) : null,
                subtotal,
                discountAmount: discount,
                previousDue,
                grandTotal,
                paidAmount: 0,
                dueAmount,
                status: status === "draft" ? "draft" : dueAmount <= 0 ? "paid" : "unpaid",
                createdBy: creatorId,
                notes: notes?.trim() || null
              })
              .returning()
          )[0];

          if (items.length > 0) {
            await tx.insert(billItems).values(
              items.map((it) => ({
                billId: created.id,
                serviceItemId: it.serviceItemId || null,
                itemName: it.itemName.trim(),
                unit: it.unit || "Month",
                qty: it.qty !== undefined && it.qty !== null ? Number(it.qty) : 1,
                rateUsed: it.rateUsed !== undefined && it.rateUsed !== null ? Number(it.rateUsed) : 0,
                minimumChargeUsed: it.minimumChargeUsed || 0,
                calculatedAmount: it.calculatedAmount || 0,
                finalAmount: it.finalAmount,
                notes: it.notes?.trim() || null
              }))
            );
          }

          return created;
        });
        break;
      } catch (insertErr: unknown) {
        const insertErrLike = insertErr as { code?: string; cause?: { code?: string }; message?: string };
        const code = insertErrLike?.code ?? insertErrLike?.cause?.code;
        const isDuplicateBillNo =
          code === "23505" ||
          code === "SQLITE_CONSTRAINT_UNIQUE" ||
          code === "ER_DUP_ENTRY" ||
          /duplicate key|unique constraint|UNIQUE constraint/i.test(String(insertErrLike?.message ?? ""));
        if (!isDuplicateBillNo || attempt >= 4) throw insertErr;
      }
    }

    const { tenantAdminId } = await resolveTenantContext(c);
    broadcast(
      "billing.invoice.updated",
      invoiceCreatedPayload({
        billId: newBill.id,
        billNo: newBill.billNo,
        clientId: newBill.clientId,
        tenantId: tenantAdminId,
        taxPeriod: newBill.taxPeriod,
        grandTotal: newBill.grandTotal,
        dueAmount: newBill.dueAmount,
        paidAmount: newBill.paidAmount,
        status: newBill.status
      }),
      billingScope(tenantAdminId)
    );

    // Queue the bill SMS — gateway delivery (0.5–3 s) happens on the `sms`
    // worker so this response is never held by the provider. Draft invoices are
    // excluded: they are not yet issued to the client.
    const billSmsPhone = normalizeBdMobile(client.mobile) || normalizeBdMobile(client.alternativeMobile);
    if (billSmsPhone && newBill.status !== "draft") {
      // Gate on the firm's per-event SMS toggle (bill/invoice notifications).
      const billSmsTenantId = String(client.createdBy ?? creatorId ?? "");
      if (await isTenantSmsEventEnabled(billSmsTenantId, "bill_notification")) {
        void enqueueTransactionalSms({
          tenantId: billSmsTenantId,
          templateKey: "bill_notification",
          recipientPhone: billSmsPhone,
          variables: {
            customer_name: client.companyName,
            month: formatPeriodLabel(taxPeriod),
            current_bill: r2(subtotal - discount),
            due: Number(previousDue),
            grand_total: Number(grandTotal)
          },
          referenceType: "invoice",
          referenceId: String(newBill.id),
          triggeredByUserId: auth?.id ? String(auth.id) : undefined
        });
      }
    }

    return c.json(
      {
        message: `Invoice ${newBill.billNo} created successfully`,
        data: newBill
      },
      HttpStatusCodes.CREATED
    );
  } catch (err: unknown) {
    return c.json({ message: "Failed to create bill" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 7. BATCH GENERATE BILLS ──────────────────────────────────────────

/**
 * Why: The batch runner is shared by the HTTP handler and the async queue worker
 *      so the billing math exists in exactly one place (no drift).
 */
async function resolveBatchActor(c: AppContext): Promise<{ creatorId: number | null; isSuperAdmin: boolean }> {
  const auth = c.get("auth") || c.get("user");
  const { tenantAdminId: creatorId } = await resolveTenantContext(c);
  let isSuperAdmin = false;

  if (auth?.id) {
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, Number(auth.id)),
      with: { role: true }
    });
    if (currentUser) {
      isSuperAdmin = currentUser.role?.name?.toLowerCase() === "superadmin" || auth.role === "superadmin";
    }
  }

  return { creatorId, isSuperAdmin };
}

export const updateBill = async (c: AppContext) => {
  try {
    const id = Number(c.req.param("id"));
    const payload = c.req.valid("json") as UpdateBillInput;

    const existing = await loadScopedBill(c, id);

    if (!existing) {
      return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updatedData: Partial<typeof bills.$inferInsert> = {
      updatedAt: new Date()
    };

    if (payload.billDate) updatedData.billDate = new Date(payload.billDate);
    if (payload.dueDate !== undefined) updatedData.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    if (payload.notes !== undefined) updatedData.notes = payload.notes;
    if (payload.status) updatedData.status = payload.status;

    const items = payload.items;
    const hasItems = Array.isArray(items) && items.length > 0;
    const discountTouched = payload.discountAmount !== undefined;

    // Recompute totals when EITHER items or discount change. Previously the whole
    // recalculation lived inside `if (items.length > 0)`, so a discount-only edit
    // was accepted by the API but silently discarded.
    if (hasItems || discountTouched) {
      const newSubtotal = hasItems ? r2(items.reduce((acc: number, it) => acc + (it.finalAmount || 0), 0)) : r2(existing.subtotal);
      const discount = discountTouched ? r2(payload.discountAmount ?? 0) : r2(existing.discountAmount);
      const grandTotal = r2(Math.max(0, newSubtotal - discount + existing.previousDue));
      const dueAmount = r2(Math.max(0, grandTotal - existing.paidAmount));

      updatedData.subtotal = newSubtotal;
      updatedData.discountAmount = discount;
      updatedData.grandTotal = grandTotal;
      updatedData.dueAmount = dueAmount;

      if (!payload.status) {
        if (dueAmount <= 0) updatedData.status = "paid";
        else if (existing.paidAmount > 0) updatedData.status = "partial";
        else updatedData.status = "unpaid";
      }
    }

    const result = await db.transaction(async (tx) => {
      if (hasItems) {
        // Replace items atomically with the bill update so a failure cannot
        // leave the invoice without its line items.
        await tx.delete(billItems).where(eq(billItems.billId, id));
        await tx.insert(billItems).values(
          items.map((it) => ({
            billId: id,
            serviceItemId: it.serviceItemId || null,
            itemName: it.itemName.trim(),
            unit: it.unit || "Month",
            qty: it.qty !== undefined && it.qty !== null ? Number(it.qty) : 1,
            rateUsed: it.rateUsed !== undefined && it.rateUsed !== null ? Number(it.rateUsed) : 0,
            minimumChargeUsed: it.minimumChargeUsed || 0,
            calculatedAmount: it.calculatedAmount || 0,
            finalAmount: it.finalAmount,
            notes: it.notes?.trim() || null
          }))
        );
      }

      return (await tx.update(bills).set(updatedData).where(eq(bills.id, id)).returning())[0];
    });

    return c.json({ message: `Invoice ${existing.billNo} updated successfully`, data: result }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to update bill" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const deleteBill = async (c: AppContext) => {
  try {
    const id = Number(c.req.param("id"));
    const existing = await loadScopedBill(c, id);

    if (!existing) {
      return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Preserve audit history: a bill that already has completed receipts must not
    // be deleted, otherwise the receipts are silently detached from their invoice.
    const linkedReceipts = (
      await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.billId, id), eq(collections.status, "completed")))
        .limit(1)
    )[0];

    if (linkedReceipts) {
      return c.json(
        { message: "Cannot delete an invoice that has recorded payment receipts. Cancel the receipts first." },
        HttpStatusCodes.CONFLICT
      );
    }

    // Remove line items and the bill atomically.
    await db.transaction(async (tx) => {
      await tx.delete(billItems).where(eq(billItems.billId, id));
      await tx.delete(bills).where(eq(bills.id, id));
    });

    return c.json({ message: `Invoice ${existing.billNo} deleted successfully` }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to delete bill" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
