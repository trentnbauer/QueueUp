import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sessionPlugin from './plugins/session.js';
import authPlugin from './plugins/auth.js';
import staticPlugin from './plugins/static.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import gameRoutes from './routes/games.js';
import gameSuggestionRoutes from './routes/gameSuggestions.js';
import roomSpinRoutes from './routes/roomSpin.js';
import tagRoutes from './routes/tags.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import adminBackupRoutes from './routes/adminBackups.js';
import playniteExtensionRoutes from './routes/playniteExtension.js';
import healthRoutes from './routes/health.js';
import versionRoutes from './routes/version.js';
import apiV1Routes from './routes/apiV1.js';
import pendingLibraryImportRoutes from './routes/pendingLibraryImports.js';
import playniteCompletionSuggestionRoutes from './routes/playniteCompletionSuggestions.js';
import badgeRoutes from './routes/badges.js';
import publicProfileRoutes from './routes/publicProfile.js';
import friendRoutes from './routes/friends.js';
import { env } from './config/env.js';
import { redis } from './services/redisClient.js';
import { logCaptureStream } from './services/logBuffer.js';

export async function buildApp() {
  // logger: { stream: ... } instead of the plain `logger: true` shorthand - same default pino
  // behavior (JSON lines to stdout, `docker logs` unaffected), but also captures recent lines in
  // memory so the admin log-export endpoint (issue #192, routes/admin.ts) works without needing
  // shell/Docker access to the running container.
  const app = Fastify({
    logger: { stream: logCaptureStream },
    // A numeric TRUST_PROXY (hop count) is still valid at runtime, but newer Fastify typings
    // no longer list `number` in this overload, hence the cast.
    trustProxy: env.TRUST_PROXY as boolean | string,
  });

  // new URL(...).origin, not the raw env.APP_BASE_URL string (issue #438 drive-by fix) - the
  // browser's Origin request header is always scheme+host+port, never a path, so once
  // APP_BASE_URL can carry a path (sub-path hosting) the raw-string comparison silently stops
  // matching and @fastify/cors just omits Access-Control-Allow-Origin rather than rejecting
  // anything server-side - a latent bug for any deployment whose APP_BASE_URL already has a path.
  await app.register(cors, { origin: new URL(env.APP_BASE_URL).origin, credentials: true });
  // gzip/brotli for responses over 1KB. A shelf of a few thousand games is several MB of JSON
  // uncompressed (see MAX_GAMES_PER_LIST in routes/games.ts) and compresses to a fraction of that.
  await app.register(compress, { threshold: 1024 });
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
        // fonts.gstatic.com serves the font files the stylesheet above points at.
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'"],
        // The "Watch trailer" player embeds YouTube (privacy-enhanced domain, no cookies until play).
        frameSrc: ["'self'", 'https://www.youtube-nocookie.com'],
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

  // Docker's HEALTHCHECK (docker/Dockerfile.server) and docker-compose.prod.yml's healthcheck:
  // both curl this container-internally at a fixed http://localhost:3000/healthz, unrelated to
  // any externally-visible BASE_PATH (issue #438) - must stay reachable there regardless, so it's
  // registered at Fastify root, outside the prefixed block below. Do not move this inside.
  await app.register(healthRoutes);

  // Every other route - the whole app - lives inside this single prefix wrapper (issue #438), so
  // the container is reachable at exactly one mount point (BASE_PATH, e.g. "/queueup", or
  // Fastify root when unset - prefix: '' is a documented no-op for register(), so this block is
  // inert for every existing deployment). That's what lets a reverse proxy in front just plain
  // proxy_pass with no path-rewrite - the container is fully self-contained about which path it
  // answers on.
  await app.register(
    async (instance) => {
      await instance.register(versionRoutes);
      await instance.register(authRoutes);
      await instance.register(roomRoutes);
      await instance.register(gameRoutes);
      await instance.register(gameSuggestionRoutes);
      await instance.register(roomSpinRoutes);
      await instance.register(tagRoutes);
      await instance.register(notificationRoutes);
      await instance.register(adminRoutes);
      await instance.register(adminBackupRoutes);
      await instance.register(playniteExtensionRoutes);
      await instance.register(pendingLibraryImportRoutes);
      await instance.register(playniteCompletionSuggestionRoutes);
      await instance.register(badgeRoutes);
      await instance.register(publicProfileRoutes);
      await instance.register(friendRoutes);
      // Bearer-token-authenticated, scoped under its own prefix and preHandler (see apiV1.ts) -
      // registered as a distinct plugin, not folded into gameRoutes/roomRoutes, so its auth hook
      // can never leak onto any cookie-authenticated route above. Fastify combines nested
      // prefixes, so this ends up at BASE_PATH + /api/v1.
      await instance.register(apiV1Routes, { prefix: '/api/v1' });

      if (process.env.NODE_ENV === 'production') {
        await instance.register(staticPlugin);
      }
    },
    { prefix: env.BASE_PATH },
  );

  return app;
}
