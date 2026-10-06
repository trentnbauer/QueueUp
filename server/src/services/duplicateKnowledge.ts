import { prisma } from '../db/client.js';
import { igdbPairKey } from './duplicateCandidates.js';

/** What the server already knows about whether two games are the same, from other people, so the AI
 * is not asked again (issue: share merge data to skip AI compute). Everything here is about pairs of
 * IGDB games, never about who owns what: only counts of distinct people, and the AI's own verdicts,
 * are shared. Three sources:
 *  - merges: two cards of the same pair that enough *other* people merged (it is their own shelf,
 *    but the pair is public knowledge: "Witcher 3" and its Complete Edition),
 *  - "not duplicates": a pair enough other people said are different, and nobody merged,
 *  - AI verdicts: a pair the AI already judged (for anyone), good for a while. */

/** How many other people must have merged a pair before it is suggested to someone without asking the AI. */
export const COMMUNITY_MIN_USERS = 2;
/** Likewise for "these are not duplicates". */
export const COMMUNITY_MIN_DISMISSALS = 2;
/** How long an AI verdict is trusted before the pair is judged again (models and titles change). */
export const VERDICT_MAX_AGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CommunityMerge {
  /** Distinct other people who merged this pair. */
  users: number;
  /** The igdbId most of them kept (the base game / earlier release they merged into). */
  keepIgdbId: number;
}

export interface CachedVerdict {
  same: boolean;
  keepIgdbId: number | null;
  confidence: number | null;
  reason: string | null;
}

export interface DuplicateKnowledge {
  merges: Map<string, CommunityMerge>;
  /** Pairs enough other people said are different (and nobody merged). */
  notDuplicates: Set<string>;
  verdicts: Map<string, CachedVerdict>;
}

const orderedPair = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

/** Decides, from raw vote rows, which pairs are community merges: at least `minUsers` distinct people,
 * with the kept side chosen by majority (ties go to the lower igdbId, an earlier entry). */
export function tallyMerges(rows: { igdbIdLow: number; igdbIdHigh: number; keepIgdbId: number }[], minUsers = COMMUNITY_MIN_USERS): Map<string, CommunityMerge> {
  const tally = new Map<string, { total: number; keeps: Map<number, number> }>();
  for (const r of rows) {
    const key = igdbPairKey(r.igdbIdLow, r.igdbIdHigh);
    const t = tally.get(key) ?? { total: 0, keeps: new Map<number, number>() };
    t.total += 1;
    t.keeps.set(r.keepIgdbId, (t.keeps.get(r.keepIgdbId) ?? 0) + 1);
    tally.set(key, t);
  }
  const out = new Map<string, CommunityMerge>();
  for (const [key, t] of tally) {
    if (t.total < minUsers) continue;
    const keep = [...t.keeps.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    out.set(key, { users: t.total, keepIgdbId: keep });
  }
  return out;
}

/** The shared knowledge about every pair among `igdbIds` (one person's shelf), left out of `userId`'s
 * own votes (they already know their own opinion). */
export async function loadDuplicateKnowledge(userId: string, igdbIds: number[], now = Date.now()): Promise<DuplicateKnowledge> {
  const ids = [...new Set(igdbIds)];
  if (ids.length < 2) return { merges: new Map(), notDuplicates: new Set(), verdicts: new Map() };
  const among = { igdbIdLow: { in: ids }, igdbIdHigh: { in: ids } };
  const [voteRows, dismissalRows, verdictRows] = await Promise.all([
    prisma.duplicateMergeVote.findMany({ where: { ...among, userId: { not: userId } }, select: { igdbIdLow: true, igdbIdHigh: true, keepIgdbId: true } }),
    prisma.duplicateDismissal.findMany({ where: { ...among, userId: { not: userId } }, select: { igdbIdLow: true, igdbIdHigh: true } }),
    prisma.duplicateVerdict.findMany({ where: { ...among, judgedAt: { gte: new Date(now - VERDICT_MAX_AGE_DAYS * DAY_MS) } } }),
  ]);
  const merges = tallyMerges(voteRows);

  // Everyone who merged a pair also counts against "nobody merged": any merge vote at all beats dismissals.
  const merged = new Set(voteRows.map((r) => igdbPairKey(r.igdbIdLow, r.igdbIdHigh)));
  const dismissCounts = new Map<string, number>();
  for (const d of dismissalRows) {
    const key = igdbPairKey(d.igdbIdLow, d.igdbIdHigh);
    dismissCounts.set(key, (dismissCounts.get(key) ?? 0) + 1);
  }
  const notDuplicates = new Set([...dismissCounts].filter(([key, n]) => n >= COMMUNITY_MIN_DISMISSALS && !merged.has(key)).map(([key]) => key));

  const verdicts = new Map<string, CachedVerdict>();
  for (const v of verdictRows) verdicts.set(igdbPairKey(v.igdbIdLow, v.igdbIdHigh), { same: v.same, keepIgdbId: v.keepIgdbId, confidence: v.confidence, reason: v.reason });
  return { merges, notDuplicates, verdicts };
}

/** Remembers what the AI decided about pairs, for everyone. Best effort: a failure here must never
 * break the scan that produced them. */
export async function saveVerdicts(
  rows: { igdbIdA: number; igdbIdB: number; same: boolean; keepIgdbId?: number | null; confidence?: number | null; reason?: string | null }[],
): Promise<void> {
  if (!rows.length) return;
  try {
    await prisma.$transaction(
      rows.map((r) => {
        const [igdbIdLow, igdbIdHigh] = orderedPair(r.igdbIdA, r.igdbIdB);
        const data = { same: r.same, keepIgdbId: r.keepIgdbId ?? null, confidence: r.confidence ?? null, reason: r.reason ?? null, judgedAt: new Date() };
        return prisma.duplicateVerdict.upsert({ where: { igdbIdLow_igdbIdHigh: { igdbIdLow, igdbIdHigh } }, create: { igdbIdLow, igdbIdHigh, ...data }, update: data });
      }),
    );
  } catch (err) {
    console.error('[duplicateKnowledge] could not save AI verdicts', err);
  }
}
