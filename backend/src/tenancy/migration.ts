import { QueryTypes, Sequelize } from 'sequelize';
import Company from '../models/Company';
import logger from '../utils/logger';
import { runUnscoped } from './context';
import { TENANT_FIELD, TENANT_MODELS } from './scoping';

/**
 * The company that owns everything created before multi-company support:
 * the Settings > Company record this install has always used (the oldest
 * row), created as "My Company" on a brand-new install.
 */
export const getDefaultCompanyId = async (): Promise<number> =>
  runUnscoped(async () => {
    const existing = await Company.findOne({ order: [['id', 'ASC']], attributes: ['id'] });
    if (existing) return existing.id;
    const created = await Company.create({ name: 'My Company', currency: 'INR', isActive: true });
    return created.id;
  });

const BACKFILL_MARKER = 'multi-company-backfill';

/**
 * Runs on every boot, after sequelize.sync(), and is safe to repeat:
 *  1. adds the companyId column + index to every company-owned table
 *     (production boots don't alter-sync, so new columns need this);
 *  2. once per database, moves every existing record under the default
 *     company, so the current team keeps seeing all its data unchanged.
 */
export const runTenancyMigration = async (sequelize: Sequelize): Promise<void> => {
  const tables = TENANT_MODELS.map((model) => model.getTableName() as string);

  for (const table of tables) {
    await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${TENANT_FIELD}" INTEGER;`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS "${table}_company_id" ON "${table}" ("${TENANT_FIELD}");`);
  }

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "app_migrations" ("name" VARCHAR(100) PRIMARY KEY, "ranAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());`
  );
  const done = await sequelize.query(`SELECT 1 FROM "app_migrations" WHERE "name" = :name`, {
    replacements: { name: BACKFILL_MARKER },
    type: QueryTypes.SELECT,
  });
  if (done.length) return;

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
    await sequelize.query(`INSERT INTO "app_migrations" ("name") VALUES (:name);`, {
      replacements: { name: BACKFILL_MARKER },
      transaction,
    });
  });
  logger.info(`[tenancy] Existing records now belong to company #${companyId}.`);
};
