import type { AppContext } from "@/framework/facade.js";
import { and, asc, desc, eq, ilike, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { bills } from "../database/models/bills.js";
import { billItems } from "../database/models/bill_items.js";
import { collections } from "../database/models/collections.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { clientManagers } from "@/modules/clients/database/models/client_managers.js";
import { users } from "@/modules/auth/database/models/user.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { loadScopedBill, r2, resolvePaymentInfo } from "./billing.helpers.js";

// ── 3. LIST INVOICES / BILLS ─────────────────────────────────────────

export const listBills = async (c: AppContext) => {
  try {
    const query = c.req.valid("query");
    const month = query.month || query.taxPeriod;
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    let conditions: SQL[] = [];
    if (!isSuperAdmin && tenantAdminId) {
      conditions.push(eq(clients.createdBy, tenantAdminId));
    }
    if (month && month !== "all") {
      conditions.push(eq(bills.taxPeriod, month));
    }
    if (query.clientId && query.clientId !== "all") {
      conditions.push(eq(bills.clientId, Number(query.clientId)));
    }
    if (query.status && query.status !== "all") {
      conditions.push(eq(bills.status, query.status));
    }

    if (query.customerTypeId && query.customerTypeId !== "all") {
      conditions.push(eq(clients.customerTypeId, Number(query.customerTypeId)));
    }
    if (query.referenceId && query.referenceId !== "all") {
      conditions.push(eq(clients.referenceId, Number(query.referenceId)));
    }
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      const searchCond = or(
        ilike(bills.billNo, term),
        ilike(clients.companyName, term),
        ilike(clients.binNumber, term),
        ilike(clientReferences.name, term),
        ilike(bills.notes, term)
      );
      if (searchCond) conditions.push(searchCond);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const page = query.page ? Number(query.page) : undefined;
    const limit = query.limit ? Number(query.limit) : undefined;
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Fast SQL summary statistics across all matching records
    const [statsResult] = await db
      .select({
        totalInvoicesCount: sql<number>`count(*)::int`,
        totalBilledAmount: sql<number>`coalesce(sum(${bills.subtotal} - ${bills.discountAmount}), 0)::float`,
        totalPaidAmount: sql<number>`coalesce(sum(${bills.paidAmount}), 0)::float`,
        totalDueAmount: sql<number>`coalesce(sum(${bills.dueAmount}), 0)::float`,
        paidCount: sql<number>`coalesce(sum(case when ${bills.status} = 'paid' then 1 else 0 end), 0)::int`,
        unpaidCount: sql<number>`coalesce(sum(case when ${bills.status} = 'unpaid' then 1 else 0 end), 0)::int`,
        partialCount: sql<number>`coalesce(sum(case when ${bills.status} = 'partial' then 1 else 0 end), 0)::int`
      })
      .from(bills)
      .leftJoin(clients, eq(bills.clientId, clients.id))
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .where(whereClause);

    let billsQuery = db
      .select({
        id: bills.id,
        billNo: bills.billNo,
        clientId: bills.clientId,
        clientName: clients.companyName,
        clientBin: clients.binNumber,
        clientMobile: clients.mobile,
        clientAlternativeMobile: clients.alternativeMobile,
        customerTypeId: clients.customerTypeId,
        customerTypeName: customerTypes.typeName,
        referenceId: clients.referenceId,
        referenceName: clientReferences.name,
        taxPeriod: bills.taxPeriod,
        billDate: bills.billDate,
        dueDate: bills.dueDate,
        subtotal: bills.subtotal,
        discountAmount: bills.discountAmount,
        previousDue: bills.previousDue,
        grandTotal: bills.grandTotal,
        paidAmount: bills.paidAmount,
        dueAmount: bills.dueAmount,
        status: bills.status,
        notes: bills.notes,
        createdById: bills.createdBy,
        createdByName: users.name,
        createdAt: bills.createdAt
      })
      .from(bills)
      .leftJoin(clients, eq(bills.clientId, clients.id))
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .leftJoin(users, eq(bills.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(bills.id));

    const rows = limit
      ? await billsQuery.limit(limit).offset(offset || 0)
      : await billsQuery;

    // Fetch line items ONLY for the paginated bills
    const billIds = rows.map((r) => r.id);
    let itemsMap: Record<number, (typeof billItems.$inferSelect)[]> = {};
    if (billIds.length > 0) {
      const allItems = await db
        .select()
        .from(billItems)
        .where(inArray(billItems.billId, billIds));

      for (const it of allItems) {
        if (!itemsMap[it.billId]) itemsMap[it.billId] = [];
        itemsMap[it.billId].push(it);
      }
    }

    const list = rows.map((r) => ({
      ...r,
      items: itemsMap[r.id] || []
    }));

    const totalCount = statsResult?.totalInvoicesCount || 0;
    const stats = {
      totalInvoicesCount: totalCount,
      totalBilledAmount: r2(statsResult?.totalBilledAmount || 0),
      totalPaidAmount: r2(statsResult?.totalPaidAmount || 0),
      totalDueAmount: r2(statsResult?.totalDueAmount || 0),
      paidCount: statsResult?.paidCount || 0,
      unpaidCount: statsResult?.unpaidCount || 0,
      partialCount: statsResult?.partialCount || 0
    };

    return c.json(
      {
        message: "Bills fetched successfully",
        data: list,
        stats,
        pagination: limit
          ? {
              total: totalCount,
              page: page || 1,
              limit,
              totalPages: Math.max(1, Math.ceil(totalCount / limit))
            }
          : undefined
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json(
      { message: "Failed to fetch bills" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 4. GET BILL DETAILS ──────────────────────────────────────────────

export const getBillDetails = async (c: AppContext) => {
  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ message: "Invalid bill ID" }, HttpStatusCodes.BAD_REQUEST);
    }

    // Tenant ownership guard (prevents cross-tenant IDOR)
    if (!(await loadScopedBill(c, id))) {
      return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const bill = (
      await db
        .select({
          id: bills.id,
          billNo: bills.billNo,
          clientId: bills.clientId,
          clientName: clients.companyName,
          clientProprietor: clients.proprietorName,
          clientBin: clients.binNumber,
          clientMobile: clients.mobile,
          clientAlternativeMobile: clients.alternativeMobile,
          clientEmail: clients.email,
          clientAddress: clients.address,
          clientOwner: clients.createdBy,
          customerTypeName: customerTypes.typeName,
          referenceName: clientReferences.name,
          taxPeriod: bills.taxPeriod,
          billDate: bills.billDate,
          dueDate: bills.dueDate,
          subtotal: bills.subtotal,
          discountAmount: bills.discountAmount,
          previousDue: bills.previousDue,
          grandTotal: bills.grandTotal,
          paidAmount: bills.paidAmount,
          dueAmount: bills.dueAmount,
          status: bills.status,
          notes: bills.notes,
          createdBy: bills.createdBy,
          createdAt: bills.createdAt
        })
        .from(bills)
        .leftJoin(clients, eq(bills.clientId, clients.id))
        .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
        .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
        .where(eq(bills.id, id))
        .limit(1)
    )[0];

    if (!bill) {
      return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const items = await db
      .select()
      .from(billItems)
      .where(eq(billItems.billId, id));

    const linkedCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.billId, id));

    // Fetch matching VAT return submission, if present
    const submission = (
      await db
        .select({ submissionId: vatSubmissions.submissionId, submittedAt: vatSubmissions.submittedAt })
        .from(vatSubmissions)
        .where(
          and(
            eq(vatSubmissions.clientId, bill.clientId),
            eq(vatSubmissions.taxPeriod, bill.taxPeriod)
          )
        )
        .limit(1)
    )[0];

    // Branding and payment channels both belong to the owning tenant (the
    // client's owner = tenant admin). Resolve them from that tenant's Firm
    // Settings ONLY — there is deliberately no cross-tenant or platform
    // fallback, so one firm's clients can never be shown another firm's (or the
    // superadmin's) account details.
    const tenantAdminId = bill.clientOwner ? Number(bill.clientOwner) : null;
    let firmSetting: (typeof companySettings.$inferSelect) | null = null;
    try {
      if (tenantAdminId) {
        firmSetting =
          (await db.query.companySettings.findFirst({
            where: eq(companySettings.adminId, tenantAdminId)
          })) ?? null;
      }
    } catch (err) {
      console.warn("Failed to query company settings for bill print branding:", err);
    }

    // Payment details for the printable invoice / WhatsApp notice, resolved for
    // the owning tenant (client owner) so clerks without FIRM_READERS still see it.
    const bankInfo = await resolvePaymentInfo(tenantAdminId);
    const paymentInfo = {
      bkashNumber: firmSetting?.bkashNumber?.trim() || bankInfo?.bkashNumber || null,
      nagadNumber: firmSetting?.nagadNumber?.trim() || bankInfo?.nagadNumber || null,
      rocketNumber: firmSetting?.rocketNumber?.trim() || null,
      bankName: bankInfo?.bankName || null,
      accountName: bankInfo?.accountName || null,
      accountNumber: bankInfo?.accountNumber || null,
      branchName: bankInfo?.branchName || null,
      routingNumber: bankInfo?.routingNumber || null
    };
    const { clientOwner: _clientOwner, ...billData } = bill;

    return c.json(
      {
        message: "Bill details fetched successfully",
        data: {
          ...billData,
          submissionId: submission?.submissionId || null,
          submittedAt: submission?.submittedAt || null,
          companySettings: firmSetting ? {
            companyName: firmSetting.companyName,
            proprietorName: firmSetting.proprietorName,
            phone: firmSetting.phone,
            email: firmSetting.email,
            website: firmSetting.website,
            address: firmSetting.address,
            binNumber: firmSetting.binNumber,
            tinNumber: firmSetting.tinNumber,
            tradeLicenseNo: firmSetting.tradeLicenseNo,
            invoiceTerms: firmSetting.invoiceTerms
          } : null,
          items,
          collections: linkedCollections,
          payment: paymentInfo
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json(
      { message: "Failed to fetch bill details" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 5. CLIENT BILLING OVERVIEW & AUTO-ITEMS HELPER ───────────────────