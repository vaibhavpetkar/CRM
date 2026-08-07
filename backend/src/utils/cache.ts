import Redis from 'ioredis';
import logger from './logger';
import type { Request, Response, NextFunction } from 'express';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Separate connection from the Socket.IO adapter's pub/sub clients — this one
// is used purely as a cache-aside store for expensive read queries
// (dashboard stats, list views), so a client with no key events / retry noise.
let client: Redis | null = null;
let connectionFailed = false;

const getClient = (): Redis | null => {
  if (connectionFailed) return null;
  if (client) return client;

  client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 3) {
        connectionFailed = true;
        logger.error(`Cache: giving up connecting to Redis at ${redisUrl} — caching disabled, falling back to direct queries.`);
        return null; // stop retrying
      }
      return Math.min(times * 200, 1000);
    },
    lazyConnect: false,
  });

  client.on('error', (err) => {
    // ioredis logs on every failed command otherwise; keep it to one line.
    if (!connectionFailed) logger.error(`Cache Redis error: ${err.message}`);
  });

  return client;
};

/**
 * Cache-aside helper for expensive reads (dashboard aggregates, list queries).
 * Falls back to calling `fn` directly — with no caching — if Redis is down,
 * so a Redis outage degrades performance instead of taking down the API.
 *
 * @param key Cache key, should include any params that affect the result
 *   (e.g. `deals:stats`, `leads:list:${page}:${limit}:${status}`).
 * @param ttlSeconds How long the cached value is considered fresh. Short TTLs
 *   (15-60s) are the right tradeoff for dashboards: readers get a fast
 *   response, and any given write is reflected everywhere within one TTL
 *   window without needing per-write invalidation wiring.
 */
export async function getOrSetCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const redis = getClient();
  if (!redis) return fn();

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.error(`Cache read failed for key "${key}": ${err}`);
    return fn();
  }

  const fresh = await fn();

  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlSeconds);
  } catch (err) {
    logger.error(`Cache write failed for key "${key}": ${err}`);
  }

  return fresh;
}

/** Deletes every key matching a prefix — use after a write to force fresh data on next read. */
export async function invalidateCache(prefix: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  try {
    const stream = redis.scanStream({ match: `${prefix}*`, count: 100 });
    const keysToDelete: string[] = [];
    for await (const keys of stream) {
      keysToDelete.push(...(keys as string[]));
    }
    if (keysToDelete.length) await redis.del(...keysToDelete);
  } catch (err) {
    logger.error(`Cache invalidation failed for prefix "${prefix}": ${err}`);
  }
}

/**
 * Express middleware that caches a route's JSON response. Drop-in for
 * read-only GET endpoints (stats, lists) — doesn't touch the controller body.
 * Skips caching (passes straight through) for any request carrying query
 * params not accounted for by `keyFn`, so callers must include every param
 * that affects the result in the generated key.
 */
export function cacheRoute(keyFn: (req: Request) => string, ttlSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const redis = getClient();
    if (!redis) return next();

    const key = keyFn(req);

    try {
      const cached = await redis.get(key);
      if (cached !== null) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }
    } catch (err) {
      logger.error(`Cache read failed for key "${key}": ${err}`);
      return next();
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis.set(key, JSON.stringify(body), 'EX', ttlSeconds).catch((err) =>
          logger.error(`Cache write failed for key "${key}": ${err}`)
        );
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}
