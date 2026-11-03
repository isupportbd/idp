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
  } catch (mErr: any) {
    console.error("[DB Sync Migration Error]: Critical failure during SQL migration replay", mErr);
    throw mErr;
  }

  // 2. Canonical Seed Guards (System Roles & Column Mappings)
  try {
    // Ensure System Roles exist
    await executeSingleSql(
      `INSERT INTO roles (name) VALUES ('superadmin'), ('admin'), ('user') ON CONFLICT (name) DO NOTHING`
    );

    // Schema parity guard: ensure company_settings has sender_id column for legacy backup compatibility
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sender_id VARCHAR(50) DEFAULT ''`);

    // Clean stale legacy column mapping entries if present
    await executeSingleSql(`DELETE FROM column_mappings WHERE db_column IN ('client_name', 'clientName') OR label = 'client_name'`);
  } catch (rErr: any) {
    console.warn("[DB Roles/Seed Warning]:", rErr?.message || rErr);
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
