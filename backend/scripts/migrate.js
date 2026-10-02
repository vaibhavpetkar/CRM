// Wrapper around `sequelize-cli db:migrate` (the `npm run migrate` script).
//
// The base schema isn't created by a migration: the server builds every
// table from the models with sequelize.sync() on boot, and the migrations in
// ../migrations only patch an existing schema (the first one that needs a
// table, create-notifications, references "users"). So migrating an empty
// database used to die with `relation "users" does not exist`.
//
// On an empty database there is nothing to migrate yet: the server's first
// boot creates the full, current schema. This script detects that case,
// says so, and exits cleanly instead of failing halfway through.
const { spawnSync } = require('child_process');
const path = require('path');
const { Client } = require('pg');

const env = process.env.NODE_ENV || 'development';
const config = require(path.resolve(__dirname, '..', 'src', 'config', 'config.js'))[env];

const runCli = () => {
  const cli = require.resolve('sequelize-cli/lib/sequelize');
  const result = spawnSync(process.execPath, [cli, 'db:migrate', ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });
  process.exit(result.status === null ? 1 : result.status);
};

const main = async () => {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
  });
  await client.connect();
  const { rows } = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS "exists"`);
  await client.end();

  if (!rows[0].exists) {
    console.log(
      'Fresh database: no tables yet, so there is nothing to migrate.\n' +
        'Start the server once (it creates the full schema), then run `npm run migrate` again.'
    );
    process.exit(0);
  }
  runCli();
};

main().catch((err) => {
  console.error('migrate: could not check the database:', err.message);
  process.exit(1);
});
