import { Op, QueryTypes, Sequelize, col, where } from 'sequelize';
import Company from '../models/Company';
import logger from '../utils/logger';
import { runUnscoped } from './context';
import { TENANT_FIELD, TENANT_MODELS } from './scoping';
import { generateCompanyCode } from '../utils/companyCode';

/**
 * The company that owns everything created before multi-company support:
 * the Settings > Company record this install has always used (the oldest
 * tenant row), created as "My Company" on a brand-new install. It is the
 * platform owner's company, so it never expires.
 */
export const getDefaultCompanyId = async (): Promise<number> =>
  runUnscoped(async () => {
    const existing = await Company.findOne({
      where: { [Op.or]: [{ [TENANT_FIELD]: null }, where(col(TENANT_FIELD), Op.eq, col('id'))] } as any,
      order: [['id', 'ASC']],
      attributes: ['id'],
    });
    if (existing) return existing.id;
    const created = await Company.create({ name: 'My Company', currency: 'INR', isActive: true });
    await created.update({ [TENANT_FIELD]: created.id, plan: 'unlimited', subscriptionStatus: 'active' } as any);
    return created.id;
  });

// Columns that used to be unique across the whole database and are now
// unique per company, so every company numbers its own leads, quotes,
// invoices, items and roles from 1.
const PER_COMPANY_UNIQUE: [table: string, column: string][] = [
  ['leads', 'leadNumber'],
  ['quotes', 'quoteNumber'],
  ['invoices', 'invoiceNumber'],
  ['items', 'itemCode'],
  ['item_categories', 'code'],
  ['item_categories', 'name'],
  ['tax_masters', 'code'],
  ['roles', 'name'],
  ['sequences', 'key'],
  ['integrations', 'provider'],
];

const COMPANY_SUBSCRIPTION_COLUMNS = [
  `"plan" VARCHAR(30)`,
  `"subscriptionStatus" VARCHAR(20)`,
  `"trialEndsAt" TIMESTAMPTZ`,
  `"paidUntil" TIMESTAMPTZ`,
  `"maxUsers" INTEGER`,
  `"blockedAt" TIMESTAMPTZ`,
  `"blockedReason" VARCHAR(500)`,
  `"lastAlertKey" VARCHAR(100)`,
  `"code" VARCHAR(30)`,
];

const hasRun = async (sequelize: Sequelize, name: string) =>
  (
    await sequelize.query(`SELECT 1 FROM "app_migrations" WHERE "name" = :name`, {
      replacements: { name },
      type: QueryTypes.SELECT,
    })
  ).length > 0;

/** Moves every row with no company yet to the default company, once per marker. */
const backfillOnce = async (sequelize: Sequelize, marker: string, tables: string[]) => {
  if (await hasRun(sequelize, marker)) return;
  const companyId = await getDefaultCompanyId();
  await sequelize.transaction(async (transaction) => {
    for (const table of tables) {
      const [, result]: any = await sequelize.query(
        `UPDATE "${table}" SET "${TENANT_FIELD}" = :companyId WHERE "${TENANT_FIELD}" IS NULL;`,
        { replacements: { companyId }, transaction }
      );
      const moved = result?.rowCount ?? 0;
      if (moved) logger.info(`[tenancy] Moved ${moved} ${table} row(s) to company #${companyId}.`);
    }
    if (marker === 'multi-company-phase2') {
      // The original company is the platform owner's: no trial, no expiry.
      await sequelize.query(
        `UPDATE "companies" SET "plan" = COALESCE("plan", 'unlimited'), "subscriptionStatus" = COALESCE("subscriptionStatus", 'active') WHERE "id" = :companyId;`,
        { replacements: { companyId }, transaction }
      );
    }
    await sequelize.query(`INSERT INTO "app_migrations" ("name") VALUES (:name);`, {
      replacements: { name: marker },
      transaction,
    });
  });
  logger.info(`[tenancy] ${marker}: existing records now belong to company #${companyId}.`);
};

/** Swaps a column's database-wide unique constraint for a (companyId, column) one. */
const makeUniquePerCompany = async (sequelize: Sequelize, table: string, column: string) => {
  const singleColumnUniques: { name: string; isConstraint: boolean }[] = await sequelize.query(
    `SELECT i.relname AS name, (c.oid IS NOT NULL) AS "isConstraint"
       FROM pg_index x
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.indkey[0]
       LEFT JOIN pg_constraint c ON c.conindid = x.indexrelid
      WHERE t.relname = :table AND x.indisunique AND NOT x.indisprimary
        AND x.indnatts = 1 AND a.attname = :column`,
    { replacements: { table, column }, type: QueryTypes.SELECT }
  );
  for (const { name, isConstraint } of singleColumnUniques) {
    await sequelize.query(
      isConstraint ? `ALTER TABLE "${table}" DROP CONSTRAINT "${name}";` : `DROP INDEX IF EXISTS "${name}";`
    );
  }
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${table}_company_${column}_unique" ON "${table}" ("${TENANT_FIELD}", "${column}");`
  );
};

/**
 * Runs on every boot, after sequelize.sync(), and is safe to repeat:
 *  1. adds the companyId column + index to every company-owned table and
 *     the subscription columns to companies (production boots don't
 *     alter-sync, so new columns need this);
 *  2. once per database, moves every existing record under the default
 *     company, so the current team keeps seeing all its data unchanged;
 *  3. makes document numbers, codes and role names unique per company.
 */
export const runTenancyMigration = async (sequelize: Sequelize): Promise<void> => {
  const tables = TENANT_MODELS.map((model) => model.getTableName() as string);

  for (const table of tables) {
    await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${TENANT_FIELD}" INTEGER;`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "${table}_company_id" ON "${table}" ("${TENANT_FIELD}");`);
  }
  for (const column of COMPANY_SUBSCRIPTION_COLUMNS) {
    await sequelize.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS ${column};`);
  }

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "app_migrations" ("name" VARCHAR(100) PRIMARY KEY, "ranAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());`
  );
  // Phase 1 scoped the CRM records; phase 2 added companies themselves,
  // roles, numbering, integrations and invoice lines.
  await backfillOnce(
    sequelize,
    'multi-company-backfill',
    tables.filter((t) => t !== 'companies')
  );
  await backfillOnce(sequelize, 'multi-company-phase2', tables);

  for (const [table, column] of PER_COMPANY_UNIQUE) {
    await makeUniquePerCompany(sequelize, table, column);
  }

  // Every tenant needs a company code to sign in with.
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "companies_code_unique" ON "companies" (LOWER("code")) WHERE "code" IS NOT NULL;`
  );
  const withoutCode = await runUnscoped(() =>
    Company.findAll({ where: { [Op.and]: [where(col(TENANT_FIELD), Op.eq, col('id')), { code: null }] }, order: [['id', 'ASC']] })
  );
  for (const company of withoutCode) {
    const code = await generateCompanyCode(company.name);
    await runUnscoped(() => company.update({ code }));
    logger.info(`[tenancy] Company #${company.id} "${company.name}" got company code "${code}".`);
  }
};
