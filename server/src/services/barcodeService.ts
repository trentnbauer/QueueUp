import type { BarcodeGameMatch } from '@queueup/shared';
import { env } from '../config/env.js';
import { getConfigValue } from './configResolver.js';
import { getGameDetail, platformFamilies } from './igdbClient.js';

const SCANDEX_BASE_URL = 'https://scandex.gamery.app/api/v2';

interface ScanDexLookupResponse {
  id: number;
  source: string;
  igdb_metadata?: {
    id: number;
    name: string;
    platform?: { id: number; name: string };
  };
}

/** Looks up a scanned physical-game UPC/EAN barcode via ScanDex (issue #402) - a third-party
 * database mapping barcodes to IGDB ids + platform, so "scan a box" can resolve straight to the
 * same igdbId every other add-a-game path already keys on. Returns null when ScanDex has no match
 * for this barcode, or when SCANDEX_API_KEY isn't configured - this is an optional integration
 * (see configResolver.ts), unlike gg.deals/IGDB which the app can't run without; an unset key just
 * means the camera-scan option isn't available, not a broken app. */
export async function lookupBarcodeGame(barcode: string): Promise<BarcodeGameMatch | null> {
  const apiKey = await getConfigValue('SCANDEX_API_KEY', env.SCANDEX_API_KEY);
  if (!apiKey) return null;

  const url = new URL(`${SCANDEX_BASE_URL}/lookup`);
  url.searchParams.set('value', barcode);

  const response = await fetch(url, { headers: { Authorization: apiKey } });
  if (!response.ok) {
    // 404 just means "not in ScanDex's database" - a normal, expected outcome for an obscure or
    // regional title, not worth logging as an error. Anything else (bad key, ScanDex outage) is.
    if (response.status !== 404) {
      const bodyText = await response.text().catch(() => '');
      console.error(`[barcodeService] ScanDex lookup failed (${response.status}) for barcode ${barcode}: ${bodyText.slice(0, 300)}`);
    }
    return null;
  }

  const body = (await response.json()) as ScanDexLookupResponse;
  const igdbId = body.igdb_metadata?.id;
  if (!igdbId) return null;

  // Re-resolves full detail (cover/release year) from IGDB directly rather than trusting
  // ScanDex's own cached fields - the same source of truth every other add-a-game path uses, and
  // confirms the igdbId is still valid on IGDB's side.
  const detail = await getGameDetail(igdbId);
  const scandexPlatformName = body.igdb_metadata?.platform?.name;
  const matchedFamilies = platformFamilies(scandexPlatformName ? [{ name: scandexPlatformName }] : []);

  return {
    igdbId: detail.igdbId,
    title: detail.title,
    platform: scandexPlatformName ?? detail.platform,
    coverImageUrl: detail.coverImageUrl,
    releaseYear: detail.releaseYear,
    matchedPlatform: matchedFamilies[0] ?? null,
  };
}
