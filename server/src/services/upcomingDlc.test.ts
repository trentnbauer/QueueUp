import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('./igdbClient.js', () => ({ getUpcomingGameDlcs: vi.fn() }));
vi.mock('./priceService.js', () => ({ mapWithConcurrency: vi.fn() }));

import { pickUpcomingDlc, type UpcomingDlcSource } from './upcomingDlc.js';

const dlc = (igdbId: number, releaseDate: string) => ({ igdbId, title: `DLC ${igdbId}`, platform: 'PC', coverImageUrl: null, releaseYear: 2026, releaseDate });
const sources: UpcomingDlcSource[] = [
  { baseGameId: 'g1', baseGameTitle: 'Base One', dlcs: [dlc(11, '2026-11-20T00:00:00.000Z'), dlc(12, '2026-11-02T00:00:00.000Z')] },
  { baseGameId: 'g2', baseGameTitle: 'Base Two', dlcs: [dlc(12, '2026-11-02T00:00:00.000Z'), dlc(21, '2026-11-10T00:00:00.000Z')] },
];

describe('pickUpcomingDlc', () => {
  it('lists every DLC soonest first, with the base game it belongs to', () => {
    const out = pickUpcomingDlc(sources, new Set(), new Set());
    expect(out.map((d) => [d.igdbId, d.baseGameTitle])).toEqual([
      [12, 'Base One'],
      [21, 'Base Two'],
      [11, 'Base One'],
    ]);
  });

  it('leaves out DLC already on the shelf (any status) and ignored DLC', () => {
    expect(pickUpcomingDlc(sources, new Set([12]), new Set([21])).map((d) => d.igdbId)).toEqual([11]);
  });

  it('lists a DLC once even when two base games point at it', () => {
    expect(pickUpcomingDlc(sources, new Set(), new Set()).filter((d) => d.igdbId === 12)).toHaveLength(1);
  });

  it('is empty when nothing is coming', () => {
    expect(pickUpcomingDlc([{ baseGameId: 'g', baseGameTitle: 'B', dlcs: [] }], new Set(), new Set())).toEqual([]);
  });
});
