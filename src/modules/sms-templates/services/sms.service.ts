import { db } from "@/framework/facade.js";
import { eq, and, isNull, or } from "drizzle-orm";
import { smsTemplates, type SmsTemplateVariable } from "../database/models/sms_templates.js";
import { smsLogs } from "../database/models/sms_logs.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";

import { fetchProviderBalance } from "@/framework/sms/index.js";
import { broadcast } from "@/framework/realtime/broadcast.js";

const BULKSMSBD_ENDPOINT = "http://bulksmsbd.net/api/smsapi";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Transactional SMS event keys (one template row per key in `sms_templates`). */
export type TransactionalSmsTemplateKey = "bill_notification" | "collection_receipt" | "vat_submission" | "mushak_submission" | "due_reminder";

/**
 * Why: One stable wire format for every transactional SMS so controllers only
 *      hand the queue a plain, JSON-serializable payload (no Hono context).
 * When: A bill is generated, a receipt is recorded, a return is submitted...
 * Where: `sms` queue job `sms.transactional.send` (jobs/transactional-sms.ts).
 */
export interface SendTransactionalSmsPayload {
  tenantId: string;
  templateKey: TransactionalSmsTemplateKey;
  recipientPhone: string;
  variables: Record<string, string | number | null | undefined>;
  referenceType?: "invoice" | "collection" | "submission";
  referenceId?: string;
  triggeredByUserId?: string;
}

export type TransactionalSmsResult = {
  ok: boolean;
  status: "SENT" | "FAILED";
  /** Raw (truncated) gateway response, or a friendly failure reason. */
  response: string;
  /** The rendered message — exactly what is/was sent or attempted. */
  message: string;
  /** True when a retry can plausibly succeed (transient failure only). */
  retryable: boolean;
};

/** Gateway codes that will never succeed on a retry — fail fast, no backoff burn. */
const PERMANENT_GATEWAY_CODES = new Set([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1011]);

export const DEFAULT_TEMPLATES = [
  {
    key: "vat_submission",
    name: "VAT Return Submission",
    description: null,
    body: "আপনার প্রতিষ্ঠানের {{tax_period}} কর মেয়াদের ভ্যাট রিটার্ণ অনলাইনে দাখিল করা হয়েছে। সাবমিশন আইডি: {{submission_id}}।\n\n- {{sender_role}}, {{company_name}}",
    variables: [
      { name: "customer_name", label: "Client Name", sample: "M/S. A. S. A ENTERPRISE", description: "Client Company Name" },
      { name: "tax_period", label: "Tax Period", sample: "July 2026", description: "Tax Period Month & Year" },
      { name: "submission_id", label: "Submission ID", sample: "VAT-2026-000123", description: "NBR e-VAT Submission Number" },
      { name: "bin_number", label: "BIN Number", sample: "001320903-0701", description: "Client 13 or 9-digit BIN" },
      { name: "sender_role", label: "Sender Role", sample: "Admin", description: "Admin / Consultant Role" },
      { name: "company_name", label: "Firm Name", sample: "One Associate", description: "VAT Consultant Firm Name" }
    ] as SmsTemplateVariable[]
  },
  {
    key: "mushak_submission",
    name: "Mushak 4.3 Submission",
    description: null,
    body: "আপনার প্রতিষ্ঠানের বিপরীতে {{boe_date}} তারিখে আনিত {{item_name}} এর মূল্য ঘোষণা (মূসক ৪.৩) দাখিল করা হয়েছে। সাবমিশন আইডি: {{submission_id}}।\n\n- {{sender_role}}, {{company_name}}",
    variables: [
      { name: "customer_name", label: "Client Name", sample: "M/S. ANKUR ENTERPRISE", description: "Client Company Name" },
      { name: "boe_date", label: "B/E Date", sample: "12 July 2026", description: "Bill of Entry Date" },
      { name: "item_name", label: "Item Name", sample: "Iron Plate", description: "Imported Item Name" },
      { name: "submission_id", label: "Submission ID", sample: "M43-2026-000456", description: "Mushak 4.3 Submission Number" },
      { name: "sender_role", label: "Sender Role", sample: "Admin", description: "Admin / Consultant Role" },
      { name: "company_name", label: "Firm Name", sample: "One Associate", description: "VAT Consultant Firm Name" }
    ] as SmsTemplateVariable[]
  },
  {
    key: "bill_notification",
    name: "Monthly Bill",
    description: null,
    body: "প্রিয় {{customer_name}}, {{month}} মাসের ভ্যাট কনসালট্যান্সি ফি বাবদ বিল {{current_bill}} টাকা। মোট বকেয়া {{grand_total}} টাকা।\n\n- {{company_name}}",
    variables: [
      { name: "customer_name", label: "Client Name", sample: "M/S. HASAN ENTERPRISE", description: "Client Company Name" },
      { name: "month", label: "Bill Month", sample: "July-2026", description: "Billing Month & Year" },
      { name: "current_bill", label: "Current Bill", sample: "1500", description: "Current Month Bill Amount" },
      { name: "due", label: "Previous Due", sample: "500", description: "Previous Unpaid Balance" },
      { name: "grand_total", label: "Grand Total", sample: "2000", description: "Total Payable Balance" },
      { name: "company_name", label: "Firm Name", sample: "One Associate", description: "VAT Consultant Firm Name" }
    ] as SmsTemplateVariable[]
  },
  {
    key: "collection_receipt",
    name: "Payment Receipt",
    description: null,
    body: "প্রিয় {{customer_name}}, আপনার নিকট হতে {{paid}} টাকা ফি বাবদ গ্রহণ করা হয়েছে। বর্তমান অবশিষ্ট বকেয়া {{due}} টাকা। ধন্যবাদ।\n\n- {{company_name}}",
    variables: [
      { name: "customer_name", label: "Client Name", sample: "M/S. HASAN ENTERPRISE", description: "Client Company Name" },
      { name: "paid", label: "Paid Amount", sample: "1500", description: "Collected / Received Amount" },
      { name: "due", label: "Remaining Due", sample: "0", description: "Due Balance after Payment" },
      { name: "receipt_no", label: "Receipt No", sample: "MR-2026-00001", description: "Money Receipt Number" },
      { name: "company_name", label: "Firm Name", sample: "One Associate", description: "VAT Consultant Firm Name" }
    ] as SmsTemplateVariable[]
  },
  {
    key: "due_reminder",
    name: "Due Reminder",
    description: null,
    body: "প্রিয় {{customer_name}}, অদ্য {{date}} তারিখ পর্যন্ত আপনার সর্বমোট বকেয়া {{due}} টাকা। বকেয়া পরিশোধের জন্য অনুরোধ করা হলো।\n\n- {{company_name}}",
    variables: [
      { name: "customer_name", label: "Client Name", sample: "ABC Traders", description: "Client Company Name" },
      { name: "date", label: "Date", sample: "10/08/2026", description: "Current Date" },
      { name: "due", label: "Due Amount", sample: "3500", description: "Total Outstanding Due" },
      { name: "company_name", label: "Firm Name", sample: "One Associate", description: "VAT Consultant Firm Name" }
    ] as SmsTemplateVariable[]
  }
];

export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>
): string {
  if (!body) return "";
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function normalizeBdMobile(rawMobile: string | null | undefined): string | null {
  if (!rawMobile) return null;
  const digits = rawMobile.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("880") && digits.length === 13) return digits;
  if (digits.startsWith("01") && digits.length === 11) return `88${digits}`;
  if (digits.length === 10 && digits.startsWith("1")) return `880${digits}`;
  if (digits.length >= 11 && digits.length <= 14) return digits;
  return null;
}

export async function resolveSenderRoleLabel(userId: number | null | undefined): Promise<string> {
  if (!userId) return "অ্যাডমিন";
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { role: true }
    });
    const roleName = (user as any)?.role?.name;
    if (roleName === "admin" || roleName === "superadmin") return "অ্যাডমিন";
    if (roleName === "manager") return "ম্যানেজার";
    return "এক্সিকিউটিভ";
  } catch {
    return "অ্যাডমিন";
  }
}

export async function getEffectiveTemplate(key: string, adminId?: number | null) {
  try {
    // Always use the global master template (adminId = null).
    // Admins do not have tenant-specific templates per design.
    const globalTpl = await db.query.smsTemplates.findFirst({
      where: and(eq(smsTemplates.key, key), isNull(smsTemplates.adminId), eq(smsTemplates.isActive, true))
    });
    if (globalTpl) return globalTpl;

    // Fallback to built-in default
    return DEFAULT_TEMPLATES.find((t) => t.key === key) || null;
  } catch {
    return DEFAULT_TEMPLATES.find((t) => t.key === key) || null;
  }
}

export async function callSmsGateway(opts: {
  apiKey: string;
  senderId: string;
  number: string;
  message: string;
  endpointUrl?: string;
  provider?: string;
}): Promise<{ ok: boolean; raw: string; code: number | null; networkError: boolean }> {
  try {
    const endpoint = opts.endpointUrl || BULKSMSBD_ENDPOINT;
    const isBulkSmsBd = endpoint.includes("bulksmsbd");

    const params = new URLSearchParams({
      api_key: opts.apiKey.trim(),
      type: "text",
      number: opts.number.trim(),
      message: opts.message
    });
    
    if (isBulkSmsBd) {
      params.append("senderid", opts.senderId.trim());
    } else {
      params.append("senderid", opts.senderId.trim()); // Greenweb/others often use senderid too
    }

    const res = await fetch(`${endpoint}?${params.toString()}`, { method: "GET" });
    const text = await res.text();
    let ok = res.ok;
    let friendly = text;
    let code: number | null = null;

    try {
      const j = JSON.parse(text);
      if (typeof j?.response_code === "number") {
        code = j.response_code;
        ok = j.response_code === 202;
        const errMap: Record<number, string> = {
          1001: "Invalid Number",
          1002: "Sender ID not correct / disabled",
          1003: "Required fields missing",
          1004: "Balance validity expired",
          1005: "Sender ID not registered/approved on BulkSMSBD.",
          1006: "Balance insufficient",
          1007: "Number is blocked",
          1011: "User ID not found"
        };
        if (!ok && errMap[code]) friendly = `[${code}] ${errMap[code]}`;
      }
    } catch {}

    return { ok, raw: friendly.slice(0, 500), code, networkError: false };
  } catch (e: any) {
    return { ok: false, raw: `Network error: ${e?.message || String(e)}`, code: null, networkError: true };
  }
}

export const callBulkSmsBd = callSmsGateway;

/**
 * Why: SMS templates show a human month label ("July-2026") while the app
 *      stores tax periods as `YYYY-MM`.
 * When: Building `month`-style variables for bill/reminder templates.
 * Where: Shared next to the other template helpers.
 * How: Formats strict `YYYY-MM`; passes anything else through unchanged.
 */
export function formatPeriodLabel(taxPeriod: string | null | undefined): string {
  const raw = String(taxPeriod || "");
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return raw;
  return `${MONTH_NAMES[monthIndex]}-${m[1]}`;
}

/**
 * Why: ONE delivery core shared by every trigger (bill / collection /
 *      submission / future reminders) — template rendering, gateway settings,
 *      sms_logs auditing, and balance sync exist in exactly one place.
 * When: The `sms.transactional.send` worker runs, or an inline fallback fires.
 * Where: sms queue job → this function (HTTP never calls it directly).
 * How: Settings → render → recipient guard → gateway → audit log → balance
 *      sync. Never throws; every exit is typed. `retryable` separates
 *      transient failures (network, unknown gateway errors — BullMQ retries
 *      with backoff) from permanent ones (bad number, no config, insufficient
 *      balance — fail fast instead of burning retries).
 */
export async function sendTransactionalSms(payload: SendTransactionalSmsPayload): Promise<TransactionalSmsResult> {
  const templateKey = payload.templateKey;
  const adminIdNum = Number(payload.tenantId);
  const adminId = Number.isFinite(adminIdNum) && adminIdNum > 0 ? adminIdNum : null;
  const sentByNum = Number(payload.triggeredByUserId);
  const sentBy = payload.triggeredByUserId && Number.isFinite(sentByNum) ? sentByNum : null;

  // 1. Gateway settings for the owning tenant (global row when ownerless —
  //    same convention sendTestSms already uses).
  let smsApiKey = "";
  let senderId = "";
  let companyName = "IDP System";
  let settings: any = null;
  try {
    settings = await db.query.companySettings.findFirst({
      where: adminId ? eq(companySettings.adminId, adminId) : isNull(companySettings.adminId)
    });
    if (settings) {
      smsApiKey = settings.smsApiKey || "";
      senderId = settings.smsSenderId || "";
      companyName = settings.companyName || companyName;
    }
  } catch {}

  // 2. Effective template (DB override → built-in default) + variables.
  const tpl = await getEffectiveTemplate(templateKey, adminId);
  const rawBody = tpl?.body || DEFAULT_TEMPLATES.find((t) => t.key === templateKey)?.body || "";
  const senderRole = rawBody.includes("{{sender_role}}") ? await resolveSenderRoleLabel(sentBy) : undefined;

  const renderedMessage = renderTemplate(rawBody, {
    ...payload.variables,
    sender_role: payload.variables.sender_role ?? senderRole,
    company_name: payload.variables.company_name ?? companyName
  });

  // 3. Recipient — identical BD-normalization rules as the old inline flow.
  const recipient = normalizeBdMobile(payload.recipientPhone);
  if (!recipient) {
    await db
      .insert(smsLogs)
      .values({
        adminId,
        recipientMobile: payload.recipientPhone || "NO_MOBILE",
        message: renderedMessage,
        templateKey,
        submissionId: payload.referenceType === "submission" ? payload.referenceId || null : null,
        status: "FAILED",
        providerResponse: "No valid Bangladesh mobile number found for client",
        sentBy
      })
      .catch(() => {});
    return { ok: false, status: "FAILED", response: "No valid mobile number", message: renderedMessage, retryable: false };
  }

  // 4. Gateway not configured → audit + fail fast (a retry cannot help).
  if (!smsApiKey || !senderId) {
    await db
      .insert(smsLogs)
      .values({
        adminId,
        recipientMobile: recipient,
        message: renderedMessage,
        templateKey,
        submissionId: payload.referenceType === "submission" ? payload.referenceId || null : null,
        status: "FAILED",
        providerResponse: "SMS Gateway API Key or Sender ID not configured in Firm Settings",
        sentBy
      })
      .catch(() => {});
    return { ok: false, status: "FAILED", response: "SMS Gateway not configured", message: renderedMessage, retryable: false };
  }

  // 5. Deliver via the provider gateway (0.5–3 s — exactly why this runs on
  //    the worker, never inside an HTTP request).
  const result = await callSmsGateway({
    apiKey: smsApiKey,
    senderId,
    number: recipient,
    message: renderedMessage,
    endpointUrl: settings?.smsEndpointUrl || undefined,
    provider: settings?.smsProvider || undefined
  });

  const finalStatus = result.ok ? "SENT" : "FAILED";
  await db
    .insert(smsLogs)
    .values({
      adminId,
      recipientMobile: recipient,
      message: renderedMessage,
      templateKey,
      submissionId: payload.referenceType === "submission" ? payload.referenceId || null : null,
      status: finalStatus,
      providerResponse: result.raw,
      sentBy
    })
    .catch(() => {});

  // 6. Sync live provider balance after a successful send (header badge stays true).
  if (result.ok && adminId && smsApiKey) {
    try {
      const liveBalance = await fetchProviderBalance(smsApiKey);
      if (liveBalance !== null) {
        await db.update(users).set({ smsBalance: liveBalance, updatedAt: new Date() }).where(eq(users.id, adminId));
        broadcast(
          "tenant:sms-updated",
          {
            adminId,
            smsBalance: liveBalance,
            timestamp: Date.now()
          },
          { tenant: adminId }
        );
      }
    } catch (balErr) {
      console.warn("[SMS Service] Failed to sync provider balance after SMS dispatch:", balErr);
    }
  }

  const retryable = !result.ok && (result.networkError || result.code === null || !PERMANENT_GATEWAY_CODES.has(result.code));
  return { ok: result.ok, status: finalStatus, response: result.raw, message: renderedMessage, retryable };
}

/**
 * Why: Builds the exact payload for a submission SMS. Shared by the HTTP
 *      controller (which enqueues it) and `sendVatSubmissionSms` (the
 *      synchronous back-compat wrapper) so the recipient fallback rules —
 *      primary mobile, then alternative, then raw primary for the audit row —
 *      live in ONE place and can never drift.
 */
export function buildVatSubmissionSmsPayload(params: {
  clientName: string;
  clientMobile?: string | null;
  clientAltMobile?: string | null;
  clientBin?: string | null;
  taxPeriod: string;
  submissionId: string;
  adminId: number;
  sentByUserId?: number | null;
}): SendTransactionalSmsPayload {
  return {
    tenantId: String(params.adminId),
    templateKey: "vat_submission",
    recipientPhone:
      normalizeBdMobile(params.clientMobile) ||
      normalizeBdMobile(params.clientAltMobile) ||
      params.clientMobile ||
      "",
    variables: {
      customer_name: params.clientName,
      tax_period: params.taxPeriod,
      submission_id: params.submissionId,
      bin_number: params.clientBin || ""
    },
    referenceType: "submission",
    referenceId: params.submissionId,
    triggeredByUserId: params.sentByUserId != null ? String(params.sentByUserId) : undefined
  };
}

/**
 * Why: Back-compatible synchronous entry point for any caller that still wants
 *      the old inline send. New code should instead do
 *      `enqueueTransactionalSms(buildVatSubmissionSmsPayload(...))`.
 * Returns: The same `{ ok, status, response, message }` shape as before.
 */
export async function sendVatSubmissionSms(params: {
  clientName: string;
  clientMobile?: string | null;
  clientAltMobile?: string | null;
  clientBin?: string | null;
  taxPeriod: string;
  submissionId: string;
  adminId: number;
  sentByUserId?: number | null;
}): Promise<{ ok: boolean; status: string; response: string; message: string }> {
  const result = await sendTransactionalSms(buildVatSubmissionSmsPayload(params));
  return { ok: result.ok, status: result.status, response: result.response, message: result.message };
}
