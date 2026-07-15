import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { redis } from '../services/redisClient.js';

const CHECK_TIMEOUT_MS = 3000;

// A health check must always respond quickly and definitively, even if a dependency is
// completely unreachable. ioredis in particular won't reject a command promise until it's
// exhausted its own internal retry/backoff strategy, which can take well over a minute during an
// outage - without this timeout, the endpoint would hang instead of promptly reporting unhealthy.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Racing past `promise` doesn't cancel it - it keeps running and will eventually settle on its
  // own. If it later rejects with nothing else awaiting it, that's an unhandled rejection (which
  // can crash the process on modern Node) - this .catch swallows that late rejection harmlessly.
  promise.catch(() => {});
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
}

/** Used by Docker/orchestration to know if the app is actually serving traffic, not just that the
 * process exists. Checks both dependencies directly rather than trusting connection-pool state,
 * since a pool can look "connected" while the underlying service is actually unreachable. */
export default async function healthRoutes(app: FastifyInstance) {
  app.get('/healthz', { config: { rateLimit: false } }, async (_request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};
    let healthy = true;

    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS);
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      healthy = false;
    }

    try {
      await withTimeout(redis.ping(), CHECK_TIMEOUT_MS);
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      healthy = false;
    }

    reply.status(healthy ? 200 : 503);
    return { status: healthy ? 'ok' : 'error', checks };
  });
}
