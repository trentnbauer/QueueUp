import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { getConfigValue } from '../services/configResolver.js';

/** A GA4 measurement id is G- followed by letters and digits. Anything else is ignored rather than
 * handed to the browser, since it ends up in a script URL. */
const GA_ID = /^G-[A-Z0-9]{4,20}$/;

/** APP_VERSION/APP_SHA are baked into the image at build time (see docker/Dockerfile.server and
 * .github/workflows/build-docker-image.yml) - unset outside that image (e.g. local `npm run dev`),
 * where 'dev' is a fine, unambiguous stand-in. No auth required - this is meant to be checkable by
 * anyone looking at a deployment, not just signed-in users. */
export default async function versionRoutes(app: FastifyInstance) {
  app.get('/api/version', { config: { rateLimit: false } }, async () => {
    return {
      version: process.env.APP_VERSION ?? 'dev',
      sha: process.env.APP_SHA ?? null,
    };
  });

  // Public: the web app asks this on load to decide whether to start Google Analytics at all.
  app.get('/api/analytics-config', async () => {
    const id = (await getConfigValue('GA_MEASUREMENT_ID', env.GA_MEASUREMENT_ID))?.trim().toUpperCase();
    return { gaMeasurementId: id && GA_ID.test(id) ? id : null };
  });
}
