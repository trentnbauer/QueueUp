declare global {
  interface Window {
    /** Set once, synchronously, by a classic (non-module) inline <script> the server injects into
     * index.html at boot (server/src/plugins/static.ts) - or, in dev, by vite.config.ts's dev-only
     * html-transform plugin. Classic scripts run before deferred `type="module"` scripts, so this
     * is always set before any app code that reads it runs. */
    __QUEUEUP_BASE_PATH__?: string;
  }
}

/** Single source of truth for every client-side consumer of BASE_PATH (issue #438) - the fetch
 * client (api/client.ts), the router's basename (main.tsx), and the handful of call sites that
 * build /auth or /api URLs outside the fetch client. Returns '' at root hosting (the default);
 * every caller can unconditionally string-concatenate without an empty-string special case. */
export function getBasePath(): string {
  return window.__QUEUEUP_BASE_PATH__ ?? '';
}
