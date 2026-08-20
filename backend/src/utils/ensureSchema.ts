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
];

export const runSchemaPatches = async (sequelize: Sequelize): Promise<void> => {
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
