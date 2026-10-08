import type { AiServerUsageSummary } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import type { AiResponse } from './providers.js';

/** The calendar month a use counts towards, "YYYY-MM" in UTC. */
export const usageMonth = (d: Date = new Date()): string => d.toISOString().slice(0, 7);

/** Adds one answered call of the server's own AI to the person's total for this month. Never throws:
 * failing to count must not fail the AI call the person is waiting on. */
export async function recordServerAiUsage(userId: string, usage: AiResponse['usage'] | undefined): Promise<void> {
  try {
    const inputTokens = Math.max(0, Math.round(usage?.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.round(usage?.outputTokens ?? 0));
    const month = usageMonth();
    await prisma.serverAiUsage.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, requests: 1, inputTokens, outputTokens },
      update: { requests: { increment: 1 }, inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
    });
  } catch (err) {
    console.error('[ai-usage] could not record a server AI use', err instanceof Error ? err.message : err);
  }
}

/** Whole months from `from` to `to` ("YYYY-MM"), counting both ends. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

const previousMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/** This month's use, and the average over the finished months since the person first used the
 * server's AI (months without any use count as 0). The average is null until a month has finished,
 * since a part-month would drag it down. */
export function summarizeServerAiUsage(
  rows: { month: string; requests: number; inputTokens: number; outputTokens: number }[],
  now: Date = new Date(),
): AiServerUsageSummary {
  const current = usageMonth(now);
  const thisMonth = rows.find((r) => r.month === current);
  const past = rows.filter((r) => r.month < current);
  const first = past.reduce<string | null>((min, r) => (min === null || r.month < min ? r.month : min), null);
  const months = first ? monthsBetween(first, previousMonth(current)) : 0;
  const pastTokens = past.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
  const pastRequests = past.reduce((sum, r) => sum + r.requests, 0);
  return {
    tokensThisMonth: thisMonth ? thisMonth.inputTokens + thisMonth.outputTokens : 0,
    requestsThisMonth: thisMonth?.requests ?? 0,
    avgTokensPerMonth: months > 0 ? Math.round(pastTokens / months) : null,
    avgRequestsPerMonth: months > 0 ? Math.round(pastRequests / months) : null,
  };
}

/** One person's summary, read fresh (for a single user row in Administrator settings). */
export async function serverAiUsageFor(userId: string, now: Date = new Date()): Promise<AiServerUsageSummary> {
  const rows = await prisma.serverAiUsage.findMany({ where: { userId }, select: { month: true, requests: true, inputTokens: true, outputTokens: true } });
  return summarizeServerAiUsage(rows, now);
}
