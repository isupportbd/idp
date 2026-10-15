import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { bills } from "@/modules/billing/database/models/bills.js";
import { collections } from "@/modules/billing/database/models/collections.js";
import { smsLogs } from "../database/models/sms_logs.js";
import { enqueueTransactionalSms } from "./sms-queue.service.js";
import { normalizeBdMobile } from "./sms.service.js";

export type DueReminderScanResult = {
  firmsScanned: number;
  candidates: number;
  dispatched: number;
};

const DUE_REMINDER_COOL_OFF_DAYS = 25;

function formatDueDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export async function runDueReminderScan(options?: { adminIds?: number[] }): Promise<DueReminderScanResult> {
  const result: DueReminderScanResult = { firmsScanned: 0, candidates: 0, dispatched: 0 };
  const inlineRuns: Promise<any>[] = [];

  const settingsRows = await db.select().from(companySettings);
  const allowedAdmins = options?.adminIds && options.adminIds.length > 0 ? new Set(options.adminIds) : null;

  for (const settings of settingsRows) {
    const tenantAdminId = settings.adminId;
    if (allowedAdmins && (!tenantAdminId || !allowedAdmins.has(tenantAdminId))) continue;
    if (!settings.autoDueReminder) continue;
    const days = Number(settings.dueReminderDays) || 7;
    const minAmount = Number(settings.dueReminderMinAmount) || 0;
    const smsKey = settings.smsApiKey || "";
    const smsSender = settings.smsSenderId || "";
    if (!smsKey || !smsSender) continue;

    // One firm's bad data must never abort the whole daily scan — isolate each
    // tenant so the others still get their reminders.
    try {
      // Scope clients: adminId null -> createdBy IS NULL
      const tenantScope = tenantAdminId ? eq(clients.createdBy, tenantAdminId) : isNull(clients.createdBy);

      // Preload recent SENT due_reminder phones in this tenant (cool-off guard)
      const recentSent = await db
        .select({ recipientMobile: smsLogs.recipientMobile })
        .from(smsLogs)
        .where(
          and(
            eq(smsLogs.templateKey, "due_reminder"),
            eq(smsLogs.status, "SENT"),
            tenantAdminId ? eq(smsLogs.adminId, tenantAdminId) : isNull(smsLogs.adminId),
            sql`${smsLogs.sentAt} >= NOW() - INTERVAL '${sql.raw(String(DUE_REMINDER_COOL_OFF_DAYS))} days'`
          )
        );
      const recentSet = new Set(recentSent.map((r) => r.recipientMobile));

      // Candidates: active tenant clients with >=1 non-cancelled bill whose latest
      // invoice is >= `days` old AND whose running due (the exact repo definition:
      // openingBalance + billed - completed collections) meets the threshold.
      const candidateRows = await db
        .select({
          clientId: clients.id,
          companyName: clients.companyName,
          mobile: clients.mobile,
          alternativeMobile: clients.alternativeMobile,
          totalDue: sql<string>`COALESCE(${clients.openingBalance}, 0)
            + COALESCE(SUM(${bills.subtotal} - ${bills.discountAmount}), 0)
            - COALESCE((SELECT SUM(${collections.amount}) FROM ${collections} WHERE ${collections.clientId} = ${clients.id} AND ${collections.status} = 'completed'), 0)`
        })
        .from(clients)
        .innerJoin(bills, eq(bills.clientId, clients.id))
        .where(and(tenantScope, eq(clients.isActive, true), sql`${bills.status} != 'cancelled'`))
        .groupBy(clients.id)
        .having(
          and(
            sql`CURRENT_DATE - MAX(${bills.billDate}::date) >= ${days}`,
            sql`COALESCE(${clients.openingBalance}, 0)
              + COALESCE(SUM(${bills.subtotal} - ${bills.discountAmount}), 0)
              - COALESCE((SELECT SUM(${collections.amount}) FROM ${collections} WHERE ${collections.clientId} = ${clients.id} AND ${collections.status} = 'completed'), 0) >= ${minAmount}`
          )
        );

      result.firmsScanned += 1;
      for (const c of candidateRows) {
        result.candidates += 1;
        const phone = normalizeBdMobile(c.mobile) || normalizeBdMobile(c.alternativeMobile);
        if (!phone) continue;
        if (recentSet.has(phone)) continue;

        const dueNum = Number(c.totalDue || 0);
        const today = formatDueDate(new Date());

        const outcome = await enqueueTransactionalSms({
          tenantId: String(tenantAdminId ?? ""),
          templateKey: "due_reminder",
          recipientPhone: phone,
          variables: {
            customer_name: c.companyName,
            date: today,
            due: dueNum,
            company_name: settings.companyName
          }
        });
        if (outcome.inline) inlineRuns.push(outcome.inline);
        result.dispatched += 1;
      }
    } catch (err: any) {
      console.warn(
        `[SMS] due-reminder scan skipped a firm (admin ${tenantAdminId ?? "global"}):`,
        err?.message || err
      );
    }
  }

  if (inlineRuns.length) await Promise.allSettled(inlineRuns);
  return result;
}
