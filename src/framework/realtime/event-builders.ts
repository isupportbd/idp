import type { BroadcastOptions } from "@/framework/realtime/broadcast.js";

/** Roles entitled to billing/collection realtime events. */
export const BILLING_ROLES = ["admin", "accountant"] as const;

/**
 * Why: One place for the billing tenant+role scope so no broadcast drifts into
 *      leaking across tenants or missing a role.
 * When: Emitting billing/collection events.
 */
export function billingScope(tenantId: string | number | null | undefined): BroadcastOptions {
  return { tenant: tenantId ?? null, roles: [...BILLING_ROLES] };
}

export type InvoiceEventInput = {
  billId?: number | string | null;
  billNo?: string | null;
  clientId?: number | string | null;
  tenantId?: number | string | null;
  taxPeriod?: string | null;
  grandTotal?: number | null;
  dueAmount?: number | null;
  paidAmount?: number | null;
  status?: string | null;
  batch?: boolean;
};

type WithTimestamp<T> = T & { type: string; timestamp: number };

export function invoiceCreatedPayload(p: InvoiceEventInput): WithTimestamp<InvoiceEventInput> {
  return { type: "invoice.created", timestamp: Date.now(), ...p };
}

export function invoiceUpdatedPayload(p: InvoiceEventInput): WithTimestamp<InvoiceEventInput> {
  return { type: "invoice.updated", timestamp: Date.now(), ...p };
}

export function invoiceVoidedPayload(p: InvoiceEventInput): WithTimestamp<InvoiceEventInput> {
  return { type: "invoice.voided", timestamp: Date.now(), ...p };
}

export type CollectionEventInput = {
  collectionId?: number | string | null;
  receiptNo?: string | null;
  billId?: number | string | null;
  clientId?: number | string | null;
  tenantId?: number | string | null;
  amount?: number | null;
  paymentDate?: string | Date | null;
  paymentMethod?: string | null;
  bankAccountId?: number | string | null;
  notes?: string | null;
};

export function collectionReceivedPayload(p: CollectionEventInput): WithTimestamp<CollectionEventInput> {
  return { type: "collection.received", timestamp: Date.now(), ...p };
}
