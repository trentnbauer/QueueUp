import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  // Without this, ioredis won't reject a command until it exhausts its own internal
  // retry/backoff strategy, which can take well over a minute during an outage - and since Redis
  // backs the session store, that hangs *every* request (not just the ones that explicitly use
  // Redis), because @fastify/session's onRequest hook loads the session on every request. This
  // bounds each command so a Redis outage fails fast instead of stalling the whole app.
  commandTimeout: 5000,
});

// ioredis logs an unhandled rejection warning if nothing listens for 'error' —
// this just routes connection issues to stderr as a plain log line instead.
redis.on('error', (err) => {
  console.error('[redis]', err.message);
});
