import { describe, expect, it } from 'vitest';
import { DEFAULT_DISCORD_EVENTS, DISCORD_EVENT_KEYS, resolveDiscordEvents } from './types.js';

describe('resolveDiscordEvents', () => {
  it('falls back to the defaults for null / junk', () => {
    expect(resolveDiscordEvents(null)).toEqual(DEFAULT_DISCORD_EVENTS);
    expect(resolveDiscordEvents('nope')).toEqual(DEFAULT_DISCORD_EVENTS);
  });

  it('overlays stored booleans on the defaults and ignores non-booleans / unknown keys', () => {
    const out = resolveDiscordEvents({ votes: true, added: false, spins: 'yes', bogus: true });
    expect(out.votes).toBe(true);
    expect(out.added).toBe(false);
    expect(out.spins).toBe(DEFAULT_DISCORD_EVENTS.spins);
    expect(Object.keys(out).sort()).toEqual([...DISCORD_EVENT_KEYS].sort());
  });

  it('ships the design defaults: votes and member activity off, the rest on', () => {
    const off = DISCORD_EVENT_KEYS.filter((k) => !DEFAULT_DISCORD_EVENTS[k]);
    expect(off.sort()).toEqual(['memberAct', 'votes']);
  });
});
