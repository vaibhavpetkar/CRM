import { Sequelize, QueryTypes } from 'sequelize';

// WHY THIS FILE EXISTS: server.ts only runs `sequelize.sync({ alter: true })`
// when NODE_ENV === 'development' (by design — auto-altering a live
// production schema on every deploy is genuinely risky: Sequelize's `alter`
// can drop/recreate columns in edge cases). But the production Docker image
// hardcodes NODE_ENV=production (see Dockerfile), so every model change
// shipped to prod was silently never applied — which is exactly what caused
// "column Meeting.meetLink does not exist" in production.
//
// This runs unconditionally, in every environment, right before sync. Each
// patch is a plain idempotent SQL statement (IF NOT EXISTS / additive only —
// never drops or alters existing columns), so re-running this on every
// single boot is always safe and a no-op once already applied. This is a
// deliberately minimal substitute for a real migration tool (e.g. Umzug) —
// fine for the additive changes this app has made so far, but if this list
// grows large or ever needs a genuinely destructive/renaming change, switch
// to real tracked migrations instead of adding to this list forever.
const SCHEMA_PATCHES: { name: string; sql: string }[] = [
  {
    name: 'meetings.meetLink',
    sql: `ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "meetLink" VARCHAR(500);`,
  },
  {
    name: 'expenses table',
    sql: `
      CREATE TABLE IF NOT EXISTS "expenses" (
        "id" SERIAL PRIMARY KEY,
        "category" VARCHAR(100) NOT NULL,
        "description" VARCHAR(500) NOT NULL,
        "amount" DECIMAL(15,2) NOT NULL,
        "expenseDate" DATE NOT NULL DEFAULT CURRENT_DATE,
        "paymentMethod" VARCHAR(20) NOT NULL DEFAULT 'bank_transfer',
        "vendor" VARCHAR(255),
        "notes" TEXT,
        "recordedById" INTEGER REFERENCES "users"("id"),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: 'expenses indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS "expenses_expense_date" ON "expenses" ("expenseDate");
      CREATE INDEX IF NOT EXISTS "expenses_category" ON "expenses" ("category");
    `,
  },
  {
    name: 'google_meet_connection table',
    sql: `
      CREATE TABLE IF NOT EXISTS "google_meet_connection" (
        "id" SERIAL PRIMARY KEY,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "tokenExpiresAt" TIMESTAMPTZ,
        "isEnabled" BOOLEAN NOT NULL DEFAULT false,
        "connectedById" INTEGER REFERENCES "users"("id"),
        "connectedAt" TIMESTAMPTZ,
        "lastSyncAt" TIMESTAMPTZ,
        "lastError" VARCHAR(500),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: 'google_business_connection table',
    sql: `
      CREATE TABLE IF NOT EXISTS "google_business_connection" (
        "id" SERIAL PRIMARY KEY,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "tokenExpiresAt" TIMESTAMPTZ,
        "isEnabled" BOOLEAN NOT NULL DEFAULT false,
        "connectedById" INTEGER REFERENCES "users"("id"),
        "connectedAt" TIMESTAMPTZ,
        "lastSyncAt" TIMESTAMPTZ,
        "lastError" VARCHAR(500),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: 'document_templates table',
    sql: `
      CREATE TABLE IF NOT EXISTS "document_templates" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL,
        "docType" VARCHAR(30) NOT NULL,
        "subject" VARCHAR(500) NOT NULL DEFAULT '',
        "htmlBody" TEXT NOT NULL DEFAULT '',
        "isDefault" BOOLEAN NOT NULL DEFAULT false,
        "createdById" INTEGER REFERENCES "users"("id"),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: 'document_templates index',
    sql: `CREATE INDEX IF NOT EXISTS "document_templates_doc_type" ON "document_templates" ("docType");`,
  },
  {
    // Document templates can now be print formats as well as emails; every
    // template that existed before this was an email template.
    name: 'document_templates.purpose',
    sql: `ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "purpose" VARCHAR(20) NOT NULL DEFAULT 'email';`,
  },
  {
    // Saved design of a print format made in the drag-and-drop builder.
    name: 'document_templates.layout',
    sql: `ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "layout" TEXT;`,
  },
  {
    // The sales forecast reads this to place won deals in the month they
    // actually closed; the Deal model now stamps it on every stage change.
    name: 'deals.actualCloseDate',
    sql: `ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "actualCloseDate" TIMESTAMPTZ;`,
  },
  {
    // Invoices now carry quotation-style commercials (line items live in the
    // invoice_products / invoice_taxes tables, which sync creates).
    name: 'invoices commercials',
    sql: `
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "discountType" VARCHAR(20) NOT NULL DEFAULT 'percentage';
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "shippingCharges" DECIMAL(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "taxTotal" DECIMAL(15,2) NOT NULL DEFAULT 0;
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "terms" TEXT;
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
      ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "notes" TEXT;
    `,
  },
  {
    // Real-estate buyer requirement on leads: searched and filtered on the
    // Leads page (area, 1 BHK / 2 BHK, budget).
    name: 'leads real-estate requirement',
    sql: `
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "propertyType" VARCHAR(50);
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "configuration" VARCHAR(30);
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferredLocation" VARCHAR(255);
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "projectName" VARCHAR(255);
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "budgetMin" DECIMAL(15,2);
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "budgetMax" DECIMAL(15,2);
    `,
  },
  {
    // Sub source: the campaign / form / project / listing a lead came from,
    // filled in automatically by the lead integrations.
    name: 'leads.subSource',
    sql: `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "subSource" VARCHAR(255);`,
  },
  {
    // Remark written with the current Next Follow-up (older ones are rows in
    // lead_follow_ups, which sync creates).
    name: 'leads.followUpRemark',
    sql: `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "followUpRemark" TEXT;`,
  },
  {
    // The latest call note on each lead (every note is a row in lead_notes,
    // which sync creates), so the Leads page can filter by it quickly.
    name: 'leads last note',
    sql: `
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastNoteDate" DATE;
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastNoteStatus" VARCHAR(40);
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastNoteText" TEXT;
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastNoteBy" VARCHAR(100);
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastNoteUserId" INTEGER;
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "notesCount" INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS "leads_company_last_note" ON "leads" ("companyId", "lastNoteDate");
    `,
  },
  {
    // Incoming calls (a customer calling the company's Vi / Exotel number)
    // are logged next to click-to-call ones.
    name: 'calls.direction',
    sql: `ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "direction" VARCHAR(10) NOT NULL DEFAULT 'outbound';`,
  },
  {
    // Large lead books (30,000+ leads): every create and import checks for a
    // duplicate by mobile or email, the Leads page filters by assignee and
    // status, and reports and the activity log read by date. Without these,
    // each of those is a full scan of the company's rows.
    name: 'lead scale indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS "leads_company_mobile" ON "leads" ("companyId", "mobile");
      CREATE INDEX IF NOT EXISTS "leads_company_email" ON "leads" ("companyId", "email");
      CREATE INDEX IF NOT EXISTS "leads_company_assigned_status" ON "leads" ("companyId", "assignedToId", "status");
      CREATE INDEX IF NOT EXISTS "leads_company_created" ON "leads" ("companyId", "createdAt" DESC);
      CREATE INDEX IF NOT EXISTS "activity_logs_company_created" ON "activity_logs" ("companyId", "createdAt" DESC);
      CREATE INDEX IF NOT EXISTS "calls_company_created" ON "calls" ("companyId", "createdAt" DESC);
    `,
  },
  {
    // When the team was last reminded about a Not Interested lead (weekly).
    name: 'leads.reengageRemindedAt',
    sql: `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "reengageRemindedAt" TIMESTAMPTZ;`,
  },
  {
    // One lead event goes to the whole team as one row per person, sharing a
    // groupKey: when anyone reads it, it is read for everyone.
    name: 'notifications.groupKey',
    sql: `
      ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "groupKey" VARCHAR(64);
      CREATE INDEX IF NOT EXISTS "notifications_group_key" ON "notifications" ("groupKey");
      CREATE INDEX IF NOT EXISTS "notifications_user_read" ON "notifications" ("userId", "isRead", "createdAt" DESC);
    `,
  },
  {
    // Channel partner (broker) who brought the lead: typed on the lead form,
    // suggested from earlier leads, filtered on and counted on the dashboard.
    name: 'leads.channelPartner',
    sql: `
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "channelPartner" VARCHAR(255);
      CREATE INDEX IF NOT EXISTS "leads_company_channel_partner" ON "leads" ("companyId", LOWER("channelPartner"));
    `,
  },
];

export const runSchemaPatches = async (sequelize: Sequelize): Promise<void> => {
  // On a brand-new, empty database none of the tables these patches touch
  // exist yet, so every patch would fail and log a scary stack trace. Nothing
  // needs patching there anyway: the sync that runs right after creates every
  // table from the current models, new columns included.
  const [{ exists }] = await sequelize.query<{ exists: boolean }>(
    `SELECT to_regclass('public.users') IS NOT NULL AS "exists";`,
    { type: QueryTypes.SELECT }
  );
  if (!exists) {
    console.log('[schema-patch] Fresh database, skipping patches (sync will create the schema).');
    return;
  }

  for (const patch of SCHEMA_PATCHES) {
    try {
      await sequelize.query(patch.sql, { type: QueryTypes.RAW });
    } catch (err) {
      // Logged but not fatal — each statement is IF NOT EXISTS/additive, so
      // a failure here means something unexpected about this environment's
      // schema, not a normal "already applied" case. Surface it loudly so
      // it doesn't get missed, but don't crash the whole server over one
      // patch (other patches / sync may still succeed).
      console.error(`[schema-patch] Failed to apply "${patch.name}":`, err);
    }
  }
};

/**
 * One-time data changes, recorded in "data_migrations" so each runs once per
 * database. Used to hand new permissions to the roles that already did the
 * same thing under an older permission (see PERMISSION_GRANTS). Runs after
 * sync and role seeding, across every company.
 */
export const runPermissionGrants = async (
  sequelize: Sequelize,
  grants: { name: string; ifHas: string; grant: string[] }[]
): Promise<void> => {
  try {
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS "data_migrations" ("name" VARCHAR(100) PRIMARY KEY, "ranAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
      { type: QueryTypes.RAW }
    );
    const done = new Set(
      (await sequelize.query<{ name: string }>(`SELECT "name" FROM "data_migrations";`, { type: QueryTypes.SELECT })).map((r) => r.name)
    );
    for (const g of grants) {
      if (done.has(g.name)) continue;
      await sequelize.transaction(async (transaction) => {
        const roles = await sequelize.query<{ id: number; permissions: string }>(`SELECT "id", "permissions" FROM "roles";`, {
          type: QueryTypes.SELECT,
          transaction,
        });
        let changed = 0;
        for (const role of roles) {
          let perms: string[] = [];
          try {
            perms = JSON.parse(role.permissions || '[]');
          } catch {
            continue;
          }
          if (!Array.isArray(perms) || perms.includes('*') || !perms.includes(g.ifHas)) continue;
          const next = [...perms, ...g.grant.filter((p) => !perms.includes(p))];
          if (next.length === perms.length) continue;
          await sequelize.query(`UPDATE "roles" SET "permissions" = :perms WHERE "id" = :id;`, {
            replacements: { perms: JSON.stringify(next), id: role.id },
            transaction,
          });
          changed += 1;
        }
        await sequelize.query(`INSERT INTO "data_migrations" ("name") VALUES (:name) ON CONFLICT DO NOTHING;`, {
          replacements: { name: g.name },
          transaction,
        });
        console.log(`[data-migration] ${g.name}: updated ${changed} role(s).`);
      });
    }
  } catch (err) {
    console.error('[data-migration] Permission grants failed:', err);
  }
};
