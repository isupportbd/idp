import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { initDatabase } from "@/framework/database/connection.js";
import { db } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { clientManagers } from "@/modules/clients/database/models/client_managers.js";
import { vatSubmissions } from "@/modules/clients/database/models/vat_submissions.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { users } from "@/modules/auth/database/models/user.js";
import { deriveSubmitters, recordSubmission, listSubmissions } from "../controllers/submissions.controller.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { and, eq, sql } from "drizzle-orm";

describe("deriveSubmitters (Submitted By filter options)", () => {
  it("groups rows by submitter, counts them, and excludes pending (no submitter)", () => {
    const result = deriveSubmitters([
      { submittedById: 1, submittedByName: "Alice" },
      { submittedById: 2, submittedByName: "Bob" },
      { submittedById: 1, submittedByName: "Alice" },
      { submittedById: 2, submittedByName: "Bob" },
      { submittedById: 2, submittedByName: "Bob" },
      { submittedById: null, submittedByName: null },
      { submittedById: null, submittedByName: null }
    ]);

    expect(result).toEqual([
      { id: 1, name: "Alice", count: 2 },
      { id: 2, name: "Bob", count: 3 }
    ]);
  });

  it("sorts submitters alphabetically by name", () => {
    const result = deriveSubmitters([
      { submittedById: 5, submittedByName: "Zoe" },
      { submittedById: 3, submittedByName: "Adam" },
      { submittedById: 4, submittedByName: "Mia" }
    ]);

    expect(result.map((s) => s.name)).toEqual(["Adam", "Mia", "Zoe"]);
  });

  it("returns an empty list when no rows have been submitted (pending-only month)", () => {
    expect(
      deriveSubmitters([
        { submittedById: null, submittedByName: null },
        { submittedById: null, submittedByName: null }
      ])
    ).toEqual([]);
  });

  it("ignores rows missing a submitter name even when an id is present", () => {
    expect(deriveSubmitters([{ submittedById: 9, submittedByName: null }])).toEqual([]);
  });
});

describe("Submissions Module Real Database Tests (PostgreSQL)", () => {
  let testUserId: number;
  let activeClientId: number;
  let inactiveClientId: number;
  const testMonth = "2026-08";

  beforeAll(async () => {
    await initDatabase();

    // Tests only connect (`initDatabase`); the schema normally lands on app boot
    // via `syncDatabaseSchemaAndSuperAdmin()` / migration 0009. Ensure the audit
    // column exists before any `select()` expands the full model column set.
    await db.execute(sql`
      ALTER TABLE vat_submissions ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);

    // Ensure user
    const existingUser = (await db.select().from(users).limit(1))[0];
    if (existingUser) {
      testUserId = existingUser.id;
    } else {
      const u = (
        await db
          .insert(users)
          .values({
            name: "Submission Officer",
            email: `sub_officer_${Date.now()}@test.com`,
            password: "hashed_password"
          })
          .returning()
      )[0];
      testUserId = u.id;
    }

    // Create test active client
    const activeClient = (
      await db
        .insert(clients)
        .values({
          companyName: `Active Test Corp ${Date.now()}`,
          binNumber: `BIN-${Date.now()}`,
          isActive: true
        })
        .returning()
    )[0];
    activeClientId = activeClient.id;

    // Assign manager to active client
    await db.insert(clientManagers).values({
      clientId: activeClientId,
      managerId: testUserId
    });

    // Create test inactive client
    const inactiveClient = (
      await db
        .insert(clients)
        .values({
          companyName: `Inactive Test Corp ${Date.now()}`,
          binNumber: `INACT-BIN-${Date.now()}`,
          isActive: false
        })
        .returning()
    )[0];
    inactiveClientId = inactiveClient.id;
  });

  afterAll(async () => {
    // Cleanup
    if (activeClientId) {
      await db.delete(clients).where(eq(clients.id, activeClientId));
    }
    if (inactiveClientId) {
      await db.delete(clients).where(eq(clients.id, inactiveClientId));
    }
  });

  it("should record on-time return submission and link client manager in PostgreSQL", async () => {
    const submissionId = `NBR-${Date.now()}`;
    const onTimeDate = new Date("2026-09-14T10:00:00Z"); // Before Sept 15

    const created = (
      await db
        .insert(vatSubmissions)
        .values({
          clientId: activeClientId,
          taxPeriod: testMonth,
          submissionId,
          status: "submitted",
          submittedBy: testUserId,
          submittedAt: onTimeDate,
          remarks: "Successfully submitted via eVAT"
        })
        .returning()
    )[0];

    expect(created).toBeDefined();
    expect(created.clientId).toBe(activeClientId);
    expect(created.taxPeriod).toBe(testMonth);
    expect(created.submissionId).toBe(submissionId);
    expect(created.status).toBe("submitted");
    expect(created.submittedBy).toBe(testUserId);
  });

  it("should fetch submission record directly from PostgreSQL with relations", async () => {
    const record = (
      await db
        .select()
        .from(vatSubmissions)
        .where(
          and(
            eq(vatSubmissions.clientId, activeClientId),
            eq(vatSubmissions.taxPeriod, testMonth)
          )
        )
        .limit(1)
    )[0];

    expect(record).toBeDefined();
    expect(record.clientId).toBe(activeClientId);
    expect(record.status).toBe("submitted");
  });

  it("should record late submission when date is past 15th of next month", async () => {
    const lateTaxMonth = "2026-07";
    const lateSubmissionId = `NBR-LATE-${Date.now()}`;
    const lateDate = new Date("2026-08-20T10:00:00Z"); // After Aug 15

    const created = (
      await db
        .insert(vatSubmissions)
        .values({
          clientId: activeClientId,
          taxPeriod: lateTaxMonth,
          submissionId: lateSubmissionId,
          status: "late_submitted",
          submittedBy: testUserId,
          submittedAt: lateDate,
          remarks: "Delayed client voucher filing"
        })
        .returning()
    )[0];

    expect(created.status).toBe("late_submitted");
  });

  it("should delete submission record and return client status to pending", async () => {
    await db
      .delete(vatSubmissions)
      .where(
        and(
          eq(vatSubmissions.clientId, activeClientId),
          eq(vatSubmissions.taxPeriod, testMonth)
        )
      );

    const remaining = (
      await db
        .select()
        .from(vatSubmissions)
        .where(
          and(
            eq(vatSubmissions.clientId, activeClientId),
            eq(vatSubmissions.taxPeriod, testMonth)
          )
        )
        .limit(1)
    )[0];

    expect(remaining).toBeUndefined();
  });
});

describe("recordSubmission: submittedBy stays immutable, editor audited in updated_by", () => {
  const taxPeriod = "2026-12";
  const stamp = Date.now();
  const filerName = `Filer ${stamp}`;
  const editorName = `Editor ${stamp}`;

  // Minimal Hono context double: `recordSubmission` / `listSubmissions` only
  // need `c.get("auth")`, `c.req.valid(...)` and `c.json(...)`.
  const makeCtx = (opts: { auth?: any; json?: any; query?: any }): any => ({
    get: (key: string) => (key === "auth" || key === "user" ? opts.auth : undefined),
    req: {
      valid: (type: string) => {
        if (type === "json") return opts.json;
        if (type === "query") return opts.query;
        return undefined;
      }
    },
    json: (body: any, status: any) => ({ body, status })
  });

  // `Handler`'s Hono type declares a second `next` argument the runtime does
  // not require, so call it through an untyped indirection.
  const invoke = (handler: any, ctx: any) => handler(ctx);

  it("keeps the original filer on edit and records the editor in updated_by", async () => {
    let ownerId: number | null = null;
    let submitterId: number | null = null;
    let editorId: number | null = null;
    let clientId: number | null = null;
    let settingsId: number | null = null;

    try {
      await initDatabase();
      await db.execute(sql`
        ALTER TABLE vat_submissions ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      `);

      const mkUser = async (name: string, adminId: number | null) => {
        const [u] = await db
          .insert(users)
          .values({
            name,
            email: `${name.toLowerCase().replace(/\s+/g, "_")}_${stamp}@test.com`,
            password: "hashed_password",
            adminId
          })
          .returning();
        return u.id;
      };

      ownerId = await mkUser(`Owner ${stamp}`, null);
      submitterId = await mkUser(filerName, ownerId);
      editorId = await mkUser(editorName, ownerId);

      const [client] = await db
        .insert(clients)
        .values({
          companyName: `Attribution Corp ${stamp}`,
          binNumber: `ATTR-${stamp}`,
          isActive: true,
          createdBy: ownerId
        })
        .returning();
      clientId = client.id;

      await db.insert(clientManagers).values([
        { clientId, managerId: submitterId },
        { clientId, managerId: editorId }
      ]);

      // Firm Settings: VAT submission SMS off, so the controller never enqueues
      // a real gateway send while this test runs.
      const [settings] = await db
        .insert(companySettings)
        .values({
          adminId: ownerId,
          companyName: `Attribution Firm ${stamp}`,
          smsOnSubmission: false
        })
        .returning();
      settingsId = settings.id;

      // ── 1. Fresh filing recorded by the submitter ─────────────────────
      const createRes: any = await invoke(
        recordSubmission,
        makeCtx({
          auth: { id: submitterId },
          json: {
            clientId,
            taxPeriod,
            submissionId: "NBR-ORIG-001",
            submittedBy: submitterId,
            remarks: "original filing"
          }
        })
      );
      expect(createRes.body.message).toBe("Submission ID recorded successfully");

      const afterCreate = (await db.select().from(vatSubmissions).where(eq(vatSubmissions.clientId, clientId)))[0];
      expect(afterCreate).toBeDefined();
      expect(afterCreate.submittedBy).toBe(submitterId);
      expect(afterCreate.updatedBy).toBeNull();

      const createdList: any = await invoke(listSubmissions, makeCtx({ auth: { id: ownerId }, query: { month: taxPeriod } }));
      const createdRow = createdList.body.data.find((r: any) => r.id === clientId);
      expect(createdRow.isEdited).toBe(false);
      expect(createdRow.submittedById).toBe(submitterId);
      expect(createdRow.submittedByName).toBe(filerName);
      expect(createdRow.updatedById).toBeNull();
      expect(createdList.body.submitters).toEqual([{ id: submitterId, name: filerName, count: 1 }]);

      // ── 2. A different user edits the same record ─────────────────────
      const editRes: any = await invoke(
        recordSubmission,
        makeCtx({
          auth: { id: editorId },
          json: { clientId, taxPeriod, submissionId: "NBR-EDIT-999", remarks: "corrected by editor" }
        })
      );
      expect(editRes.body.message).toBe("Submission ID recorded successfully");

      const afterEdit = (await db.select().from(vatSubmissions).where(eq(vatSubmissions.clientId, clientId)))[0];
      expect(afterEdit.submissionId).toBe("NBR-EDIT-999");
      // Historical attribution must survive the edit:
      expect(afterEdit.submittedBy).toBe(submitterId);
      expect(afterEdit.updatedBy).toBe(editorId);

      const editedList: any = await invoke(listSubmissions, makeCtx({ auth: { id: ownerId }, query: { month: taxPeriod } }));
      const editedRow = editedList.body.data.find((r: any) => r.id === clientId);
      expect(editedRow.isEdited).toBe(true);
      expect(editedRow.submittedById).toBe(submitterId);
      expect(editedRow.submittedByName).toBe(filerName);
      expect(editedRow.updatedById).toBe(editorId);
      expect(editedRow.updatedByName).toBe(editorName);
      // Submitter counts stay keyed to the immutable filer, never the editor.
      expect(editedList.body.submitters).toEqual([{ id: submitterId, name: filerName, count: 1 }]);
      expect(editedList.body.submitters.some((s: any) => s.id === editorId)).toBe(false);
    } finally {
      if (clientId) await db.delete(vatSubmissions).where(eq(vatSubmissions.clientId, clientId));
      if (clientId) await db.delete(clientManagers).where(eq(clientManagers.clientId, clientId));
      if (settingsId) await db.delete(companySettings).where(eq(companySettings.id, settingsId));
      if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
      if (editorId) await db.delete(users).where(eq(users.id, editorId));
      if (submitterId) await db.delete(users).where(eq(users.id, submitterId));
      if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
    }
  });
});
