import cookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { redis } from '../services/redisClient.js';
import { env } from '../config/env.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_KEY_PREFIX = 'sess:';

class RedisSessionStore {
  get(sessionId: string, callback: (err: unknown, session?: any) => void): void {
    redis
      .get(SESSION_KEY_PREFIX + sessionId)
      .then((raw) => callback(null, raw ? JSON.parse(raw) : null))
      .catch((err) => callback(err));
  }

  set(sessionId: string, session: unknown, callback: (err?: unknown) => void): void {
    redis
      .set(SESSION_KEY_PREFIX + sessionId, JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
      .then(() => callback())
      .catch((err) => callback(err));
  }

  destroy(sessionId: string, callback: (err?: unknown) => void): void {
    redis
      .del(SESSION_KEY_PREFIX + sessionId)
      .then(() => callback())
      .catch((err) => callback(err));
  }
}

declare module 'fastify' {
  interface Session {
    userId?: string;
    // In-flight login attempt state, shared by whichever provider the user is currently
    // signing in with (only one flow can be in progress per browser session at a time).
    authState?: string;
    authCodeVerifier?: string;
  }
}

export default fp(async function sessionPlugin(app: FastifyInstance) {
  await app.register(cookie);
  await app.register(fastifySession, {
    secret: env.SESSION_SECRET,
    store: new RedisSessionStore(),
    cookieName: 'sq_session',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS * 1000,
    },
  });
});
