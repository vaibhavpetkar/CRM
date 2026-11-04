import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

// Small key/value store for settings that exist at three levels:
//   global  - set by the super admin, the default for every company
//   company - set by a company admin, the default for that company's users
//   user    - a user's own choice
// The effective value is user over company over global (merged key by key
// for object values). Kept as its own table with explicit scope ids instead
// of a tenant model, because a global row belongs to no company.

export type PreferenceScope = 'global' | 'company' | 'user';

let ready: Promise<void> | null = null;
const ensureTable = () => {
  if (!ready) {
    ready = sequelize
      .query(`
        CREATE TABLE IF NOT EXISTS "app_preferences" (
          "id" SERIAL PRIMARY KEY,
          "scope" VARCHAR(10) NOT NULL,
          "scopeId" INTEGER NOT NULL DEFAULT 0,
          "key" VARCHAR(60) NOT NULL,
          "value" JSONB NOT NULL,
          "updatedById" INTEGER,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "app_preferences_scope_key" ON "app_preferences" ("scope", "scopeId", "key");
      `)
      .then(() => undefined)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
};

const scopeIdFor = (scope: PreferenceScope, user: { id: number; companyId?: number | null }) =>
  scope === 'global' ? 0 : scope === 'company' ? Number(user.companyId) || 0 : user.id;

/** The stored value at each level for this user (null where none is set). */
export const getPreferenceLevels = async (key: string, user: { id: number; companyId?: number | null }) => {
  await ensureTable();
  const rows = await sequelize.query<{ scope: PreferenceScope; value: unknown }>(
    `SELECT "scope", "value" FROM "app_preferences"
      WHERE "key" = :key AND (
        ("scope" = 'global' AND "scopeId" = 0) OR
        ("scope" = 'company' AND "scopeId" = :companyId) OR
        ("scope" = 'user' AND "scopeId" = :userId)
      )`,
    { replacements: { key, companyId: Number(user.companyId) || 0, userId: user.id }, type: QueryTypes.SELECT }
  );
  const levels: Record<PreferenceScope, unknown> = { global: null, company: null, user: null };
  for (const r of rows) levels[r.scope] = r.value;
  return levels;
};

export const setPreference = async (
  scope: PreferenceScope,
  key: string,
  value: unknown,
  user: { id: number; companyId?: number | null }
) => {
  await ensureTable();
  await sequelize.query(
    `INSERT INTO "app_preferences" ("scope", "scopeId", "key", "value", "updatedById")
     VALUES (:scope, :scopeId, :key, CAST(:value AS JSONB), :userId)
     ON CONFLICT ("scope", "scopeId", "key")
     DO UPDATE SET "value" = EXCLUDED."value", "updatedById" = EXCLUDED."updatedById", "updatedAt" = NOW()`,
    { replacements: { scope, scopeId: scopeIdFor(scope, user), key, value: JSON.stringify(value), userId: user.id } }
  );
};

export const clearPreference = async (scope: PreferenceScope, key: string, user: { id: number; companyId?: number | null }) => {
  await ensureTable();
  await sequelize.query(`DELETE FROM "app_preferences" WHERE "scope" = :scope AND "scopeId" = :scopeId AND "key" = :key`, {
    replacements: { scope, scopeId: scopeIdFor(scope, user), key },
  });
};
