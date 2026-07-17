import type { FastifyInstance } from 'fastify';

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
}
