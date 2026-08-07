import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME as string,
  process.env.DB_USERNAME as string,
  process.env.DB_PASSWORD as string,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: 'postgres',
    logging: false,
    pool: {
      // Sequelize's default max is only 5 — far too low for real production
      // traffic. Tune via env vars per instance/DB tier; these are sane
      // starting points for a small-to-mid size deployment.
      max: Number(process.env.DB_POOL_MAX) || 20,
      min: Number(process.env.DB_POOL_MIN) || 0,
      acquire: Number(process.env.DB_POOL_ACQUIRE_MS) || 30000, // fail fast instead of hanging requests
      idle: Number(process.env.DB_POOL_IDLE_MS) || 10000,
    },
  }
);

export default sequelize;