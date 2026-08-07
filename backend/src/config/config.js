// Config file for sequelize-cli (the `npm run migrate` script). This is
// separate from database.ts (which the app itself uses) because sequelize-cli
// requires a plain JS/JSON config it can load without ts-node. Keep the same
// env vars as database.ts so the CLI always talks to the same database as the app.
require('dotenv').config();

const base = {
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  dialect: 'postgres',
  logging: false,
};

module.exports = {
  development: base,
  test: base,
  production: base,
};
