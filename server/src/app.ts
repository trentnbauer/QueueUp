import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sessionPlugin from './plugins/session.js';
import authPlugin from './plugins/auth.js';
import staticPlugin from './plugins/static.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import gameRoutes from './routes/games.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import healthRoutes from './routes/health.js';
import versionRoutes from './routes/version.js';
import { env } from './config/env.js';
import { redis } from './services/redisClient.js';

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: env.TRUST_PROXY });

  await app.register(cors, { origin: env.APP_BASE_URL, credentials: true });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // React's style={{...}} props compile to inline style="" attributes, which CSP treats
        // as inline styles regardless of source - 'unsafe-inline' is required for the app to render.
        // fonts.googleapis.com serves the @font-face CSS for the header font (web/index.html).
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        // Profile pictures come from whichever sign-in provider is configured (Discord's CDN,
        // Google's, Steam's, or an arbitrary self-hosted OIDC provider's) - there's no fixed set of
        // hosts to allowlist, so any HTTPS image source is allowed rather than an allowlist that
        // silently breaks avatars every time a provider serves images from a new domain.
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  });
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    redis,
    // Without this, a Redis outage doesn't just disable rate limiting - the store's lookup hangs
    // (ioredis won't reject until it exhausts its own retry/backoff, which can take well over a
    // minute) and blocks *every* request behind it, since rate limiting runs on every route.
    // Skipping the check on a store error trades "rate limiting momentarily off" for "the app
    // still responds," which is the right trade during a dependency outage.
    skipOnError: true,
  });
  await app.register(sessionPlugin);
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(versionRoutes);
  await app.register(authRoutes);
  await app.register(roomRoutes);
  await app.register(gameRoutes);
  await app.register(notificationRoutes);
  await app.register(adminRoutes);

  if (process.env.NODE_ENV === 'production') {
    await app.register(staticPlugin);
  }

  return app;
}
