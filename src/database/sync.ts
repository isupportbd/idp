import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";

async function executeSingleSql(rawSql: string) {
  const clean = rawSql.trim();
  if (!clean) return;
  try {
    await db.execute(sql.raw(clean));
  } catch (err: any) {
    if (
      !err.message?.includes("already exists") &&
      !err.message?.includes("duplicate") &&
      !err.message?.includes("multiple primary keys")
    ) {
      console.warn(`[DB Schema Sync Warning]:`, err.message || err);
    }
  }
}

/**
 * Why: Financial columns were originally `double precision`, which drifts
 *      (binary floating point cannot represent most decimal money exactly).
 * When: On every boot, before routes are registered.
 * Where: Called from syncDatabaseSchemaAndSuperAdmin().
 * How: A single atomic, idempotent, fail-loud PL/pgSQL block that converts
 *      ONLY the enumerated money columns from `double precision` to
 *      `numeric(14, 2)`. Runs in one transaction (a DO block is one statement),
 *      so either every column converts or none do. The information_schema guard
 *      makes repeat boots a no-op.
 *
 * Deliberately NOT routed through executeSingleSql(): that helper swallows
 * errors. A failed money migration must be loud, not boot against a
 * half-migrated schema.
 *
 * Non-money columns (quantities, weights, conversion factors and percentages)
 * are intentionally excluded — see money-to-numeric-migration-review.md §3.
 */
async function migrateMoneyColumnsToNumeric() {
  const migrationSql = String.raw`
DO $mig$
DECLARE
  targets constant text[][] := ARRAY[
    ['bills','subtotal'],['bills','discount_amount'],['bills','previous_due'],
    ['bills','grand_total'],['bills','paid_amount'],['bills','due_amount'],
    ['bill_items','rate_used'],['bill_items','minimum_charge_used'],
    ['bill_items','calculated_amount'],['bill_items','final_amount'],
    ['collections','amount'],
    ['clients','opening_balance'],
    ['service_rates','regular_rate'],['service_rates','minimum_charge'],
    ['sales_rates','sales_rate'],['sales_rates','vatable_value'],
    ['purchases','ass_value'],['purchases','unit_value'],['purchases','cd'],
    ['purchases','rd'],['purchases','sd'],['purchases','base_value_of_vat'],
    ['purchases','vat'],['purchases','at'],
    ['plans','rate_monthly'],['plans','rate_yearly'],
    ['subscription_transactions','gateway_charge'],
    ['payment_settings','bkash_charge'],
    ['users','sms_balance']
  ];
  i int;
  cur_type text;
  bad int;
  migrated int := 0;
BEGIN
  -- Serialize concurrent boots (replicas / workers); released at COMMIT.
  PERFORM pg_advisory_xact_lock(hashtext('idp_money_to_numeric_v1'));

  -- Fail fast rather than stall boot on a contended ACCESS EXCLUSIVE lock.
  PERFORM set_config('lock_timeout', '10s', true);
  PERFORM set_config('statement_timeout', '300s', true);

  FOR i IN 1 .. array_length(targets, 1) LOOP
    SELECT c.data_type INTO cur_type
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = targets[i][1]
       AND c.column_name  = targets[i][2];

    IF cur_type IS NULL THEN
      RAISE NOTICE '[DB Sync] skip missing %.%', targets[i][1], targets[i][2];
      CONTINUE;
    END IF;

    IF cur_type <> 'double precision' THEN
      CONTINUE;                       -- already numeric -> idempotent no-op
    END IF;

    -- Guard: values PostgreSQL cannot represent as numeric(14,2)
    -- (NaN / +/-Infinity / anything >= 1e12).
    EXECUTE format(
      $q$ SELECT count(*) FROM public.%I
             WHERE %I::text IN ('NaN','Infinity','-Infinity') OR abs(%I) >= 1e12 $q$,
      targets[i][1], targets[i][2], targets[i][2]
    ) INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION '[DB Sync] %.% has % unrepresentable value(s); aborting numeric migration',
        targets[i][1], targets[i][2], bad;
    END IF;

    -- Existing defaults (0, 1.8, ...) are re-cast by PostgreSQL automatically.
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(14,2) USING %I::numeric(14,2)',
      targets[i][1], targets[i][2], targets[i][2]
    );

    migrated := migrated + 1;
    RAISE NOTICE '[DB Sync] migrated %.% -> numeric(14,2)', targets[i][1], targets[i][2];
  END LOOP;

  RAISE NOTICE '[DB Sync] money columns migrated this boot: %', migrated;
END
$mig$;`;

  try {
    await db.execute(sql.raw(migrationSql));
  } catch (err: any) {
    // Do NOT swallow: a failed money migration must be visible.
    console.error("[DB Sync] MONEY MIGRATION FAILED:", err.message || err);
    throw err;
  }
}

export async function syncDatabaseSchemaAndSuperAdmin() {
  console.log("[DB Sync] Starting clean schema and SuperAdmin synchronization...");

  // 1. Run all base SQL migrations safely (idempotent execution across fresh and existing databases)
  try {
    const migrationsDir = path.resolve(process.cwd(), "src/database/migrations/postgresql");
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
      console.log(`[DB Sync] Checking and applying ${files.length} migration file(s)...`);
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, "utf-8");
        const statements = sqlContent.split("--> statement-breakpoint");
        for (const stmt of statements) {
          await executeSingleSql(stmt);
        }
      }
    }
  } catch (mErr) {
    console.warn("[DB Sync Migration Warning]", mErr);
  }

  // 2. Comprehensive Idempotent Schema Guards (Guarantees full model sync regardless of migration state)
  try {
    // Ensure Roles table and system roles
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await executeSingleSql(
      `INSERT INTO roles (name) VALUES ('superadmin'), ('admin'), ('user') ON CONFLICT (name) DO NOTHING`
    );

    // Auto-clean stale column mapping entries
    await executeSingleSql(`DELETE FROM column_mappings WHERE db_column IN ('client_name', 'clientName') OR label = 'client_name'`);
    // Default column mappings are seeded via `bun maker module:seed superadmin`
    // (src/modules/superadmin/database/seeders/column_mappings.ts), not on every boot.

    // Ensure all plan columns exist
    await executeSingleSql(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_clients INTEGER NOT NULL DEFAULT 50`);
    await executeSingleSql(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_storage_mb INTEGER NOT NULL DEFAULT 1024`);
    await executeSingleSql(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_accounts BOOLEAN NOT NULL DEFAULT false`);

    // Ensure users table has all modern columns
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(20)`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_id INTEGER`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trx_id VARCHAR(100)`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_amount INTEGER DEFAULT 0`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS advance_balance INTEGER DEFAULT 0`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_balance DOUBLE PRECISION DEFAULT 0`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSON DEFAULT '[]'::json`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS exp_date TIMESTAMP`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_storage_mb INTEGER NOT NULL DEFAULT 0`);

    // Ensure tenant admin_id columns exist on firm tables
    await executeSingleSql(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await executeSingleSql(`ALTER TABLE expense_heads ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS admin_id INTEGER`);

    // Drop global unique constraints on expense_heads for multi-tenant support
    await executeSingleSql(`ALTER TABLE expense_heads DROP CONSTRAINT IF EXISTS "expense_heads_name_unique"`);
    await executeSingleSql(`ALTER TABLE expense_heads DROP CONSTRAINT IF EXISTS "expense_heads_code_unique"`);

    // Ensure company_settings has all SMS and modern configuration columns
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_api_key TEXT`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_sender_id VARCHAR(50) DEFAULT ''`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_provider VARCHAR(100) DEFAULT ''`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_endpoint_url TEXT DEFAULT ''`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_messaging_enabled BOOLEAN NOT NULL DEFAULT true`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_prefix VARCHAR(20) DEFAULT 'RCP'`);

    // Copy legacy sender_id to sms_sender_id if it exists
    await executeSingleSql(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_settings' AND column_name='sender_id') THEN
          UPDATE company_settings SET sms_sender_id = sender_id WHERE (sms_sender_id IS NULL OR sms_sender_id = '') AND sender_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // Ensure SMS tables exist
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS sms_templates (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key VARCHAR(64) NOT NULL,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        body TEXT NOT NULL,
        variables JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        recipient_mobile VARCHAR(32) NOT NULL,
        message TEXT NOT NULL,
        template_key VARCHAR(64),
        submission_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'SENT',
        provider_response TEXT,
        sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Ensure high-performance composite & tenant indexes exist
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS purchases_admin_month_idx ON purchases (admin_id, month)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS purchases_client_month_idx ON purchases (client_id, month)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS purchases_client_be_date_idx ON purchases (client_id, be_date)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sales_rates_lookup_idx ON sales_rates (client_id, item_id, status, activation_date)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS company_settings_admin_id_idx ON company_settings (admin_id)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS users_admin_id_idx ON users (admin_id)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_templates_admin_key_idx ON sms_templates (admin_id, key)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_templates_key_idx ON sms_templates (key)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_admin_date_idx ON sms_logs (admin_id, sent_at)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_admin_id_idx ON sms_logs (admin_id)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_sent_at_idx ON sms_logs (sent_at)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_status_idx ON sms_logs (status)`);
  } catch (rErr) {
    console.warn("[DB Roles/Schema Warning]", rErr);
  }

  // 2b. Convert financial double-precision columns to exact numeric (atomic,
  // idempotent, fail-loud). Must run before routes are served. Intentionally
  // NOT wrapped in a try/catch so a failed migration aborts boot visibly.
  await migrateMoneyColumnsToNumeric();

  // 3. Dynamic SuperAdmin Account Setup from .env (Only SuperAdmin account, NO demo data)
  try {
    const superadminEmail = (process.env.SUPERADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const superadminPassword = process.env.SUPERADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    const superadminName = process.env.SUPERADMIN_NAME || process.env.ADMIN_NAME || "Super Admin";

    if (superadminEmail && superadminPassword) {
      let [superadminRole] = await db.select().from(roles).where(eq(roles.name, "superadmin")).limit(1);
      if (!superadminRole) {
        try {
          const [createdRole] = await db.insert(roles).values({ name: "superadmin" }).returning();
          superadminRole = createdRole;
        } catch {
          const [existingRole] = await db.select().from(roles).where(eq(roles.name, "superadmin")).limit(1);
          superadminRole = existingRole;
        }
      }

      const hashedPassword = await bcrypt.hash(superadminPassword, 10);
      const existingAdmin = await db.select().from(users).where(sql`lower(${users.email}) = ${superadminEmail}`).limit(1);

      if (existingAdmin.length > 0) {
        console.log(`[SuperAdmin Sync] Updating credentials for ${superadminEmail} from .env...`);
        await db.update(users).set({
          name: superadminName,
          email: superadminEmail,
          password: hashedPassword,
          roleId: superadminRole?.id || existingAdmin[0].roleId,
          status: "active",
          emailVerifiedAt: new Date(),
          updatedAt: new Date()
        }).where(eq(users.id, existingAdmin[0].id));
      } else {
        console.log(`[SuperAdmin Sync] Creating SuperAdmin account for ${superadminEmail} from .env...`);
        await db.insert(users).values({
          name: superadminName,
          email: superadminEmail,
          password: hashedPassword,
          roleId: superadminRole?.id,
          status: "active",
          emailVerifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      console.log(`[SuperAdmin Sync] SuperAdmin account ready & synced: ${superadminEmail}`);
    } else {
      console.warn("[SuperAdmin Sync] No SUPERADMIN_EMAIL / ADMIN_EMAIL configured in environment.");
    }
  } catch (adminErr) {
    console.error("[SuperAdmin Sync Error]", adminErr);
  }

  console.log("[DB Sync] Clean schema synchronization finished (Zero demo data).");
}
