import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({ prisma: {} }));
vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));

import { buildPricePrompt, computePriceFacts, hasEnoughHistory, parsePriceReply } from './aiPriceAdvice.js';

const day = 24 * 60 * 60 * 1000;
const start = new Date('2026-01-01T00:00:00Z').getTime();
const pts = (amounts: number[]) => amounts.map((amount, i) => ({ at: new Date(start + i * 10 * day), amount }));
const now = new Date(start + 100 * day);

describe('computePriceFacts', () => {
  it('summarises history without inventing anything', () => {
    const f = computePriceFacts(pts([30, 30, 20, 30, 30, 18]), 18, 'USD', 15, now);
    expect(f).toMatchObject({ currency: 'USD', current: 18, usual: 30, lowestRecorded: 18, historicalLow: 15, points: 6, spanDays: 50, drops: 2 });
    // 18 is the lowest ever, so it was never this low before.
    expect(f.daysSinceAsLow).toBeNull();
  });

  it('counts the days since the price was last at or below today\'s', () => {
    // 25 now; the last earlier reading at or under 25 was the 20 on day 20, so 80 days before day 100.
    expect(computePriceFacts(pts([30, 30, 20, 30, 30, 25]), 25, 'USD', null, now).daysSinceAsLow).toBe(80);
  });

  it('has no usual price or span with a single reading', () => {
    const f = computePriceFacts(pts([20]), 20, 'USD', null, now);
    expect(f).toMatchObject({ usual: null, spanDays: 0, drops: 0, daysSinceAsLow: null });
  });
});

describe('hasEnoughHistory', () => {
  it('needs several readings spread over at least two weeks', () => {
    expect(hasEnoughHistory(computePriceFacts(pts([30, 30, 20]), 20, 'USD', null, now))).toBe(false);
    expect(hasEnoughHistory(computePriceFacts(pts([30, 30, 30, 20, 30]), 30, 'USD', null, now))).toBe(true);
  });
});

describe('parsePriceReply', () => {
  const facts = computePriceFacts(pts([30, 30, 20, 30, 30, 28]), 28, 'USD', 15, now);

  it('keeps a sane target for "wait"', () => {
    expect(parsePriceReply('{"verdict":"wait","summary":" It usually drops. ","targetPrice":20.004}', facts)).toEqual({ verdict: 'wait', summary: 'It usually drops.', suggestedTarget: 20 });
  });

  it('drops a target that is not under the current price or is absurdly low', () => {
    expect(parsePriceReply('{"verdict":"wait","summary":"x","targetPrice":28}', facts)?.suggestedTarget).toBeNull();
    expect(parsePriceReply('{"verdict":"wait","summary":"x","targetPrice":1}', facts)?.suggestedTarget).toBeNull();
    expect(parsePriceReply('{"verdict":"wait","summary":"x","targetPrice":"20"}', facts)?.suggestedTarget).toBeNull();
  });

  it('never keeps a target for "buy" or "unclear"', () => {
    expect(parsePriceReply('{"verdict":"buy","summary":"Good price.","targetPrice":20}', facts)?.suggestedTarget).toBeNull();
    expect(parsePriceReply('{"verdict":"unclear","summary":"x","targetPrice":20}', facts)?.suggestedTarget).toBeNull();
  });

  it('rejects an unknown verdict, a missing summary and non-JSON', () => {
    expect(parsePriceReply('{"verdict":"maybe","summary":"x"}', facts)).toBeNull();
    expect(parsePriceReply('{"verdict":"buy","summary":"  "}', facts)).toBeNull();
    expect(parsePriceReply('buy it', facts)).toBeNull();
  });
});

describe('buildPricePrompt', () => {
  it('lists the numbers and says unknown for what is missing', () => {
    const p = buildPricePrompt(computePriceFacts(pts([30, 30, 30, 20, 30]), 30, 'USD', null, now));
    expect(p).toContain('Current price: 30.00 USD');
    expect(p).toContain('All-time low (gg.deals): unknown');
    expect(p).toContain('dropped by 10% or more 1 time(s)');
  });
});
