import { sql } from "drizzle-orm";
import { db } from "@/framework/facade.js";

/**
 * Why: The payouts module ships three new tables that must exist on every
 *      environment (fresh DB, existing DB, and the test database) regardless of
 *      migration state. `sync.ts` runs this on boot; tests call it directly.
 * When: App boot (syncDatabaseSchemaAndSuperAdmin) and test bootstrap.
 * Where: Payouts module database layer.
 * How: Idempotent `CREATE TABLE IF NOT EXISTS` + indexes. Money columns are
 *      created directly as NUMERIC(14,2) so no double-precision migration is
 *      needed for these tables.
 */
export async function ensurePayoutTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_service_rates (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_item_id INTEGER NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
      rate NUMERIC(14,2) NOT NULL DEFAULT 0,
      effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      effective_to TIMESTAMP WITH TIME ZONE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payouts (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payout_type VARCHAR(20) NOT NULL DEFAULT 'staff',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      expense_head_id INTEGER REFERENCES expense_heads(id) ON DELETE SET NULL,
      bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
      period_month VARCHAR(20),
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH',
      account_info VARCHAR(255),
      reference_no VARCHAR(100),
      paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      notes TEXT,
      current_bill_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
      previous_due_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
      closing_due_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
      advance_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
      sms_status VARCHAR(16),
      sms_response TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_monthly_ledgers (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_month VARCHAR(20) NOT NULL,
      earned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      closing_due NUMERIC(14,2) NOT NULL DEFAULT 0,
      advance_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      is_settled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // Historical rate versioning: the legacy unique index on (user_id, service_item_id)
  // must go, otherwise only ONE version per item could ever be stored. Multiple rows
  // are now allowed as long as `effective_from` differs.
  await db.execute(sql`DROP INDEX IF EXISTS user_service_rates_user_item_idx`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_service_rates_user_item_effective_idx ON user_service_rates (user_id, service_item_id, effective_from)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS user_service_rates_admin_user_idx ON user_service_rates (admin_id, user_id)`);

  // Strict immutability: new columns on pre-existing databases.
  await db.execute(sql`ALTER TABLE user_service_rates ADD COLUMN IF NOT EXISTS effective_to TIMESTAMP WITH TIME ZONE`);
  await db.execute(sql`ALTER TABLE user_service_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);

  // Backfill for databases created before versioning existed: only the latest
  // version per (user, item) may remain active, and every superseded version gets
  // its exclusive `effective_to` set to the next version's start.
  await db.execute(sql`
    UPDATE user_service_rates r SET is_active = false
    WHERE r.is_active = true
      AND EXISTS (
        SELECT 1 FROM user_service_rates n
        WHERE n.user_id = r.user_id
          AND n.service_item_id = r.service_item_id
          AND (n.effective_from > r.effective_from
               OR (n.effective_from = r.effective_from AND n.id > r.id))
      )
  `);
  await db.execute(sql`
    UPDATE user_service_rates r SET effective_to = (
      SELECT MIN(n.effective_from) FROM user_service_rates n
      WHERE n.user_id = r.user_id
        AND n.service_item_id = r.service_item_id
        AND n.effective_from > r.effective_from
    )
    WHERE r.effective_to IS NULL
      AND EXISTS (
        SELECT 1 FROM user_service_rates n
        WHERE n.user_id = r.user_id
          AND n.service_item_id = r.service_item_id
          AND n.effective_from > r.effective_from
      )
  `);

  // At most one active (current) version per staff member + service item.
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_service_rates_user_item_active_idx ON user_service_rates (user_id, service_item_id) WHERE is_active`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payouts_admin_month_idx ON payouts (admin_id, period_month)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payouts_admin_user_idx ON payouts (admin_id, user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payouts_admin_type_idx ON payouts (admin_id, payout_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS payouts_paid_at_idx ON payouts (paid_at)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS user_monthly_ledgers_user_period_idx ON user_monthly_ledgers (user_id, period_month)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS user_monthly_ledgers_admin_period_idx ON user_monthly_ledgers (admin_id, period_month)`);
}
