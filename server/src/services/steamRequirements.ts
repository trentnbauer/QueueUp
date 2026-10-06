import type { GameRequirements, SteamRequirementSet } from '@queueup/shared';
import { redis } from './redisClient.js';
import { fetchSteamPcRequirements } from './steamStorage.js';

/** Steam's minimum and recommended PC requirements for a game (#1045), parsed into labelled lines
 * (Processor, Memory, Graphics, Storage, ...) with the raw text kept as a fallback for pages that are not
 * laid out that way. There is no "will it run" verdict: it is shown next to the person's own specs. */

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&reg;': '®', '&trade;': '™' };

/** Plain text from a requirements HTML block: one line per list item / line break. */
function toLines(html: string): string[] {
  return html
    .slice(0, 20_000)
    .replace(/<br\s*\/?>|<\/li>|<\/p>|<\/ul>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|reg|trade|#39);/g, (m) => ENTITIES[m] ?? m)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const LABEL = /^([A-Za-z][A-Za-z ./-]{0,30}?)\s*\*?\s*:\s*(.+)$/;

/** GB of memory in a line like "8 GB RAM" or "512 MB", or null. */
export function parseMemoryGb(value: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(tb|gb|mb)\b/i.exec(value);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const gb = unit === 'tb' ? n * 1024 : unit === 'gb' ? n : n / 1024;
  return Math.round(gb * 100) / 100;
}

/** One block (minimum or recommended) as labelled lines. Null when there is nothing in it. */
export function parseRequirementSet(html: string | null | undefined): SteamRequirementSet | null {
  if (!html) return null;
  const lines: SteamRequirementSet['lines'] = [];
  const plain: string[] = [];
  for (const line of toLines(html)) {
    // The "Minimum:" / "Recommended:" heading on its own is not a requirement.
    if (/^(minimum|recommended)\s*:?$/i.test(line)) continue;
    const m = LABEL.exec(line);
    if (m) lines.push({ label: m[1].trim(), value: m[2].trim() });
    else plain.push(line);
  }
  const text = [...lines.map((l) => `${l.label}: ${l.value}`), ...plain].join('\n').slice(0, 4000);
  if (!text) return null;
  const memory = lines.find((l) => /^(memory|ram|system memory)$/i.test(l.label));
  return { lines, text, memoryGb: memory ? parseMemoryGb(memory.value) : null };
}

/** The parsed requirements, or null when neither block has anything. */
export function parseRequirements(raw: { minimum?: string; recommended?: string }): GameRequirements | null {
  const minimum = parseRequirementSet(raw.minimum);
  const recommended = parseRequirementSet(raw.recommended);
  return minimum || recommended ? { minimum, recommended } : null;
}

const DAY = 24 * 60 * 60;
const keyOf = (appId: number) => `steam:requirements:${appId}`;

/** Requirements for a Steam app, cached for a week (a day when Steam lists none, so a newly added
 * page is picked up). Throws when Steam cannot be reached. */
export async function getSteamRequirements(appId: number): Promise<GameRequirements | null> {
  try {
    const cached = await redis.get(keyOf(appId));
    if (cached) return (JSON.parse(cached) as { requirements: GameRequirements | null }).requirements;
  } catch {
    /* an unreadable cache entry is just fetched again */
  }
  const raw = await fetchSteamPcRequirements(appId);
  const requirements = raw ? parseRequirements(raw) : null;
  await redis.set(keyOf(appId), JSON.stringify({ requirements }), 'EX', requirements ? 7 * DAY : DAY).catch(() => undefined);
  return requirements;
}
