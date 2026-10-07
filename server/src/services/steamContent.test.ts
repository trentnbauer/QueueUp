import { describe, expect, it, vi } from 'vitest';

vi.mock('./redisClient.js', () => ({ redis: { get: vi.fn(), set: vi.fn() } }));

import { isSteamAdultOnly } from './steamContent.js';

describe('isSteamAdultOnly', () => {
  it('is true only when the page carries Adult Only Sexual Content (3)', () => {
    expect(isSteamAdultOnly([1, 3, 5, 4])).toBe(true); // HuniePop
    expect(isSteamAdultOnly([3])).toBe(true);
  });

  it('is false for mainstream games with some nudity or mature content', () => {
    expect(isSteamAdultOnly([1, 5])).toBe(false); // The Witcher 3
    expect(isSteamAdultOnly([1, 2, 5])).toBe(false); // Cyberpunk 2077, Baldur's Gate 3
    expect(isSteamAdultOnly([2, 5])).toBe(false);
    expect(isSteamAdultOnly([])).toBe(false);
  });

  it('is false for anything that is not a list of ids', () => {
    expect(isSteamAdultOnly(undefined)).toBe(false);
    expect(isSteamAdultOnly(null)).toBe(false);
    expect(isSteamAdultOnly('3')).toBe(false);
  });
});
