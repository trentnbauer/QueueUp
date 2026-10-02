import type { GamePrice } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** How long price points are kept. */
export const PRICE_HISTORY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
/** A price this close to the lowest ever recorded, or this far under the usual price, is a good time to buy. */
export const NEAR_LOW_FACTOR = 1.05;
export const BELOW_USUAL_FACTOR = 0.8;
/** The "usual price" needs at least this many recorded points to mean anything. */
export const MIN_POINTS_FOR_USUAL = 5;

export interface PricePoint {
  at: Date;
  amount: number;
}

/** The middle value of the recorded prices: what the game usually costs, unaffected by short spikes
 * or one-day sales. Null with fewer than `minPoints` points. */
export function usualPrice(points: { amount: number }[], minPoints = MIN_POINTS_FOR_USUAL): number | null {
  if (points.length < minPoints) return null;
  const sorted = points.map((p) => p.amount).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Whether `amount` is a good time to buy given what's been recorded and gg.deals' all-time low: at
 * or within 5% of the lowest price known, or at least 20% under the usual price. Returns why, or null. */
export function goodTimeReason(
  amount: number,
  history: { amount: number }[],
  historicalLow: number | null,
): 'near_low' | 'below_usual' | null {
  // Our own recorded lows only count once there is enough history to trust (a first reading is
  // trivially the lowest); gg.deals' all-time low always counts.
  const own = history.length >= MIN_POINTS_FOR_USUAL ? history.map((p) => p.amount) : [];
  const lows = [historicalLow, ...own].filter((v): v is number => v !== null && v > 0);
  const lowest = lows.length ? Math.min(...lows) : null;
  if (lowest !== null && amount <= lowest * NEAR_LOW_FACTOR) return 'near_low';
  const usual = usualPrice(history);
  if (usual !== null && amount <= usual * BELOW_USUAL_FACTOR) return 'below_usual';
  return null;
}

/** Writes a price point for each app whose live price changed since the last one stored (per
 * currency). One query to read the latest points, one to write the new ones. */
export async function recordPricePoints(prices: Map<number, GamePrice>): Promise<number> {
  const live = [...prices].filter(([, p]) => p.source === 'live' && p.amount && p.currency && Number(p.amount) > 0);
  if (live.length === 0) return 0;

  const latest = await prisma.priceHistory.findMany({
    where: { steamAppid: { in: live.map(([id]) => id) } },
    orderBy: { recordedAt: 'desc' },
    distinct: ['steamAppid', 'currency'],
    select: { steamAppid: true, currency: true, amount: true },
  });
  const last = new Map(latest.map((r) => [`${r.steamAppid}|${r.currency}`, r.amount]));

  const fresh = live
    .filter(([id, p]) => last.get(`${id}|${p.currency}`) !== Number(p.amount))
    .map(([id, p]) => ({ steamAppid: id, currency: p.currency as string, amount: Number(p.amount) }));
  if (fresh.length === 0) return 0;
  await prisma.priceHistory.createMany({ data: fresh });
  return fresh.length;
}

export async function prunePriceHistory(): Promise<void> {
  await prisma.priceHistory.deleteMany({ where: { recordedAt: { lt: new Date(Date.now() - PRICE_HISTORY_RETENTION_MS) } } });
}

/** Recorded prices for an app in one currency, oldest first. */
export async function getPriceHistory(steamAppid: number, currency: string): Promise<PricePoint[]> {
  const rows = await prisma.priceHistory.findMany({
    where: { steamAppid, currency },
    orderBy: { recordedAt: 'asc' },
    select: { recordedAt: true, amount: true },
  });
  return rows.map((r) => ({ at: r.recordedAt, amount: r.amount }));
}
