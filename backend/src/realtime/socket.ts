import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt, { JwtPayload } from 'jsonwebtoken';
import logger from '../utils/logger';

let io: SocketIOServer | null = null;

interface AuthedSocket extends Socket {
  userId?: number;
}

/**
 * Initializes Socket.IO on top of the existing HTTP server and wires it to Redis
 * via the pub/sub adapter, so notifications broadcast correctly even when the
 * backend is scaled across multiple Node processes/instances.
 *
 * Falls back to a single-process, in-memory Socket.IO server (no Redis) if
 * REDIS_URL can't be reached, so local dev without Redis still works — just
 * without cross-instance fan-out.
 */
export const initRealtime = async (httpServer: HttpServer): Promise<SocketIOServer> => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [clientUrl, 'http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
    },
    // WebSocket-only — see the matching comment in frontend/lib/socket.ts for
    // why this avoids needing sticky sessions with PM2 cluster mode / multiple
    // instances behind a load balancer.
    transports: ['websocket'],
  });

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));
    logger.info(`🔌 Realtime notifications connected to Redis at ${redisUrl}`);

    pubClient.on('error', (err) => logger.error(`Redis (pub) error: ${err}`));
    subClient.on('error', (err) => logger.error(`Redis (sub) error: ${err}`));
  } catch (error) {
    logger.error(
      `⚠️  Could not connect to Redis at ${redisUrl} — realtime notifications will only work ` +
        `within a single server instance. Set REDIS_URL to enable multi-instance fan-out. (${error})`
    );
  }

  // Authenticate each socket connection with the same JWT used for the REST API.
  io.use((socket: AuthedSocket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization || '').replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
      socket.userId = Number(decoded.id);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    if (!socket.userId) {
      socket.disconnect();
      return;
    }

    // Each user gets their own room so we can target notifications precisely,
    // even if they have the app open in multiple tabs/devices.
    socket.join(`user:${socket.userId}`);

    socket.on('disconnect', () => {
      // no-op — room membership is cleaned up automatically by Socket.IO
    });
  });

  return io;
};

/**
 * Pushes a real-time event to a specific user's room. Safe to call even if
 * realtime hasn't been initialized (e.g. in tests) — it just no-ops.
 */
export const emitToUser = (userId: number | null | undefined, event: string, payload: unknown) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
};

export const getIO = () => io;
