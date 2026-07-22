import { describe, it, expect } from 'vitest';
import { completedAtOrNull } from './steamCompletionDetection.js';
import type { SteamAchievementCounts, SteamUnlockedAchievement } from './steamLibrary.js';

function unlocked(...unlockTimes: number[]): SteamUnlockedAchievement[] {
  return unlockTimes.map((unlockTime, i) => ({ apiname: `ach_${i}`, displayName: `Achievement ${i}`, unlockTime }));
}

describe('completedAtOrNull', () => {
  it('returns null when Steam has nothing to report (private profile or no achievements)', () => {
    expect(completedAtOrNull(null, [])).toBeNull();
  });

  it('returns null when the game defines no achievements', () => {
    const counts: SteamAchievementCounts = { unlocked: 0, total: 0 };
    expect(completedAtOrNull(counts, [])).toBeNull();
  });

  it('returns null when some but not all achievements are unlocked', () => {
    const counts: SteamAchievementCounts = { unlocked: 2, total: 5 };
    expect(completedAtOrNull(counts, unlocked(100, 200))).toBeNull();
  });

  it('returns the latest unlock time when every achievement is unlocked', () => {
    const counts: SteamAchievementCounts = { unlocked: 3, total: 3 };
    expect(completedAtOrNull(counts, unlocked(300, 100, 200))).toBe(300);
  });

  it('returns null if counts say fully unlocked but no unlock records are actually present (defensive)', () => {
    const counts: SteamAchievementCounts = { unlocked: 3, total: 3 };
    expect(completedAtOrNull(counts, [])).toBeNull();
  });
});
