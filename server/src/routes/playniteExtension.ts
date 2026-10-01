import type { FastifyInstance } from 'fastify';

const REPO = 'trentnbauer/QueueUpPlayniteExtension';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const CACHE_MS = 60 * 60 * 1000;

let cached: { url: string; at: number } | null = null;

/** The download URL of the latest release's .pext. The asset name carries the version
 * (QueueUpExporter_v0.8.0.pext), so a fixed releases/latest/download/<name> link would break on the
 * next release - this asks GitHub which file is current. Cached for an hour; any failure falls back
 * to the releases page, so the link never dead-ends. */
export async function latestPextUrl(now: number = Date.now(), fetchImpl: typeof fetch = fetch): Promise<string> {
  if (cached && now - cached.at < CACHE_MS) return cached.url;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'QueueUp' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const body = (await res.json()) as { assets?: { name?: string; browser_download_url?: string }[] };
      const asset = body.assets?.find((a) => a.name?.toLowerCase().endsWith('.pext') && a.browser_download_url);
      if (asset?.browser_download_url) {
        cached = { url: asset.browser_download_url, at: now };
        return cached.url;
      }
    }
  } catch {
    /* fall through to the releases page */
  }
  return RELEASES_PAGE;
}

/** GET /api/playnite-extension: 302 straight to the extension's .pext download. Public (no
 * sign-in needed) - it only ever points at a public GitHub release asset. */
export default async function playniteExtensionRoutes(app: FastifyInstance) {
  app.get('/api/playnite-extension', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (_request, reply) => {
    return reply.redirect(await latestPextUrl());
  });
}
