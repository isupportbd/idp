import { sql } from "drizzle-orm";
import { db } from "@/framework/facade.js";

/**
 * Why: The payouts tables are now canonically defined in Drizzle migrations (0010_tidy_lila_cheney.sql).
 * This function serves as a lightweight no-op / safety ping for legacy test suites.
 */
export async function ensurePayoutTables(): Promise<void> {
  // Payouts schema is guaranteed by migration 0010.
  // Running a fast verification ping to avoid unnecessary DDL execution during boot and test runs.
  try {
    await db.execute(sql`SELECT 1 FROM payouts LIMIT 1`);
  } catch (err: any) {
    // If running on a fresh isolated test DB without migration 0010 applied yet, we gracefully warn
    console.warn("[ensurePayoutTables]: Note - payouts table verification ping", err?.message || err);
  }
}
