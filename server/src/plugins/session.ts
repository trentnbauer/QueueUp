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
    // Set only while linking a Steam account to an already-signed-in user (see /auth/steam/link
    // in auth.ts) - marks the callback as "attach to this existing user" instead of a normal
    // sign-in/account-creation.
    linkTargetUserId?: string;
    // Set once, right after account creation (issue #359) - GET /api/me reads and immediately
    // clears this so the frontend's "auto-open Import Library for a new account" only ever fires
    // on that account's very first /api/me call, not every subsequent one in the same session.
    isNewAccount?: boolean;
  }
}

/** `secure: true` whenever production is configured for https, so a proxy that doesn't forward
 * X-Forwarded-Proto (or a TRUST_PROXY mistake) can't make the session cookie fail open (issue
 * #923). Otherwise 'auto', i.e. follow the request's protocol (plain-HTTP local/dev setups). */
export function sessionCookieSecure(opts: { nodeEnv?: string; appBaseUrl: string; allowInsecure: boolean }): boolean | 'auto' {
  if (opts.allowInsecure || opts.nodeEnv !== 'production') return 'auto';
  return opts.appBaseUrl.toLowerCase().startsWith('https:') ? true : 'auto';
}

export default fp(async function sessionPlugin(app: FastifyInstance) {
  await app.register(cookie);
  await app.register(fastifySession, {
    secret: env.SESSION_SECRET,
    store: new RedisSessionStore(),
    cookieName: 'sq_session',
    // Only persist sessions that were actually written to (login, OAuth state, link target). The
    // default (true) wrote a 30-day Redis key for every cookie-less request - including the
    // 15s /healthz probe - which an anonymous client could use to fill the shared Redis.
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // true in production with an https APP_BASE_URL; otherwise 'auto', which checks
      // request.protocol when each cookie is set. Behind a TLS-terminating proxy this container
      // only sees plain HTTP - Fastify's trustProxy option (see TRUST_PROXY) makes
      // request.protocol reflect X-Forwarded-Proto, so Secure is only sent once TLS is confirmed.
      secure: sessionCookieSecure({ nodeEnv: process.env.NODE_ENV, appBaseUrl: env.APP_BASE_URL, allowInsecure: !!env.ALLOW_INSECURE_SESSION_COOKIE }),
      maxAge: SESSION_TTL_SECONDS * 1000,
    },
  });
});
