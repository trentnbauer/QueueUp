import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sessionPlugin from './plugins/session.js';
import authPlugin from './plugins/auth.js';
import staticPlugin from './plugins/static.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import gameRoutes from './routes/games.js';
import adminRoutes from './routes/admin.js';
import { env } from './config/env.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: env.APP_BASE_URL, credentials: true });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // React's style={{...}} props compile to inline style="" attributes, which CSP treats
        // as inline styles regardless of source - 'unsafe-inline' is required for the app to render.
        // fonts.googleapis.com serves the @font-face CSS for the header font (web/index.html).
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https://images.igdb.com'],
        connectSrc: ["'self'"],
      },
    },
  });
  await app.register(sessionPlugin);
  await app.register(authPlugin);

  await app.register(authRoutes);
  await app.register(roomRoutes);
  await app.register(gameRoutes);
  await app.register(adminRoutes);

  if (process.env.NODE_ENV === 'production') {
    await app.register(staticPlugin);
  }

  return app;
}
