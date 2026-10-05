// Pure logic for the manual/"forced" price refresh cooldown (issue #67) - kept free of any
// redis/IO so it's trivially unit-testable. priceService.ts pairs this with the actual
// last-forced-refresh timestamp stored in Redis.

// 2 hours (issue #863): a game's price is never force-refreshed more than once in that time, which
// together with the 6h cache and ggDealsLimits.ts keeps QueueUp inside gg.deals' hourly quota.
export const FORCED_REFRESH_COOLDOWN_MS = 2 * 60 * 60 * 1000;

/** Milliseconds until a forced refresh is allowed again, given the last forced-refresh
 * timestamp (epoch ms) and "now". Zero or negative means it's allowed right now. */
export function cooldownRemainingMs(lastForcedAtMs: number, now: number = Date.now()): number {
  return FORCED_REFRESH_COOLDOWN_MS - (now - lastForcedAtMs);
}

/** User-facing message for a still-cooling-down refresh attempt. Rounds up to the nearest
 * minute so it never reads "in 0 minutes". */
export function formatCooldownMessage(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `Price was already refreshed recently — try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
