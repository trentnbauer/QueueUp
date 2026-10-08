import Fastify, { LogController } from 'fastify';
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
import duplicateSuggestionRoutes from './routes/duplicateSuggestions.js';
import upcomingDlcRoutes from './routes/upcomingDlc.js';
import aiTonightRoutes from './routes/aiTonight.js';
import aiRecommendRoutes from './routes/aiRecommend.js';
import aiBacklogCoachRoutes from './routes/aiBacklogCoach.js';
import aiSearchRoutes from './routes/aiSearch.js';
import yearStoryRoutes from './routes/yearStory.js';
import roomRecapRoutes from './routes/roomRecap.js';
import roomSpinRoutes from './routes/roomSpin.js';
import roomSystemsRoutes from './routes/roomSystems.js';
import journalRoutes from './routes/journal.js';
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
import playTogetherRoutes from './routes/playTogether.js';
import feedReactionRoutes from './routes/feedReactions.js';
import notificationPreferenceRoutes from './routes/notificationPreferences.js';
import alertEmailRoutes from './routes/alertEmail.js';
import aiSettingsRoutes from './routes/aiSettings.js';
import xboxRoutes from './routes/xbox.js';
import exophaseRoutes from './routes/exophase.js';
import psnRoutes from './routes/psn.js';
import libraryLimitsRoutes from './routes/libraryLimits.js';
import analyticsConsentRoutes from './routes/analyticsConsent.js';
import retroAchievementsRoutes from './routes/retroachievements.js';
import activityVisibilityRoutes from './routes/activityVisibility.js';
import autoHideAdultRoutes from './routes/autoHideAdult.js';
import computerSpecsRoutes from './routes/computerSpecs.js';
import accountEventRoutes from './routes/accountEvents.js';
import { env } from './config/env.js';
import { redis } from './services/redisClient.js';
import { logCaptureStream } from './services/logBuffer.js';
import { setAppLogger } from './services/appLogger.js';
import { isCrossOriginWrite } from './util/crossOrigin.js';

/** Requests slower than this are logged even with per-request logging off (see LOG_REQUESTS). */
const SLOW_REQUEST_MS = 2000;

export async function buildApp() {
  // logger: { stream: ... } instead of the plain `logger: true` shorthand - same default pino
  // behavior (JSON lines to stdout, `docker logs` unaffected), but also captures recent lines in
  // memory so the admin log-export endpoint (issue #192, routes/admin.ts) works without needing
  // shell/Docker access to the running container.
  const app = Fastify({
    logger: { stream: logCaptureStream, level: env.LOG_LEVEL },
    // Per-request "incoming request"/"request completed" lines are off unless LOG_REQUESTS=true;
    // the onResponse hook below logs only the requests worth seeing (see LOG_LEVEL in env.ts).
    logController: new LogController({ disableRequestLogging: !env.LOG_REQUESTS }),
    // A numeric TRUST_PROXY (hop count) is still valid at runtime, but newer Fastify typings
    // no longer list `number` in this overload, hence the cast.
    trustProxy: env.TRUST_PROXY as boolean | string | string[],
  });
  setAppLogger(app.log);

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
        // Cloudflare Turnstile's widget script (the sign-in captcha, issue #665, when it's set up).
        // googletagmanager.com / google-analytics.com: Google Analytics, only loaded when the operator
        // sets a measurement id (see /api/analytics-config).
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://www.googletagmanager.com'],
        connectSrc: ["'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
        // The "Watch trailer" player embeds YouTube (privacy-enhanced domain, no cookies until play);
        // Turnstile's challenge runs in a Cloudflare iframe.
        frameSrc: ["'self'", 'https://www.youtube-nocookie.com', 'https://challenges.cloudflare.com'],
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
  if (!env.LOG_REQUESTS) {
    app.addHook('onResponse', async (request, reply) => {
      const ms = reply.elapsedTime;
      if (reply.statusCode === 429 || ms >= SLOW_REQUEST_MS) {
        request.log.warn(
          // Sign-in callbacks carry OAuth/OpenID codes and state in the query string, and this log
          // line ends up in the admin log export - keep only the path for /auth/*.
          { method: request.method, url: request.url.startsWith('/auth/') ? request.url.split('?')[0] : request.url, statusCode: reply.statusCode, responseTime: Math.round(ms) },
          reply.statusCode === 429 ? 'rate limited' : 'slow request',
        );
      }
    });
  }

  // Routes destructure request.body directly, so a write with no body (or a bare JSON null/number/
  // string) would throw a TypeError and come back as a 500. Normalising it to an empty object lets
  // each route's own "X is required" check answer with a 400 instead.
  app.addHook('preValidation', async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD' && (request.body == null || typeof request.body !== 'object')) {
      request.body = {};
    }
  });

  // CSRF backstop on top of the SameSite=Lax session cookie - see isCrossOriginWrite.
  const appOrigin = new URL(env.APP_BASE_URL).origin;
  const apiV1Prefix = `${env.BASE_PATH}/api/v1/`;
  app.addHook('onRequest', async (request, reply) => {
    if (isCrossOriginWrite(request.method, request.headers.origin, request.url, appOrigin, apiV1Prefix)) {
      return reply.status(403).send({ error: 'Cross-origin request refused' });
    }
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
      await instance.register(duplicateSuggestionRoutes);
      await instance.register(upcomingDlcRoutes);
      await instance.register(aiTonightRoutes);
      await instance.register(aiRecommendRoutes);
      await instance.register(aiBacklogCoachRoutes);
      await instance.register(aiSearchRoutes);
      await instance.register(yearStoryRoutes);
      await instance.register(roomRecapRoutes);
      await instance.register(roomSpinRoutes);
      await instance.register(roomSystemsRoutes);
      await instance.register(journalRoutes);
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
      await instance.register(playTogetherRoutes);
      await instance.register(notificationPreferenceRoutes);
      await instance.register(alertEmailRoutes);
      await instance.register(aiSettingsRoutes);
      await instance.register(xboxRoutes);
      await instance.register(exophaseRoutes);
      await instance.register(psnRoutes);
      await instance.register(libraryLimitsRoutes);
      await instance.register(analyticsConsentRoutes);
      await instance.register(retroAchievementsRoutes);
      await instance.register(activityVisibilityRoutes);
      await instance.register(autoHideAdultRoutes);
      await instance.register(computerSpecsRoutes);
      await instance.register(accountEventRoutes);
      await instance.register(feedReactionRoutes);
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
