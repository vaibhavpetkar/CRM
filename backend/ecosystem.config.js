module.exports = {
  apps: [
    {
      name: 'crm-backend',
      script: 'dist/server.js',
      cwd: __dirname,
      // Cluster mode spins up one worker per CPU core and load-balances
      // requests across them. Safe here because sessions are stateless (JWT)
      // and Socket.IO is backed by the Redis adapter + is WebSocket-only
      // (see src/realtime/socket.ts), so it doesn't matter which worker a
      // given request/socket lands on — no sticky sessions needed.
      exec_mode: 'cluster',
      instances: 'max',
      // dotenv (called in server.ts) loads .env from `cwd` above at runtime,
      // so REDIS_URL, DB_*, JWT_SECRET etc. all come from that file — nothing
      // needs to be duplicated here. `env_production` just ensures NODE_ENV
      // is set correctly regardless of how the process is started.
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
    },
  ],
};
