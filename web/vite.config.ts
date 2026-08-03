import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Mirrors server/src/config/env.ts's BASE_PATH transform (issue #438) - kept in sync by hand since
// this runs in a separate process/language runtime from the server, not by import.
function normalizeBasePath(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '/') return '';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = normalizeBasePath(env.BASE_PATH);

  // Dev-only mirror of the runtime injection server/src/plugins/static.ts performs in production -
  // so a contributor testing sub-path hosting locally exercises the same client code path prod
  // does, not a second one. `apply: 'serve'` means this plugin is a complete no-op during
  // `vite build` - the built dist/index.html is never touched by it, preserving the constraint
  // that BASE_PATH stays a docker-run-time (not build-time) value in the actual production
  // artifact. Injected unconditionally (even at basePath === '') for the same route-depth-safety
  // reason as the production version - see static.ts's comment.
  const devBasePathInjection: Plugin = {
    name: 'dev-base-path-injection',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace('<head>', `<head>\n    <base href="${basePath}/" />`)
        .replace(
          '<script type="module" src="/src/main.tsx"></script>',
          `<script>window.__QUEUEUP_BASE_PATH__ = ${JSON.stringify(basePath)};</script>\n    ` +
            `<script type="module" src="/src/main.tsx"></script>`,
        );
    },
  };

  return {
    plugins: [react(), devBasePathInjection],
    // Permanent, not derived from BASE_PATH (issue #438) - the published image's web/dist is baked
    // at `docker build` time, before BASE_PATH is known at container start, so every asset URL
    // must be relative and resolved at runtime against the <base href> the server injects
    // (server/src/plugins/static.ts) instead. Left as Vite's own default ('/') in dev - a relative
    // base is documented to fall back to '/' there anyway, and dev's BASE_PATH story is carried
    // entirely by the plugin + proxy below instead.
    base: mode === 'production' ? './' : '/',
    server: {
      port: 5173,
      proxy: {
        [`${basePath}/api`]: 'http://localhost:3000',
        [`${basePath}/auth`]: 'http://localhost:3000',
      },
    },
  };
});
