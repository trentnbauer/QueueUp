import { aiComplete } from './aiConfig.js';
import { extractJson } from './aiJson.js';
import { MIN_POINTS_FOR_USUAL, usualPrice, type PricePoint } from '../priceHistory.js';
import type { AiFallbackNotice, AiPriceAdvice, AiPriceVerdict } from '@queueup/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY_LENGTH = 400;

/** The numbers the advice is built from. All come from the app's own price data; the AI only explains them. */
export interface PriceFacts {
  currency: string;
  current: number;
  /** The middle of the recorded prices, null with too few points. */
  usual: number | null;
  /** Lowest price QueueUp has recorded. */
  lowestRecorded: number | null;
  /** gg.deals' all-time low, when known. */
  historicalLow: number | null;
  points: number;
  /** Days from the first to the last recorded point. */
  spanDays: number;
  /** How many times the price dropped by at least 10% from one reading to the next. */
  drops: number;
  /** Days since the price was last at or below the current price (null if it never was before now). */
  daysSinceAsLow: number | null;
}

/** Pure: reduces a price history to the facts above. Never invents data: a missing value is null. */
export function computePriceFacts(points: PricePoint[], current: number, currency: string, historicalLow: number | null, now: Date = new Date()): PriceFacts {
  const spanDays = points.length > 1 ? Math.round((points[points.length - 1].at.getTime() - points[0].at.getTime()) / DAY_MS) : 0;
  let drops = 0;
  for (let i = 1; i < points.length; i++) if (points[i].amount <= points[i - 1].amount * 0.9) drops++;
  const earlier = points.slice(0, -1).filter((p) => p.amount <= current);
  const lastAsLow = earlier.length ? earlier[earlier.length - 1].at : null;
  return {
    currency,
    current,
    usual: usualPrice(points),
    lowestRecorded: points.length ? Math.min(...points.map((p) => p.amount)) : null,
    historicalLow,
    points: points.length,
    spanDays,
    drops,
    daysSinceAsLow: lastAsLow ? Math.round((now.getTime() - lastAsLow.getTime()) / DAY_MS) : null,
  };
}

/** There has to be enough history to say anything honest; otherwise no AI call is made. */
export function hasEnoughHistory(f: PriceFacts): boolean {
  return f.points >= MIN_POINTS_FOR_USUAL && f.spanDays >= 14;
}

const SYSTEM = `You explain a game's price history to someone deciding whether to buy now or wait.
You are given computed numbers (current price, usual price, lowest recorded, all-time low, how often it dropped). Use ONLY those numbers; never state any other price, date or sale. You cannot predict sales, so word everything as a suggestion, for example "waiting may pay off", never "it will go on sale".
Pick a verdict: "buy" (the current price is at or near the lowest, or clearly below usual), "wait" (it is well above usual or the lowest and has dropped before), or "unclear".
If the verdict is "wait", you may suggest a target price for a price alert: a number between the lowest recorded price and the current price. Otherwise use null.
Reply with ONLY JSON: {"verdict": "buy" | "wait" | "unclear", "summary": "<one or two plain sentences>", "targetPrice": <number or null>}.`;

export function buildPricePrompt(f: PriceFacts): string {
  const n = (v: number | null) => (v === null ? 'unknown' : `${v.toFixed(2)} ${f.currency}`);
  return [
    `Current price: ${n(f.current)}`,
    `Usual price (median of recorded prices): ${n(f.usual)}`,
    `Lowest recorded: ${n(f.lowestRecorded)}`,
    `All-time low (gg.deals): ${n(f.historicalLow)}`,
    `Recorded for ${f.spanDays} days over ${f.points} readings; dropped by 10% or more ${f.drops} time(s).`,
    `Days since the price was last at or below today's: ${f.daysSinceAsLow ?? 'never before'}`,
  ].join('\n');
}

const VERDICTS: AiPriceVerdict[] = ['buy', 'wait', 'unclear'];

/** Validates the reply. The target price is only kept for "wait", and only when it is a real number
 * under the current price and not lower than half the lowest price known, so a wild number cannot
 * become an alert. */
export function parsePriceReply(text: string, f: PriceFacts): { verdict: AiPriceVerdict; summary: string; suggestedTarget: number | null } | null {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') return null;
  const { verdict, summary, targetPrice } = parsed as { verdict?: unknown; summary?: unknown; targetPrice?: unknown };
  if (typeof verdict !== 'string' || !(VERDICTS as string[]).includes(verdict)) return null;
  if (typeof summary !== 'string' || !summary.trim()) return null;
  const lows = [f.lowestRecorded, f.historicalLow].filter((v): v is number => v !== null && v > 0);
  const floor = lows.length ? Math.min(...lows) * 0.5 : 0;
  const target = typeof targetPrice === 'number' && Number.isFinite(targetPrice) ? Math.round(targetPrice * 100) / 100 : null;
  const ok = verdict === 'wait' && target !== null && target > 0 && target < f.current && target >= floor;
  return { verdict: verdict as AiPriceVerdict, summary: summary.trim().slice(0, MAX_SUMMARY_LENGTH), suggestedTarget: ok ? target : null };
}

/** Buy-or-wait advice for one game (issue #829). Returns without calling the AI when there is not
 * enough price history to judge. */
export async function aiPriceAdvice(
  userId: string,
  roomId: string | undefined,
  points: PricePoint[],
  current: number,
  currency: string,
  historicalLow: number | null,
): Promise<{ advice: AiPriceAdvice; fallback: AiFallbackNotice | null }> {
  const facts = computePriceFacts(points, current, currency, historicalLow);
  const base = { currency, current, usual: facts.usual, lowestRecorded: facts.lowestRecorded, historicalLow };
  if (!hasEnoughHistory(facts)) return { advice: { enoughHistory: false, ...base, verdict: null, summary: null, suggestedTarget: null }, fallback: null };

  const res = await aiComplete({ system: SYSTEM, messages: [{ role: 'user', content: buildPricePrompt(facts) }], maxTokens: 400, temperature: 0.2 }, { userId, roomId });
  const parsed = parsePriceReply(res.text, facts);
  if (!parsed) return { advice: { enoughHistory: true, ...base, verdict: 'unclear', summary: null, suggestedTarget: null }, fallback: res.fallback };
  return { advice: { enoughHistory: true, ...base, ...parsed }, fallback: res.fallback };
}
