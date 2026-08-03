import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In the production image this file runs from dist/plugins/static.js; web/dist is copied alongside dist/.
const webDistPath = path.resolve(__dirname, '../../web-dist');

/**
 * Vite's production build is permanently `base: './'` (web/vite.config.ts) - baked in at
 * `docker build` time, before BASE_PATH is known (issue #438: the published ghcr.io image can't
 * rebuild per-deployment, so BASE_PATH has to be a container-*start*-time value). Every asset URL
 * in the built index.html is therefore relative ("./assets/index-xyz.js"), resolved by the
 * browser against an explicit <base> element rather than the current URL - that's what makes
 * assets resolve correctly at any request depth (e.g. a hard refresh on /queueup/join/ABC123, or
 * even plain /join/ABC123 at root hosting) and at any BASE_PATH, decided here at container start.
 *
 * The <base> tag (and the window.__QUEUEUP_BASE_PATH__ global beside it - the single source every
 * client-side consumer reads via web/src/utils/basePath.ts) is injected UNCONDITIONALLY, even when
 * BASE_PATH is '' (rendering <base href="/">). Relative asset URLs are not route-depth-safe
 * without it even at root: /join/ABC123 would otherwise resolve "./assets/x.js" to
 * "/join/assets/x.js" and 404, regardless of BASE_PATH.
 */
function renderIndexHtml(): string {
  const raw = readFileSync(path.join(webDistPath, 'index.html'), 'utf-8');
  const basePath = env.BASE_PATH; // '' or e.g. '/queueup' - already normalized, see config/env.ts
  const injected =
    `<base href="${basePath}/" />\n    ` + `<script>window.__QUEUEUP_BASE_PATH__ = ${JSON.stringify(basePath)};</script>`;
  return raw.replace('<head>', `<head>\n    ${injected}`);
}

export default async function staticPlugin(app: FastifyInstance) {
  // Computed once here at registration/boot time, not per-request.
  const indexHtml = renderIndexHtml();

  await app.register(fastifyStatic, {
    root: webDistPath,
    wildcard: false,
    // index.html is excluded from fastifyStatic's own file glob entirely. With wildcard: false,
    // @fastify/static (confirmed by reading its source, v9.3.0) still globs every file under root
    // and auto-registers explicit GET routes for BOTH the literal "/index.html" path AND "/" (its
    // directory-index route, driven by opts.index defaulting to ['index.html']), serving them
    // straight off disk - completely bypassing the cached, <base>-injected string above for
    // exactly the one request (a fresh load of the app's own root) this feature most needs to get
    // right. globIgnore removes index.html from that glob, so it is served exclusively via the
    // setNotFoundHandler below, uniformly for "/", "/index.html", and every SPA deep link.
    globIgnore: ['index.html'],
  });

  app.setNotFoundHandler((request, reply) => {
    const basePath = env.BASE_PATH;
    const pathname = request.url.split('?')[0];
    // Prefixed with basePath, not a bare literal - inside the prefixed scope (see app.ts), a bad
    // API call's request.url genuinely starts with `${basePath}/api`, and a hardcoded check would
    // miss it, returning this HTML fallback instead of a JSON 404 for a bad API/auth path.
    if (pathname.startsWith(`${basePath}/api`) || pathname.startsWith(`${basePath}/auth`)) {
      reply.status(404).send({ error: 'Not found' });
      return;
    }
    reply.type('text/html').send(indexHtml);
  });
}
